import { spawnSync } from 'node:child_process';
import path from 'node:path';

import fs from 'fs-extra';

import { TEMPLATES } from './instalacao.js';
import {
  arquivoEscritorio,
  arquivoInstalacao,
  ehWindows,
  linkAgentes,
  pastaAgentes,
} from './paths.js';
import { VERSAO } from './versao.js';

/**
 * Valida se a instalação está pronta para o uso diário (comando `peticia`).
 *
 * Falha rápido: checa em ordem e devolve o PRIMEIRO problema com a mensagem e o
 * que fazer para resolver. Não toca em nada — só lê. Testável via override
 * `base` (como o coletor-status).
 */

function problema(codigo, mensagem, dica) {
  return { ok: false, codigo, mensagem, dica };
}

const DICA_ATIVAR = 'Rode: peticia ativar SEU-EMAIL@exemplo.com';

/** O link ~/.claude/agents/peticia aponta mesmo para os agentes desta instalação? */
async function linkApontaCerto(link, alvoEsperado) {
  try {
    const st = await fs.lstat(link);
    if (st.isSymbolicLink()) {
      const alvo = await fs.readlink(link);
      return path.resolve(alvo) === path.resolve(alvoEsperado);
    }
    // Junction (Windows) aparece como diretório; confira pelo realpath.
    if (st.isDirectory()) {
      const real = await fs.realpath(link);
      return path.resolve(real) === path.resolve(alvoEsperado);
    }
    return false;
  } catch {
    return false;
  }
}

export async function validarInstalacao(opcoes = {}) {
  // (a) Ativou? O ponteiro é escrito pelo ativar (e traz agentes_instalados).
  const ponteiro = arquivoInstalacao(opcoes);
  if (!(await fs.pathExists(ponteiro))) {
    return problema('nao_ativado', 'Você ainda não ativou o peticia.', DICA_ATIVAR);
  }

  let dados;
  try {
    dados = await fs.readJson(ponteiro);
  } catch {
    return problema('ponteiro_invalido', 'O arquivo de instalação está ilegível.', DICA_ATIVAR);
  }

  const home = dados?.pasta_peticia;
  if (!home || !(dados.agentes_instalados?.length > 0)) {
    return problema('nao_ativado', 'Você ainda não ativou o peticia.', DICA_ATIVAR);
  }
  if (!(await fs.pathExists(home))) {
    return problema(
      'pasta_sumiu',
      `A pasta do peticia não existe mais: ${home}`,
      DICA_ATIVAR,
    );
  }

  // (b) Configurou?
  if (!(await fs.pathExists(arquivoEscritorio(home)))) {
    return problema(
      'nao_configurado',
      'Você ainda não configurou seu escritório.',
      'Rode: peticia configurar',
    );
  }

  // (c) O Claude Code enxerga os agentes (link)?
  if (!(await linkApontaCerto(linkAgentes(opcoes), pastaAgentes(home)))) {
    return problema(
      'sem_link',
      'O Claude Code não está conectado aos seus agentes (link ausente).',
      DICA_ATIVAR,
    );
  }

  // (d) Os agentes estão todos lá?
  const faltando = [];
  for (const agente of TEMPLATES.agentes) {
    if (!(await fs.pathExists(path.join(pastaAgentes(home), agente)))) {
      faltando.push(agente);
    }
  }
  if (faltando.length > 0) {
    return problema(
      'agentes_incompletos',
      `Faltam agentes na instalação: ${faltando.join(', ')}.`,
      DICA_ATIVAR,
    );
  }

  const config = await fs.readJson(arquivoEscritorio(home)).catch(() => ({}));

  return {
    ok: true,
    home,
    escritorio: config.escritorios?.[0]?.nome ?? '—',
    nAgentes: TEMPLATES.agentes.length,
    versao: VERSAO,
  };
}

/** O binário `claude` está no PATH? Só informamos — nunca instalamos por conta própria. */
export function temClaude() {
  const localizador = ehWindows ? 'where' : 'which';
  const r = spawnSync(localizador, ['claude'], { stdio: 'ignore' });
  return r.status === 0;
}
