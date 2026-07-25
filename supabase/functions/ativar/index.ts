// supabase/functions/ativar/index.ts
// Edge Function: valida acesso do aluno e retorna módulos ativos.
//
// PRIVACIDADE: esta função é chamada com a anon key, que é pública por desenho
// (vai dentro do pacote npm). Qualquer pessoa pode chamá-la com qualquer
// e-mail. Três defesas, que só funcionam juntas:
//
//   1. Resposta única `acesso_negado` para todo caso de acesso negado, para o
//      corpo da resposta não dizer se o e-mail existe.
//   2. Tempo de resposta constante, para o relógio não dizer o que o corpo
//      calou (uma busca que falha cedo é mais rápida que uma que percorre
//      status, validade e módulos).
//   3. Rate limit por IP, para varrer uma lista de e-mails não ser viável.
//
// Mexer em qualquer uma delas sem as outras reabre a enumeração.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Tempo fixo de toda resposta. O timeout do CLI é 15s — cabe com folga. */
const TEMPO_RESPOSTA_MS = 2000

const RATE_LIMITE = 10
const RATE_JANELA = '1 hour'

Deno.serve(async (req) => {
  // Preflight não passa pelo tempo constante: não consulta nada, não tem o que
  // vazar, e atrasá-lo só tornaria o CLI lento sem ganho nenhum.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const t0 = Date.now()

  /**
   * Toda saída passa por aqui. Espera o que faltar para fechar
   * TEMPO_RESPOSTA_MS; se a requisição já demorou mais que isso, responde na
   * hora. Vale inclusive para `rate_limit` e `erro_interno`: um caminho de erro
   * rápido é, ele próprio, um sinal de que o e-mail não existe.
   */
  const responder = async (body: unknown, status = 200) => {
    const restante = TEMPO_RESPOSTA_MS - (Date.now() - t0)
    if (restante > 0) await new Promise((r) => setTimeout(r, restante))

    return new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  /** A mesma resposta para: e-mail inexistente, suspenso, cancelado, vencido e
   *  limite de máquinas estourado. Indistinguíveis byte a byte. */
  const acessoNegado = () => responder({ ok: false, motivo: 'acesso_negado' }, 200)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // -----------------------------------------------------------------------
    // 0. Rate limit — antes de qualquer consulta, para que nem o custo de uma
    //    varredura recaia sobre o banco.
    // -----------------------------------------------------------------------
    const ip = ipDoRequest(req)

    const { data: limite, error: erroLimite } = await supabase
      .rpc('consumir_rate_limit', {
        p_ip: ip,
        p_limite: RATE_LIMITE,
        p_janela: RATE_JANELA,
      })

    if (erroLimite) {
      // Falha ABERTA de propósito. Se o banco está fora, a busca do usuário
      // logo abaixo também falha e devolve erro_interno para todo mundo — não
      // há sinal para o atacante extrair. Fechar aqui transformaria uma
      // instabilidade do banco em bloqueio total de ativações.
      console.error('rate limit indisponível, seguindo sem ele:', erroLimite)
    } else if (limite?.[0] && limite[0].permitido === false) {
      return await responder({ ok: false, motivo: 'rate_limit' }, 429)
    }

    // -----------------------------------------------------------------------
    // 1. Payload
    // -----------------------------------------------------------------------
    const body = await req.json()
    const { email, codigo, device_id, versao_cli, so } = body

    if (!device_id) {
      return await responder({ ok: false, motivo: 'device_id_ausente' }, 400)
    }
    if (!email && !codigo) {
      return await responder({ ok: false, motivo: 'sem_identificacao' }, 400)
    }

    // -----------------------------------------------------------------------
    // 2. Usuário
    // -----------------------------------------------------------------------
    const identificador = email?.toLowerCase().trim()

    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .select('id, email, nome, tipo, status, max_dispositivos, validade_ate')
      .eq('email', identificador)
      .maybeSingle()

    if (erroUsuario) {
      console.error('Erro ao buscar usuário:', erroUsuario)
      return await responder({ ok: false, motivo: 'erro_interno' }, 500)
    }

    if (!usuario) return await acessoNegado()

    // 3. Status e validade — motivos diferentes para nós, resposta idêntica
    //    para fora. A data do vencimento NÃO acompanha a resposta: ela
    //    denunciaria que o e-mail existe.
    if (usuario.status === 'suspenso' || usuario.status === 'cancelado') {
      return await acessoNegado()
    }
    if (usuario.validade_ate && new Date(usuario.validade_ate) < new Date()) {
      return await acessoNegado()
    }

    // -----------------------------------------------------------------------
    // 4. Dispositivo
    //
    // Máquina já conhecida deste usuário passa direto — é reativação, e o
    // limite já foi cobrado quando ela foi registrada. Máquina nova é contada;
    // se não couber, `acesso_negado`, o mesmo que um e-mail inexistente. É o
    // que impede o "limite excedido" de confirmar que o e-mail é de um aluno.
    // -----------------------------------------------------------------------
    const { data: ativacaoExistente } = await supabase
      .from('ativacoes')
      .select('id')
      .eq('usuario_id', usuario.id)
      .eq('device_id', device_id)
      .eq('ativo', true)
      .maybeSingle()

    if (!ativacaoExistente) {
      const { count } = await supabase
        .from('ativacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuario.id)
        .eq('ativo', true)

      if ((count ?? 0) >= usuario.max_dispositivos) {
        return await acessoNegado()
      }

      const { error: erroInsert } = await supabase
        .from('ativacoes')
        .insert({ usuario_id: usuario.id, device_id, so, versao_cli })

      if (erroInsert) {
        console.error('Erro ao criar ativação:', erroInsert)
        return await responder({ ok: false, motivo: 'erro_interno' }, 500)
      }
    } else {
      await supabase
        .from('ativacoes')
        .update({ versao_cli, so })
        .eq('id', ativacaoExistente.id)
    }

    // -----------------------------------------------------------------------
    // 5. Módulos
    // -----------------------------------------------------------------------
    const { data: modulosCore } = await supabase
      .from('modulos_disponiveis')
      .select('id, nome')
      .eq('incluso_core', true)
      .eq('ativo', true)

    const { data: modulosContratados } = await supabase
      .from('modulos_do_usuario')
      .select('modulo_id, validade_ate, modulos_disponiveis(id, nome)')
      .eq('usuario_id', usuario.id)
      .eq('status', 'ativo')

    const modulos = [
      ...(modulosCore ?? []).map(m => ({
        id: m.id,
        nome: m.nome,
        origem: 'core',
        validade_ate: null,
      })),
      ...(modulosContratados ?? [])
        .filter(m => !m.validade_ate || new Date(m.validade_ate) > new Date())
        .map(m => ({
          id: m.modulo_id,
          nome: (m as any).modulos_disponiveis?.nome ?? m.modulo_id,
          origem: 'contratado',
          validade_ate: m.validade_ate,
        })),
    ]

    // 6. Ping
    await supabase.from('pings').insert({
      usuario_id: usuario.id,
      comando: 'ativar',
      versao_cli,
    })

    // 7. Sucesso
    return await responder({
      ok: true,
      usuario: {
        nome: usuario.nome,
        tipo: usuario.tipo,
        validade_ate: usuario.validade_ate,
      },
      modulos,
    })

  } catch (err) {
    console.error('Erro não capturado:', err)
    return await responder({ ok: false, motivo: 'erro_interno' }, 500)
  }
})

/**
 * IP do chamador. `x-forwarded-for` vem como "cliente, proxy1, proxy2" — o
 * primeiro é o cliente.
 *
 * Sem cabeçalho, cai num bucket compartilhado em vez de negar: se a plataforma
 * um dia parar de mandar o header, negar derrubaria TODAS as ativações de uma
 * vez. Assim o pior caso é esses casos raros dividirem uma cota entre si.
 */
function ipDoRequest(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for')
  const primeiro = encaminhado?.split(',')[0]?.trim()
  if (primeiro) return primeiro

  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real

  return 'desconhecido'
}
