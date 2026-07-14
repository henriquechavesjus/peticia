import chalk from 'chalk';

/**
 * Toda saída do CLI passa por aqui. Tom sóbrio, estilo git/docker:
 * sem banner, sem emoji decorativo, cor só para separar níveis.
 */

export function info(msg = '') {
  console.log(msg);
}

export function passo(msg) {
  console.log(chalk.dim('·'), msg);
}

export function ok(msg) {
  console.log(chalk.green('✓'), msg);
}

export function aviso(msg) {
  console.error(chalk.yellow('aviso'), msg);
}

export function erro(msg) {
  console.error(chalk.red('erro'), msg);
}

/** Cabeçalho de etapa: ━━━ TÍTULO ━━━ */
export function secao(titulo) {
  console.log();
  console.log(chalk.cyan(`━━━ ${titulo.toUpperCase()} ━━━`));
  console.log();
}

export function dim(msg) {
  console.log(chalk.dim(msg));
}

/** Falha o processo com uma mensagem — nunca lance stack trace no aluno. */
export function abortar(msg, codigo = 1) {
  erro(msg);
  process.exit(codigo);
}

export const cor = {
  destaque: (s) => chalk.cyan(s),
  ok: (s) => chalk.green(s),
  atencao: (s) => chalk.yellow(s),
  ruim: (s) => chalk.red(s),
  fraco: (s) => chalk.dim(s),
};
