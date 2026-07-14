import path from 'node:path';

import fs from 'fs-extra';

/**
 * Detecção da estrutura interna da pasta do escritório.
 *
 * Cada alvo devolve { caminho, comoAchou } — o comoAchou existe para a saída
 * ser honesta com o aluno: "achei pelo nome exato" e "achei porque o nome
 * contém 'modelo'" merecem confiança diferente antes dele confirmar.
 */

/**
 * macOS e Windows discordam na normalização Unicode de acentos: "PETIÇÃO" pode
 * chegar como NFC ou NFD dependendo de quem criou a pasta. Sem normalizar, a
 * comparação falha em pastas que existem.
 */
function normalizar(nome) {
  return String(nome).normalize('NFC').toLocaleLowerCase('pt-BR');
}

async function listarDirs(raiz) {
  const entradas = await fs.readdir(raiz, { withFileTypes: true }).catch(() => []);
  return entradas
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

async function listarArquivos(raiz) {
  const entradas = await fs.readdir(raiz, { withFileTypes: true }).catch(() => []);
  return entradas
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

/** Acha um subdiretório pelo nome, ignorando caixa e normalização de acento. */
function acharPorNome(dirs, alvo) {
  const n = normalizar(alvo);
  return dirs.find((d) => normalizar(d) === n) ?? null;
}

function acharPorTrecho(dirs, trechos) {
  return (
    dirs.find((d) => trechos.some((t) => normalizar(d).includes(normalizar(t)))) ?? null
  );
}

async function detectarFila(raiz, dirs) {
  // (a) aninhado: "00 - Para fazer Inicial/00 - BLOQUEIO"
  const pai = acharPorNome(dirs, '00 - Para fazer Inicial');
  if (pai) {
    const filhos = await listarDirs(path.join(raiz, pai));
    const bloqueio = acharPorNome(filhos, '00 - BLOQUEIO');
    if (bloqueio) {
      return {
        caminho: path.join(raiz, pai, bloqueio),
        comoAchou: 'nome exato (fila dentro de bloqueio)',
      };
    }
    // (b) o pai sozinho
    return { caminho: path.join(raiz, pai), comoAchou: 'nome exato' };
  }

  // (c) "01 - Fazer"
  const fazer = acharPorNome(dirs, '01 - Fazer');
  if (fazer) {
    return { caminho: path.join(raiz, fazer), comoAchou: 'nome exato' };
  }

  // (d) qualquer pasta que contenha "fazer" ou "fila"
  const parecido = acharPorTrecho(dirs, ['fazer', 'fila']);
  if (parecido) {
    return {
      caminho: path.join(raiz, parecido),
      comoAchou: 'o nome contém "fazer" ou "fila"',
    };
  }

  return null;
}

function detectarModelos(raiz, dirs) {
  for (const exato of ['MODELOS - PETIÇÃO INICIAL', 'Modelos Iniciais']) {
    const achado = acharPorNome(dirs, exato);
    if (achado) return { caminho: path.join(raiz, achado), comoAchou: 'nome exato' };
  }

  const parecido = acharPorTrecho(dirs, ['modelo']);
  if (parecido) {
    return {
      caminho: path.join(raiz, parecido),
      comoAchou: 'o nome contém "modelo"',
    };
  }

  return null;
}

/** Procura o .docx timbrado na raiz e, se não achar, dentro da pasta de modelos. */
async function detectarTimbrado(raiz, pastaModelos) {
  const locais = [raiz, pastaModelos].filter(Boolean);

  for (const local of locais) {
    const arquivos = await listarArquivos(local);
    const achado = arquivos.find(
      (a) => normalizar(a).includes('timbrado') && normalizar(a).endsWith('.docx'),
    );
    if (achado) {
      return {
        caminho: path.join(local, achado),
        comoAchou:
          local === raiz ? 'arquivo .docx na raiz' : 'arquivo .docx na pasta de modelos',
      };
    }
  }

  return null;
}

function detectarProtocolados(raiz, dirs) {
  for (const exato of ['03 - Protocolados', 'Protocolados']) {
    const achado = acharPorNome(dirs, exato);
    if (achado) return { caminho: path.join(raiz, achado), comoAchou: 'nome exato' };
  }
  return null;
}

/**
 * Alvos na ordem em que o wizard exibe e pergunta.
 *
 * `tipo` é a fonte única da verdade: o mesmo alvo é detectado e validado por
 * ele. O timbrado é um ARQUIVO — tratá-lo como pasta é o que travava o wizard
 * de quem precisava informá-lo à mão.
 */
export const ALVOS = [
  {
    chave: 'fila_entrada',
    rotulo: 'Fila de entrada',
    obrigatorio: true,
    tipo: 'diretorio',
  },
  {
    chave: 'modelos',
    rotulo: 'Pasta de modelos',
    obrigatorio: true,
    tipo: 'diretorio',
  },
  {
    chave: 'timbrado',
    rotulo: 'Timbrado (.docx)',
    obrigatorio: true,
    tipo: 'arquivo',
    extensoes: ['.docx'],
  },
  {
    chave: 'protocolados',
    rotulo: 'Protocolados',
    obrigatorio: false,
    tipo: 'diretorio',
  },
];

/**
 * Varre a raiz do escritório. Devolve, para cada alvo, { caminho, comoAchou }
 * ou null. Nunca lança: uma raiz ilegível vira "não encontrei nada".
 */
export async function detectarEstrutura(raiz) {
  const dirs = await listarDirs(raiz);

  const fila_entrada = await detectarFila(raiz, dirs);
  const modelos = detectarModelos(raiz, dirs);
  const timbrado = await detectarTimbrado(raiz, modelos?.caminho);
  const protocolados = detectarProtocolados(raiz, dirs);

  return { fila_entrada, modelos, timbrado, protocolados };
}
