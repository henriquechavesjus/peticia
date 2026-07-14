/**
 * Valores fixos do produto. Nada aqui depende de estado do usuário.
 */

export const NOME = 'peticia';

export const DESCRICAO =
  'Automação de petições jurídicas com Claude Code e agentes.';

/** Nome da pasta criada na home do aluno. */
export const PASTA_ALUNO = 'peticia';

/** Subpastas que a instalação cria dentro da pasta do aluno. */
export const SUBPASTAS = [
  'agentes',
  'workflows',
  'lib',
  'ferramentas',
  'config',
];

/** Nome do link simbólico criado dentro de ~/.claude/agents/. */
export const LINK_AGENTES = 'peticia';

/** Node mínimo suportado (espelha "engines" no package.json). */
export const NODE_MINIMO = 20;
