import { Option } from 'commander';

import { abortar } from '../lib/ui.js';
import { ativar } from './ativar.js';
import { configurar } from './configurar.js';
import { status } from './status.js';

/**
 * Comandos de SETUP ainda não implementados. Aparecem no --help com a
 * assinatura final, mas falham ao serem chamados. Conforme cada um for
 * implementado, sai desta lista e vira seu próprio módulo.
 */
const STUBS = [
  {
    nome: 'atualizar',
    descricao: 'Busca novidades e atualiza as partes gerenciadas pelo peticia',
  },
  {
    nome: 'editar',
    descricao: 'Abre a pasta do peticia para editar agentes e workflows',
  },
  {
    nome: 'plugin',
    descricao: 'Lista e instala plugins opcionais',
  },
];

/**
 * --sandbox é de desenvolvimento: troca a home por ~/.peticia-sandbox.
 * Fica oculta no --help, mas vale em qualquer comando. Precisa ser declarada
 * também em cada subcomando, senão o commander só a aceita antes do comando
 * (`peticia --sandbox configurar`) e recusa `peticia configurar --sandbox`.
 */
export function opcaoSandbox() {
  return new Option('--sandbox', 'usa ~/.peticia-sandbox como home').hideHelp();
}

/** Une a flag vinda do programa e a vinda do subcomando. */
function sandboxAtivo(programa, comando) {
  return Boolean(programa.opts().sandbox || comando.opts().sandbox);
}

export function registrarComandos(programa) {
  programa
    .command('ativar')
    .argument('<email>', 'e-mail com que você comprou o curso')
    .description('Ativa a licença neste dispositivo e cria a pasta do peticia')
    .addOption(opcaoSandbox())
    .action(async (email, _opcoes, comando) => {
      await ativar(email, { sandbox: sandboxAtivo(programa, comando) });
    });

  programa
    .command('configurar')
    .description('Configura escritórios, dados do advogado e chaves de API')
    .addOption(opcaoSandbox())
    .action(async (_opcoes, comando) => {
      await configurar({ sandbox: sandboxAtivo(programa, comando) });
    });

  programa
    .command('status')
    .description('Mostra o estado da instalação, da licença e dos agentes')
    .option('--json', 'imprime os dados em JSON em vez do painel')
    .addOption(opcaoSandbox())
    .action(async (opcoes, comando) => {
      await status({ sandbox: sandboxAtivo(programa, comando), json: Boolean(opcoes.json) });
    });

  for (const { nome, descricao } of STUBS) {
    programa
      .command(nome)
      .description(descricao)
      .addOption(opcaoSandbox())
      .action(() => {
        abortar(`o comando "${nome}" ainda não foi implementado`);
      });
  }
}
