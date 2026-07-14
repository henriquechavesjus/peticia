import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'fs-extra';

import { LINK_AGENTES, PASTA_ALUNO } from '../constants.js';

export const ehWindows = process.platform === 'win32';
export const ehMac = process.platform === 'darwin';

/**
 * Raiz de tudo. Em modo sandbox, ~/.peticia-sandbox faz o papel da home:
 * o estado e a pasta do aluno passam a viver lá dentro, e nada toca o ~/ real.
 */
export function baseHome({ sandbox = false, base } = {}) {
  if (base) return base; // usado pelos testes, para não depender da home real
  return sandbox ? path.join(os.homedir(), '.peticia-sandbox') : os.homedir();
}

/** Estado interno do CLI: <BASE>/.peticia */
export function pastaEstado(opcoes) {
  return path.join(baseHome(opcoes), '.peticia');
}

/** O ponteiro que diz onde o aluno mandou criar a pasta principal. */
export function arquivoInstalacao(opcoes) {
  return path.join(pastaEstado(opcoes), 'instalacao.json');
}

/** Local padrão da pasta do aluno, se ele não escolher outro. */
export function pastaPadrao(opcoes) {
  return path.join(baseHome(opcoes), PASTA_ALUNO);
}

export class NaoConfigurado extends Error {
  constructor() {
    super('o peticia ainda não foi configurado neste computador');
    this.name = 'NaoConfigurado';
    this.dica = 'Rode "peticia configurar" primeiro.';
  }
}

export class InstalacaoInvalida extends Error {
  constructor(arquivo) {
    super(`o arquivo de instalação está ilegível: ${arquivo}`);
    this.name = 'InstalacaoInvalida';
    this.dica = 'Rode "peticia configurar" para recriá-lo.';
  }
}

/**
 * Onde vive a pasta do aluno. Toda leitura futura passa por aqui.
 * Lança NaoConfigurado se o wizard nunca rodou.
 */
export async function getPeticiaHome(opcoes = {}) {
  const arquivo = arquivoInstalacao(opcoes);

  if (!(await fs.pathExists(arquivo))) {
    throw new NaoConfigurado();
  }

  let dados;
  try {
    dados = await fs.readJson(arquivo);
  } catch {
    throw new InstalacaoInvalida(arquivo);
  }

  if (!dados?.pasta_peticia) {
    throw new InstalacaoInvalida(arquivo);
  }

  return dados.pasta_peticia;
}

// --- caminhos derivados da pasta do aluno ---

export const pastaConfig = (home) => path.join(home, 'config');
export const arquivoEscritorio = (home) => path.join(pastaConfig(home), 'escritorio.json');
export const arquivoEnv = (home) => path.join(home, '.env');
export const pastaAgentes = (home) => path.join(home, 'agentes');

/** Onde o Claude Code procura agentes. */
export function pastaAgentesClaude(opcoes) {
  return path.join(baseHome(opcoes), '.claude', 'agents');
}

/** O link ~/.claude/agents/peticia -> <pasta do aluno>/agentes */
export function linkAgentes(opcoes) {
  return path.join(pastaAgentesClaude(opcoes), LINK_AGENTES);
}

// --- caminhos do próprio pacote ---

export function raizPacote() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function pastaTemplates() {
  return path.join(raizPacote(), 'templates');
}

// --- utilidades ---

/**
 * Normaliza um caminho que o aluno colou ou arrastou para o terminal.
 * Arrastar uma pasta no Terminal do Mac cola com espaços escapados ("Meus\ Casos")
 * e, se o caminho tiver aspas, elas vêm junto. Nada disso é um caminho válido.
 */
export function normalizarCaminhoColado(entrada) {
  let s = String(entrada ?? '').trim();

  // Só descasca a aspa quando ela é mesmo um invólucro: aparece nas duas pontas
  // e em nenhum outro lugar. Um nome que contenha aspa no meio ("aspa de'entrada")
  // fica intacto, em vez de perder as pontas por engano.
  for (const aspa of ['"', "'"]) {
    if (s.length >= 2 && s.startsWith(aspa) && s.endsWith(aspa)) {
      const interior = s.slice(1, -1);
      if (!interior.includes(aspa)) {
        s = interior;
        break;
      }
    }
  }

  s = s.replace(/\\ /g, ' ').trim();

  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) {
    s = path.join(os.homedir(), s.slice(1));
  }

  return s ? path.resolve(s) : '';
}

/**
 * Locais oferecidos na etapa 0. O nome de "Documentos" e "Desktop" muda com o
 * idioma do SO, então só ofereço o que existe de fato nesta máquina.
 */
export async function locaisSugeridos(opcoes = {}) {
  const base = baseHome(opcoes);
  const locais = [{ nome: '~/peticia (recomendado)', caminho: pastaPadrao(opcoes) }];

  const familias = [
    ['Documentos', 'Documents'],
    ['Desktop', 'Área de Trabalho'],
  ];

  for (const candidatos of familias) {
    for (const candidato of candidatos) {
      const dir = path.join(base, candidato);
      if (await fs.pathExists(dir)) {
        locais.push({
          nome: `~/${candidato}/${PASTA_ALUNO}`,
          caminho: path.join(dir, PASTA_ALUNO),
        });
        break;
      }
    }
  }

  return locais;
}
