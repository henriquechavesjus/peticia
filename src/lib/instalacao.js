import path from 'node:path';

import fs from 'fs-extra';

import { SUBPASTAS } from '../constants.js';
import {
  arquivoInstalacao,
  ehWindows,
  linkAgentes,
  pastaAgentes,
  pastaAgentesClaude,
  pastaConfig,
  pastaEstado,
} from './paths.js';
import { aviso } from './ui.js';

/**
 * Estrutura local da instalação, compartilhada por `ativar` e `configurar`.
 *
 * Os dois comandos criam a mesma pasta e escrevem o mesmo ponteiro. Duplicar
 * essa lógica produziria dois instalacao.json com formatos divergentes — e o
 * status leria só um deles.
 */

export const SCHEMA_INSTALACAO = 1;

const README = (destino) => `# peticia

Esta é a sua pasta de trabalho do peticia (\`${destino}\`).
O que você editar aqui é seu: o peticia não sobrescreve suas alterações.

## As pastas

- \`agentes/\` — os agentes que redigem, revisam, organizam e conferem.
  Depois da instalação, eles são seus: pode editar o texto de cada um.
- \`workflows/\` — os pipelines que encadeiam os agentes.
- \`lib/\` — o motor de formatação das peças.
- \`ferramentas/\` — integrações opcionais (ex: revisão via OpenAI).
- \`config/\` — sua configuração: escritorio.json (seu escritório) e
  modulos.json (o que sua licença libera).

## Arquivos sensíveis

- \`.env\` — guarda sua chave da OpenAI, se você configurou uma.
  Não compartilhe este arquivo e não o coloque em nenhum repositório.

## Para mudar algo

    peticia configurar     refaz a configuração do escritório
    peticia status         mostra o estado da instalação
    peticia editar         abre esta pasta
`;

/** Cria as subpastas com .gitkeep e o README. Nunca apaga nada que já exista. */
export async function criarEstrutura(destino) {
  await fs.ensureDir(destino);

  for (const sub of SUBPASTAS) {
    await fs.ensureDir(path.join(destino, sub));
    const marca = path.join(destino, sub, '.gitkeep');
    if (!(await fs.pathExists(marca))) {
      await fs.writeFile(marca, '');
    }
  }

  await fs.writeFile(path.join(destino, 'README.md'), README(destino));
  await proteger(pastaConfig(destino), 0o700);
}

/**
 * Escreve o ponteiro preservando o que já estava lá.
 *
 * `ativar` grava email/nome/device_id; `configurar` grava a pasta escolhida.
 * Um sobrescrever o arquivo do outro apagaria metade da instalação, então
 * aqui os campos se somam e a data de criação original é mantida.
 */
export async function escreverPonteiro(destino, opcoes, campos) {
  const arquivo = arquivoInstalacao(opcoes);

  let atual = {};
  if (await fs.pathExists(arquivo)) {
    atual = await fs.readJson(arquivo).catch(() => ({}));
  }

  const ponteiro = {
    ...atual,
    ...campos,
    schema_versao: SCHEMA_INSTALACAO,
    pasta_peticia: destino,
    criado_em: atual.criado_em ?? campos.criado_em,
    atualizado_em: campos.criado_em,
    so: process.platform,
  };

  await fs.ensureDir(pastaEstado(opcoes));
  await fs.writeJson(arquivo, ponteiro, { spaces: 2 });

  return ponteiro;
}

/**
 * O link que faz o Claude Code enxergar os agentes.
 *
 * No Windows usamos 'junction': criar symlink de diretório lá exige privilégio
 * de administrador, e junction não exige. Se já existir algo no caminho, não
 * mexemos — pode ser um link que o aluno criou à mão.
 */
export async function criarLinkAgentes(destino, opcoes) {
  const link = linkAgentes(opcoes);
  const alvo = pastaAgentes(destino);

  await fs.ensureDir(pastaAgentesClaude(opcoes));

  try {
    await fs.lstat(link);
    return { criado: false, jaExistia: true, link, alvo };
  } catch {
    // não existe: é o caso normal
  }

  await fs.symlink(alvo, link, ehWindows ? 'junction' : 'dir');
  return { criado: true, jaExistia: false, link, alvo };
}

/** chmod não tem efeito real no Windows: prometer 600 lá seria mentira. */
let avisouWindows = false;
export async function proteger(alvo, modo = 0o600) {
  if (ehWindows) {
    if (!avisouWindows) {
      aviso('no Windows as permissões de arquivo não são restringidas pelo peticia;');
      aviso('mantenha o .env fora de pastas compartilhadas.');
      avisouWindows = true;
    }
    return;
  }
  await fs.chmod(alvo, modo);
}
