import inquirer from 'inquirer';

import { locaisSugeridos, normalizarCaminhoColado, pastaPadrao } from './paths.js';
import { cor, dim, info } from './ui.js';

const CUSTOMIZADO = Symbol('customizado');

/**
 * Onde criar a pasta do aluno. Usado por `ativar` e por `configurar` — se cada
 * um perguntasse do seu jeito, o aluno poderia acabar com duas pastas.
 *
 * Em sandbox não pergunta nada: o destino é sempre <BASE>/peticia.
 */
export async function escolherLocal({ sandbox = false } = {}) {
  if (sandbox) return pastaPadrao({ sandbox });

  info('Onde você quer criar a pasta principal do peticia?');
  info('');

  const locais = await locaisSugeridos({ sandbox });

  const { escolha } = await inquirer.prompt([
    {
      type: 'list',
      name: 'escolha',
      message: 'Local:',
      choices: [
        ...locais.map((l) => ({
          name: `${l.nome}  ${cor.fraco(l.caminho)}`,
          value: l.caminho,
        })),
        { name: 'Outro caminho (eu digito)', value: CUSTOMIZADO },
      ],
    },
  ]);

  if (escolha !== CUSTOMIZADO) return escolha;

  dim('Dica: você pode arrastar a pasta para o terminal.');

  const { customizado } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customizado',
      message: 'Caminho completo da pasta:',
      filter: normalizarCaminhoColado,
      // A pasta ainda NÃO existe (é onde ela será criada), então aqui não se
      // valida existência — só que o aluno digitou alguma coisa.
      validate: (v) => (normalizarCaminhoColado(v) ? true : 'Digite um caminho.'),
      transformer: (valor, a, b) => {
        const isFinal = a?.isFinal ?? b?.isFinal ?? false;
        return isFinal ? normalizarCaminhoColado(valor) || valor : valor;
      },
    },
  ]);

  return customizado;
}
