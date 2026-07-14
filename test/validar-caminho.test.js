import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { ALVOS } from '../src/lib/detectar-pastas.js';
import { validarCaminho } from '../src/lib/validar-caminho.js';

let TMP;
let PASTA;
let DOCX;
let PDF;

const TIMBRADO = { tipo: 'arquivo', extensoes: ['.docx'] };
const DIRETORIO = { tipo: 'diretorio' };

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-valida-'));
  PASTA = path.join(TMP, 'Modelos Iniciais');
  DOCX = path.join(TMP, 'Timbrado.docx');
  PDF = path.join(TMP, 'Timbrado.pdf');

  await fs.ensureDir(PASTA);
  await fs.writeFile(DOCX, '');
  await fs.writeFile(PDF, '');
});

after(async () => {
  await fs.remove(TMP);
});

describe('validarCaminho — alvos de diretório', () => {
  it('aceita uma pasta existente', async () => {
    assert.equal(await validarCaminho(PASTA, DIRETORIO), true);
  });

  it('rejeita um arquivo onde se espera pasta', async () => {
    const r = await validarCaminho(DOCX, DIRETORIO);
    assert.match(r, /Esperava uma pasta/);
  });

  it('rejeita caminho inexistente', async () => {
    const r = await validarCaminho(path.join(TMP, 'nao-existe'), DIRETORIO);
    assert.match(r, /A pasta não existe/);
  });
});

describe('validarCaminho — timbrado (arquivo .docx)', () => {
  it('aceita um .docx existente', async () => {
    assert.equal(await validarCaminho(DOCX, TIMBRADO), true);
  });

  it('aceita .DOCX em maiúsculas', async () => {
    const maiusculo = path.join(TMP, 'TIMBRADO.DOCX');
    await fs.writeFile(maiusculo, '');
    assert.equal(await validarCaminho(maiusculo, TIMBRADO), true);
  });

  it('rejeita uma pasta onde se espera arquivo', async () => {
    // Este é o bug que travava o wizard: antes, o timbrado era validado como
    // diretório e NENHUM .docx passava.
    const r = await validarCaminho(PASTA, TIMBRADO);
    assert.match(r, /Esperava um arquivo/);
  });

  it('rejeita extensão errada', async () => {
    const r = await validarCaminho(PDF, TIMBRADO);
    assert.match(r, /precisa ser \.docx/);
  });

  it('rejeita arquivo inexistente', async () => {
    const r = await validarCaminho(path.join(TMP, 'nada.docx'), TIMBRADO);
    assert.match(r, /O arquivo não existe/);
  });
});

describe('validarCaminho — opcional e entrada colada', () => {
  it('deixa passar vazio quando é opcional (Enter para pular)', async () => {
    assert.equal(await validarCaminho('', { ...DIRETORIO, opcional: true }), true);
    assert.equal(await validarCaminho('   ', { ...TIMBRADO, opcional: true }), true);
  });

  it('exige o caminho quando não é opcional', async () => {
    assert.match(await validarCaminho('', DIRETORIO), /Digite o caminho da pasta/);
    assert.match(await validarCaminho('', TIMBRADO), /Digite o caminho do arquivo/);
  });

  it('aceita caminho colado com aspas do Finder — pasta e arquivo', async () => {
    assert.equal(await validarCaminho(`'${PASTA}'`, DIRETORIO), true);
    assert.equal(await validarCaminho(`'${DOCX}'`, TIMBRADO), true);
  });
});

describe('ALVOS', () => {
  it('declara o timbrado como arquivo .docx e o resto como diretório', () => {
    const porChave = Object.fromEntries(ALVOS.map((a) => [a.chave, a]));

    assert.equal(porChave.timbrado.tipo, 'arquivo');
    assert.deepEqual(porChave.timbrado.extensoes, ['.docx']);
    assert.equal(porChave.fila_entrada.tipo, 'diretorio');
    assert.equal(porChave.modelos.tipo, 'diretorio');
    assert.equal(porChave.protocolados.tipo, 'diretorio');
  });
});
