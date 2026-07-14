import chalk from 'chalk';

/**
 * Toda saída do CLI passa por aqui. Tom sóbrio, estilo git/docker:
 * sem banner, sem emoji, cor só para separar níveis.
 */

export function info(msg) {
  console.log(msg);
}

export function passo(msg) {
  console.log(chalk.dim('·'), msg);
}

export function ok(msg) {
  console.log(chalk.green('ok'), msg);
}

export function aviso(msg) {
  console.error(chalk.yellow('aviso'), msg);
}

export function erro(msg) {
  console.error(chalk.red('erro'), msg);
}

/** Falha o processo com uma mensagem — nunca lance stack trace no aluno. */
export function abortar(msg, codigo = 1) {
  erro(msg);
  process.exit(codigo);
}
