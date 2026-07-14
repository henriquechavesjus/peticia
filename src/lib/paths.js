import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LINK_AGENTES, PASTA_ALUNO } from '../constants.js';

export const ehWindows = process.platform === 'win32';
export const ehMac = process.platform === 'darwin';

/** Home do usuário. Em ambos os SOs vem de os.homedir(). */
export function home() {
  return os.homedir();
}

/** Pasta visível do aluno: ~/peticia */
export function pastaAluno() {
  return path.join(home(), PASTA_ALUNO);
}

/** Onde o Claude Code procura agentes: ~/.claude/agents */
export function pastaAgentesClaude() {
  return path.join(home(), '.claude', 'agents');
}

/** O link ~/.claude/agents/peticia -> ~/peticia/agentes */
export function linkAgentes() {
  return path.join(pastaAgentesClaude(), LINK_AGENTES);
}

export function pastaConfig() {
  return path.join(pastaAluno(), 'config');
}

export function arquivoEscritorios() {
  return path.join(pastaConfig(), 'escritorios.json');
}

/**
 * Raiz do pacote instalado (onde vivem templates/ e src/), independente de
 * onde o npm colocou o global bin.
 */
export function raizPacote() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function pastaTemplates() {
  return path.join(raizPacote(), 'templates');
}
