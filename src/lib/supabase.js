export const SUPABASE_URL = 'https://meqpnkjkwuyqgfrwurcf.supabase.co';

// Chave anônima: é pública por desenho (vai no bundle de qualquer app Supabase)
// e só dá acesso ao que a RLS permitir. Não é segredo — o segredo é a
// service_role, que vive só na Edge Function.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXBua2prd3V5cWdmcnd1cmNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDM4NTksImV4cCI6MjA5OTYxOTg1OX0.fnFvZvlArJTddUm_1wv5IYWD6UoH1f9O8MvsrekQCTI';

export const TIMEOUT_MS = 15_000;

/** Falha de transporte: não chegamos a ouvir o servidor. */
export class ErroDeRede extends Error {
  constructor(mensagem, causa) {
    super(mensagem);
    this.name = 'ErroDeRede';
    this.causa = causa;
  }
}

/** A base pode ser trocada nos testes, para não bater na produção. */
function baseUrl() {
  return process.env.PETICIA_SUPABASE_URL || SUPABASE_URL;
}

/**
 * POST numa Edge Function.
 *
 * Devolve o JSON mesmo quando o status é 400/500: a função responde
 * { ok: false, motivo } com esses códigos, e tratar isso como falha de rede
 * esconderia do aluno o motivo real (ex: "e-mail não cadastrado").
 * Só ErroDeRede significa "não consegui falar com o servidor".
 */
export async function chamarEdgeFunction(nomeFuncao, payload, { timeout = TIMEOUT_MS } = {}) {
  const url = `${baseUrl()}/functions/v1/${nomeFuncao}`;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeout);

  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controle.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ErroDeRede(`o servidor não respondeu em ${timeout / 1000}s`, e);
    }
    throw new ErroDeRede('não foi possível conectar ao servidor', e);
  } finally {
    clearTimeout(relogio);
  }

  try {
    return await resposta.json();
  } catch (e) {
    // Respondeu, mas não com JSON (proxy, captive portal, 502 em HTML...).
    throw new ErroDeRede(`resposta inesperada do servidor (HTTP ${resposta.status})`, e);
  }
}
