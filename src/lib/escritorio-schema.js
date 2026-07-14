/**
 * Forma e validação do escritorio.json. Todo comando futuro lê este arquivo,
 * então ele tem versão: quando o formato mudar, o campo schema_versao permite
 * migrar a configuração do aluno em vez de mandá-lo reconfigurar tudo.
 */

export const SCHEMA_VERSAO = 1;

export const FORMATACAO_PADRAO = Object.freeze({
  fonte_corpo: 'Calibri Light',
  tamanho_corpo: 12,
  tamanho_citacao: 10,
  espacamento_linhas: 1.2,
  espacamento_depois_paragrafo_pt: 6,
  recuo_primeira_linha_cm: 1.25,
  alinhamento: 'justificado',
});

/** Rótulos e tipos usados pelo wizard ao oferecer edição campo a campo. */
export const CAMPOS_FORMATACAO = [
  { chave: 'fonte_corpo', rotulo: 'Fonte do corpo', tipo: 'texto' },
  { chave: 'tamanho_corpo', rotulo: 'Tamanho do corpo (pt)', tipo: 'numero' },
  { chave: 'tamanho_citacao', rotulo: 'Tamanho da citação (pt)', tipo: 'numero' },
  { chave: 'espacamento_linhas', rotulo: 'Espaçamento entre linhas', tipo: 'numero' },
  {
    chave: 'espacamento_depois_paragrafo_pt',
    rotulo: 'Espaço depois do parágrafo (pt)',
    tipo: 'numero',
  },
  { chave: 'recuo_primeira_linha_cm', rotulo: 'Recuo da 1ª linha (cm)', tipo: 'numero' },
  { chave: 'alinhamento', rotulo: 'Alinhamento', tipo: 'texto' },
];

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
];

export function ufValida(uf) {
  return UFS.includes(normalizarUf(uf));
}

export function normalizarUf(uf) {
  return String(uf ?? '').trim().toUpperCase();
}

/** Preserva os pontos que o advogado digita (12.345), só apara o resto. */
export function normalizarNumeroOab(numero) {
  return String(numero ?? '').trim();
}

export function numeroOabValido(numero) {
  const n = normalizarNumeroOab(numero);
  return n.length > 0 && /^[\d.\-/]+$/.test(n) && /\d/.test(n);
}

export function oab(uf, numero) {
  return { uf: normalizarUf(uf), numero: normalizarNumeroOab(numero) };
}

/** Formato humano: "BA 12.345" */
export function oabTexto({ uf, numero }) {
  return `${uf} ${numero}`;
}

/**
 * Monta o objeto final. Recebe o que o wizard coletou e devolve o JSON que
 * vai para o disco — sem nenhum segredo: a chave da OpenAI mora no .env,
 * aqui fica só o fato de existir.
 */
export function montarEscritorio({
  advogado,
  escritorios,
  formatacao,
  openaiConfigurada = false,
  criadoEm,
}) {
  return {
    schema_versao: SCHEMA_VERSAO,
    criado_em: criadoEm,
    advogado: {
      nome: advogado.nome,
      oab_principal: advogado.oabPrincipal,
      oabs_suplementares: advogado.oabsSuplementares ?? {},
    },
    escritorios: escritorios.map((e) => ({
      nome: e.nome,
      raiz: e.raiz,
      assinatura_dupla: Boolean(e.assinaturaDupla),
      socio: e.socio ?? null,
      estrutura: {
        fila_entrada: e.estrutura.fila_entrada ?? null,
        modelos: e.estrutura.modelos ?? null,
        timbrado: e.estrutura.timbrado ?? null,
        protocolados: e.estrutura.protocolados ?? null,
      },
    })),
    formatacao: { ...FORMATACAO_PADRAO, ...formatacao },
    openai: { configurada: Boolean(openaiConfigurada) },
  };
}

/**
 * Valida um escritorio.json vindo do disco. Devolve lista de erros legíveis
 * (vazia = válido). Não lança: quem chama decide o que fazer.
 */
export function validar(obj) {
  const erros = [];

  if (!obj || typeof obj !== 'object') {
    return ['o arquivo não contém um objeto JSON'];
  }

  if (obj.schema_versao !== SCHEMA_VERSAO) {
    erros.push(
      `schema_versao esperado ${SCHEMA_VERSAO}, encontrado ${obj.schema_versao ?? 'nenhum'}`,
    );
  }

  const adv = obj.advogado;
  if (!adv?.nome?.trim()) {
    erros.push('advogado.nome está vazio');
  }
  if (!adv?.oab_principal?.uf || !ufValida(adv.oab_principal.uf)) {
    erros.push(`advogado.oab_principal.uf inválida: ${adv?.oab_principal?.uf ?? 'ausente'}`);
  }
  if (!numeroOabValido(adv?.oab_principal?.numero)) {
    erros.push('advogado.oab_principal.numero inválido');
  }

  for (const [uf, numero] of Object.entries(adv?.oabs_suplementares ?? {})) {
    if (!ufValida(uf)) erros.push(`OAB suplementar com UF inválida: ${uf}`);
    if (!numeroOabValido(numero)) erros.push(`OAB suplementar ${uf} com número inválido`);
  }

  if (!Array.isArray(obj.escritorios) || obj.escritorios.length === 0) {
    erros.push('nenhum escritório configurado');
  } else {
    obj.escritorios.forEach((e, i) => {
      const onde = `escritorios[${i}]`;
      if (!e?.nome?.trim()) erros.push(`${onde}.nome está vazio`);
      if (!e?.raiz?.trim()) erros.push(`${onde}.raiz está vazio`);
      if (e?.assinatura_dupla && !e?.socio?.nome?.trim()) {
        erros.push(`${onde} tem assinatura dupla mas não tem sócio`);
      }
    });
  }

  for (const campo of Object.keys(FORMATACAO_PADRAO)) {
    if (obj.formatacao?.[campo] === undefined) {
      erros.push(`formatacao.${campo} ausente`);
    }
  }

  return erros;
}
