import { Command } from 'commander';

import { peticiaDiario } from './commands/peticia.js';
import { opcaoSandbox, registrarComandos } from './commands/index.js';
import { DESCRICAO, NODE_MINIMO, NOME } from './constants.js';
import { erro, info } from './lib/ui.js';
import { VERSAO } from './lib/versao.js';

function checarNode() {
  const maior = Number(process.versions.node.split('.')[0]);
  if (maior < NODE_MINIMO) {
    erro(
      `o peticia precisa do Node ${NODE_MINIMO} ou superior (você tem ${process.versions.node})`,
    );
    process.exit(1);
  }
}

/**
 * Ação padrão. Como ela existe, o Commander entrega aqui qualquer operando que
 * não bateu com um subcomando — então rejeitamos explicitamente, senão um erro
 * de digitação sairia com código 0.
 */
async function acaoPadrao(_opcoes, comando) {
  const [desconhecido] = comando.args;
  if (desconhecido) {
    erro(`comando desconhecido: "${desconhecido}"`);
    info(`Veja os comandos disponíveis com: ${NOME} --help`);
    process.exit(1);
  }

  // Uso diário: valida o setup e abre o Claude Code com o maestro.
  await peticiaDiario({ sandbox: Boolean(comando.opts().sandbox) });
}

/**
 * Traduz exceções em mensagens de uma linha. O aluno nunca deve ver stack trace:
 * ele não tem o que fazer com uma, e ela esconde a instrução que resolveria.
 */
function tratarErro(e) {
  // Ctrl+C durante um prompt do inquirer.
  if (e?.name === 'ExitPromptError') {
    info('');
    info('Configuração cancelada. Nada foi salvo.');
    process.exit(130);
  }

  erro(e?.message ?? String(e));
  if (e?.dica) info(e.dica);

  if (process.env.PETICIA_DEBUG) {
    console.error(e);
  } else {
    info('');
    info('Para ver detalhes técnicos, rode de novo com PETICIA_DEBUG=1');
  }

  process.exit(1);
}

export async function main(argv) {
  checarNode();

  const programa = new Command();

  programa
    .name(NOME)
    .description(DESCRICAO)
    .version(VERSAO, '-v, --version', 'mostra a versão instalada')
    .helpOption('-h, --help', 'mostra esta ajuda')
    .addOption(opcaoSandbox())
    .addHelpText(
      'after',
      `
Uso diário:
  ${NOME}                   abre o Claude Code para trabalhar

Primeira vez (nesta ordem):
  ${NOME} ativar EMAIL      ativa sua licença e instala os agentes
  ${NOME} configurar        configura seu escritório
  ${NOME} status            mostra o estado da instalação
`,
    )
    .action(acaoPadrao);

  registrarComandos(programa);

  try {
    await programa.parseAsync(argv);
  } catch (e) {
    tratarErro(e);
  }
}
