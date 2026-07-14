// supabase/functions/ativar/index.ts
// Edge Function: valida acesso do aluno e retorna módulos ativos

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Cliente Supabase com service_role (poder total)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json()
    const { email, codigo, device_id, versao_cli, so } = body

    // Validação básica de payload
    if (!device_id) {
      return json({ ok: false, motivo: 'device_id_ausente' }, 400)
    }
    if (!email && !codigo) {
      return json({ ok: false, motivo: 'sem_identificacao' }, 400)
    }

    // 1. Buscar usuário por email
    const identificador = email?.toLowerCase().trim()

    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .select('id, email, nome, tipo, status, max_dispositivos, validade_ate')
      .eq('email', identificador)
      .maybeSingle()

    if (erroUsuario) {
      console.error('Erro ao buscar usuário:', erroUsuario)
      return json({ ok: false, motivo: 'erro_interno' }, 500)
    }

    if (!usuario) {
      return json({ ok: false, motivo: 'email_nao_cadastrado' }, 200)
    }

    // 2. Checar status
    if (usuario.status === 'suspenso') {
      return json({ ok: false, motivo: 'suspenso' }, 200)
    }
    if (usuario.status === 'cancelado') {
      return json({ ok: false, motivo: 'cancelado' }, 200)
    }

    // 3. Checar validade
    if (usuario.validade_ate && new Date(usuario.validade_ate) < new Date()) {
      // A data vai junto: sem ela o CLI não consegue dizer QUANDO venceu.
      return json({
        ok: false,
        motivo: 'validade_expirada',
        validade_ate: usuario.validade_ate,
      }, 200)
    }

    // 4. Checar/criar ativação para este dispositivo
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
        return json({
          ok: false,
          motivo: 'limite_excedido',
          max_dispositivos: usuario.max_dispositivos,
        }, 200)
      }

      const { error: erroInsert } = await supabase
        .from('ativacoes')
        .insert({
          usuario_id: usuario.id,
          device_id,
          so,
          versao_cli,
        })

      if (erroInsert) {
        console.error('Erro ao criar ativação:', erroInsert)
        return json({ ok: false, motivo: 'erro_interno' }, 500)
      }
    } else {
      await supabase
        .from('ativacoes')
        .update({ versao_cli, so })
        .eq('id', ativacaoExistente.id)
    }

    // 5. Buscar módulos ativos
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

    // 6. Registrar ping
    await supabase.from('pings').insert({
      usuario_id: usuario.id,
      comando: 'ativar',
      versao_cli,
    })

    // 7. Sucesso
    return json({
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
    return json({ ok: false, motivo: 'erro_interno' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
    },
  })
}