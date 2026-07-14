import { createRequire } from 'node:module';

import { Command } from 'commander';

import { registrarComandos } from './commands/index.js';
import { DESCRICAO, NODE_MINIMO, NOME } from './constants.js';
import { abortar, erro, info } from './lib/ui.js';

// createRequire em vez de "import ... with { type: 'json' }" para não emitir
// ExperimentalWarning no terminal do aluno.
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

function checarNode() {
  const maior = Number(process.versions.node.split('.')[0]);
  if (maior < NODE_MINIMO) {
    abortar(
      `o peticia precisa do Node ${NODE_MINIMO} ou superior (você tem ${process.versions.node})`,
    );
  }
}

/**
 * Ação padrão. Como ela existe, o Commander entrega aqui qualquer operando que
 * não bateu com um subcomando — então rejeitamos explicitamente, senão um erro
 * de digitação sairia com código 0.
 */
function acaoPadrao(_opcoes, comando) {
  const [desconhecido] = comando.args;
  if (desconhecido) {
    erro(`comando desconhecido: "${desconhecido}"`);
    info(`Veja os comandos disponíveis com: ${NOME} --help`);
    process.exit(1);
  }

  // Uso diário: conversa com o Claude Code. Ainda não implementado.
  info('O modo de conversa com o Claude Code ainda não foi implementado.');
  info(`Veja os comandos disponíveis com: ${NOME} --help`);
}

export function main(argv) {
  checarNode();

  const program = new Command();

  program
    .name(NOME)
    .description(DESCRICAO)
    .version(version, '-v, --version', 'mostra a versão instalada')
    .helpOption('-h, --help', 'mostra esta ajuda')
    .addHelpText(
      'after',
      `
Uso diário:
  $ ${NOME}                  abre a conversa com o Claude Code

Primeira vez:
  $ ${NOME} ativar           instala e ativa a licença
`,
    )
    .action(acaoPadrao);

  program.configureOutput({
    writeErr: (str) => process.stderr.write(str),
  });

  registrarComandos(program);

  program.parse(argv);
}
