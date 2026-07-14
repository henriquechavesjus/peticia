import { abortar } from '../lib/ui.js';

/**
 * Comandos de SETUP. Por enquanto são stubs: aparecem no --help com a
 * assinatura final, mas falham ao serem chamados. Conforme cada um for
 * implementado, ele sai desta lista e vira seu próprio módulo
 * (src/commands/ativar.js, etc.).
 */
const STUBS = [
  {
    nome: 'ativar',
    descricao: 'Instala o peticia e ativa a licença neste dispositivo',
  },
  {
    nome: 'configurar',
    descricao: 'Configura escritórios, dados do advogado e chaves de API',
  },
  {
    nome: 'status',
    descricao: 'Mostra o estado da instalação, da licença e dos agentes',
  },
  {
    nome: 'atualizar',
    descricao: 'Busca novidades e atualiza as partes gerenciadas pelo peticia',
  },
  {
    nome: 'editar',
    descricao: 'Abre a pasta ~/peticia para editar agentes e workflows',
  },
  {
    nome: 'plugin',
    descricao: 'Lista e instala plugins opcionais',
  },
];

export function registrarComandos(program) {
  for (const { nome, descricao } of STUBS) {
    program
      .command(nome)
      .description(descricao)
      .action(() => {
        abortar(`o comando "${nome}" ainda não foi implementado`);
      });
  }
}
