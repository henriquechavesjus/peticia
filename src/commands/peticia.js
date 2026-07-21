import { spawnSync } from 'node:child_process';

import { temClaude, validarInstalacao } from '../lib/ambiente.js';
import { NOME } from '../constants.js';
import { pastaAgentesClaude } from '../lib/paths.js';
import { cor, info } from '../lib/ui.js';

const FLAGS_CLAUDE = ['--dangerously-skip-permissions'];

/**
 * Uso diário: `peticia` sem argumentos. Valida o setup e cede o terminal ao
 * Claude Code, que carrega o maestro e conversa com o aluno.
 *
 * Não é wizard nem menu — é uma ponte. Falha rápido se algo do setup falta.
 */
export async function peticiaDiario({ sandbox = false } = {}) {
  const v = await validarInstalacao({ sandbox });
  if (!v.ok) {
    info(v.mensagem);
    if (v.dica) info(v.dica);
    process.exitCode = 1;
    return { lancou: false, motivo: v.codigo };
  }

  if (!temClaude()) {
    info('O Claude Code não está instalado.');
    info('Instale em: https://docs.claude.com/en/docs/claude-code');
    process.exitCode = 1;
    return { lancou: false, motivo: 'sem_claude' };
  }

  // Linha de status — não é banner, é contexto.
  info(`${NOME} ${v.versao} · escritório: ${v.escritorio} · ${v.nAgentes} agentes`);

  if (sandbox) {
    // Sandbox é ambiente de teste: não sequestramos o terminal com uma sessão
    // interativa. Mostramos o que rodaria e de onde viriam os agentes.
    info(cor.fraco(`(sandbox) rodaria: claude ${FLAGS_CLAUDE.join(' ')}`));
    info(cor.fraco(`(sandbox) agentes em: ${pastaAgentesClaude({ sandbox })}`));
    return { lancou: false, motivo: 'sandbox_dry_run' };
  }

  // Cede o terminal ao Claude Code. Node não faz exec real, mas spawnSync com
  // stdio herdado é equivalente para o aluno: bloqueia até o claude sair.
  const r = spawnSync('claude', FLAGS_CLAUDE, { stdio: 'inherit' });
  process.exitCode = r.status ?? 0;
  return { lancou: true };
}
