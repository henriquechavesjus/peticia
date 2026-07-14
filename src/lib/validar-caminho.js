import path from 'node:path';

import fs from 'fs-extra';

import { normalizarCaminhoColado } from './paths.js';

/**
 * Validação de caminho por tipo de alvo.
 *
 * Existe como módulo próprio porque a versão anterior vivia dentro do wizard e,
 * por isso, não tinha teste: ela exigia diretório para TODOS os alvos, o que
 * tornava impossível informar o timbrado (um .docx) à mão quando a detecção
 * automática falhava — um loop sem saída para quem tem estrutura de pastas
 * diferente da esperada.
 *
 * Devolve `true` ou a mensagem de erro (é o contrato de validate do inquirer).
 */
export async function validarCaminho(
  entrada,
  { tipo = 'diretorio', extensoes = null, opcional = false } = {},
) {
  const caminho = normalizarCaminhoColado(entrada);
  const ehArquivo = tipo === 'arquivo';
  const artigo = ehArquivo ? 'do arquivo' : 'da pasta';

  if (!caminho) {
    return opcional ? true : `Digite o caminho ${artigo}.`;
  }

  if (!(await fs.pathExists(caminho))) {
    return `${ehArquivo ? 'O arquivo não existe' : 'A pasta não existe'}: ${caminho}`;
  }

  const stat = await fs.stat(caminho);

  // Diz o que se esperava E o que veio: "não é uma pasta" num prompt de
  // timbrado deixa o aluno sem saber o que fazer.
  if (ehArquivo && stat.isDirectory()) {
    return `Esperava um arquivo, mas isso é uma pasta: ${caminho}`;
  }
  if (!ehArquivo && !stat.isDirectory()) {
    return `Esperava uma pasta, mas isso é um arquivo: ${caminho}`;
  }

  if (ehArquivo && extensoes?.length) {
    const ext = path.extname(caminho).toLowerCase();
    if (!extensoes.includes(ext)) {
      return `O arquivo precisa ser ${extensoes.join(' ou ')} (este é ${ext || 'sem extensão'}).`;
    }
  }

  return true;
}
