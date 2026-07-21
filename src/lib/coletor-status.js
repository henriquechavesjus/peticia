import fs from 'fs-extra';

import { oabTexto, validar } from './escritorio-schema.js';
import {
  arquivoEnv,
  arquivoEscritorio,
  arquivoInstalacao,
  getPeticiaHome,
  linkAgentes,
  pastaAgentes,
} from './paths.js';
import { VERSAO } from './versao.js';

/**
 * Coleta tudo que o status precisa e devolve um objeto puro — sem cor, sem
 * impressão. É o que permite testar o comando sem capturar stdout, e o que o
 * --json expõe direto.
 *
 * Nada de segredo entra no objeto: da chave da OpenAI só sai o fato de existir.
 */

/** Um caminho configurado: existe no disco? */
async function checarCaminho(caminho) {
  if (!caminho) return { configurado: false, caminho: null, existe: false };
  return { configurado: true, caminho, existe: await fs.pathExists(caminho) };
}

/**
 * Conta as pastas de caso pendentes: só subpastas diretas da fila.
 * Arquivo solto não é um caso, e descer recursivo contaria os documentos de
 * dentro de cada processo.
 */
async function contarPastas(dir) {
  const entradas = await fs.readdir(dir, { withFileTypes: true });
  return entradas.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
}

async function checarFila(caminho) {
  const base = await checarCaminho(caminho);
  if (!base.configurado || !base.existe) return { ...base, pastas: null };

  try {
    return { ...base, pastas: await contarPastas(caminho) };
  } catch {
    // Existe mas não dá para ler (permissão, volume de nuvem desmontado).
    return { ...base, acessivel: false, pastas: null };
  }
}

/** O Claude Code só enxerga agentes através deste link. */
async function checarClaudeCode(opcoes, home) {
  const link = linkAgentes(opcoes);
  const destinoEsperado = pastaAgentes(home);

  let alvo = null;
  try {
    const st = await fs.lstat(link);
    alvo = st.isSymbolicLink() ? await fs.readlink(link) : link;
  } catch {
    return { conectado: false, link, alvo: null, apontaCerto: false };
  }

  return {
    conectado: true,
    link,
    alvo,
    apontaCerto: alvo === destinoEsperado,
  };
}

async function openaiConfigurada(home) {
  const env = arquivoEnv(home);
  if (!(await fs.pathExists(env))) return false;

  const conteudo = await fs.readFile(env, 'utf8').catch(() => '');
  return /^OPENAI_API_KEY=.+/m.test(conteudo);
}

export async function coletarStatus(opcoes = {}) {
  // Lança NaoConfigurado se o wizard nunca rodou — quem chama traduz.
  const home = await getPeticiaHome(opcoes);

  const avisos = [];
  const instalacaoBruta = await fs.readJson(arquivoInstalacao(opcoes)).catch(() => ({}));

  const instalacao = {
    pasta: home,
    pasta_existe: await fs.pathExists(home),
    criado_em: instalacaoBruta.criado_em ?? null,
    versao_instalada: instalacaoBruta.versao_cli ?? null,
    versao_atual: VERSAO,
    so: instalacaoBruta.so ?? null,
  };

  if (!instalacao.pasta_existe) {
    avisos.push(`a pasta do peticia não existe mais: ${home}`);
  }
  if (
    instalacao.versao_instalada &&
    instalacao.versao_instalada !== instalacao.versao_atual
  ) {
    avisos.push(
      `instalado com a versão ${instalacao.versao_instalada}, rodando ${instalacao.versao_atual}`,
    );
  }

  // --- escritorio.json ---
  const arquivo = arquivoEscritorio(home);
  let config = null;

  if (!(await fs.pathExists(arquivo))) {
    avisos.push(`escritorio.json não encontrado em ${arquivo}`);
  } else {
    try {
      config = await fs.readJson(arquivo);
    } catch {
      avisos.push(`escritorio.json está ilegível: ${arquivo}`);
    }
  }

  if (config) {
    for (const erro of validar(config)) {
      avisos.push(`escritorio.json: ${erro}`);
    }
  }

  // --- advogado ---
  const advBruto = config?.advogado;
  const advogado = advBruto
    ? {
        nome: advBruto.nome,
        oab_principal: {
          ...advBruto.oab_principal,
          texto: oabTexto(advBruto.oab_principal),
        },
        suplementares: Object.entries(advBruto.oabs_suplementares ?? {}).map(
          ([uf, numero]) => ({ uf, numero, texto: oabTexto({ uf, numero }) }),
        ),
      }
    : null;

  // --- escritórios ---
  const escritorios = [];
  for (const e of config?.escritorios ?? []) {
    const raiz = await checarCaminho(e.raiz);
    const estrutura = {
      fila: await checarFila(e.estrutura?.fila_entrada),
      para_protocolar: await checarCaminho(e.estrutura?.para_protocolar),
      modelos: await checarCaminho(e.estrutura?.modelos),
      timbrado: await checarCaminho(e.estrutura?.timbrado),
      protocolados: await checarCaminho(e.estrutura?.protocolados),
    };

    if (!raiz.existe) {
      avisos.push(`a raiz de "${e.nome}" não existe mais: ${e.raiz}`);
    }
    for (const [chave, alvo] of Object.entries(estrutura)) {
      if (alvo.configurado && !alvo.existe) {
        avisos.push(`${chave} de "${e.nome}" não existe mais: ${alvo.caminho}`);
      }
    }
    if (estrutura.fila.acessivel === false) {
      avisos.push(`a fila de "${e.nome}" existe mas não pôde ser lida`);
    }

    escritorios.push({
      nome: e.nome,
      raiz,
      assinatura_dupla: Boolean(e.assinatura_dupla),
      socio: e.socio
        ? { nome: e.socio.nome, oab: { ...e.socio.oab, texto: oabTexto(e.socio.oab) } }
        : null,
      estrutura,
    });
  }

  // --- integrações ---
  const claudeCode = await checarClaudeCode(opcoes, home);
  if (!claudeCode.conectado) {
    avisos.push(`o link ${claudeCode.link} não existe — o Claude Code ainda não enxerga os agentes`);
  } else if (!claudeCode.apontaCerto) {
    avisos.push(`o link ${claudeCode.link} aponta para ${claudeCode.alvo}, e não para ${pastaAgentes(home)}`);
  }

  return {
    versao_cli: VERSAO,
    instalacao,
    licenca: { status: 'local', detalhe: 'servidor ainda não configurado' },
    advogado,
    escritorios,
    formatacao: config?.formatacao ?? null,
    integracoes: {
      openai: { configurada: await openaiConfigurada(home) },
      claude_code: claudeCode,
    },
    avisos,
  };
}
