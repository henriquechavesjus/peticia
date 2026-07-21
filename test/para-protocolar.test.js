import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { ALVOS, detectarEstrutura } from '../src/lib/detectar-pastas.js';
import { montarEscritorio } from '../src/lib/escritorio-schema.js';

let TMP;

/** Cria uma raiz de escritório com as subpastas dadas e devolve o caminho. */
async function raizCom(nome, subpastas) {
  const raiz = path.join(TMP, nome);
  for (const sub of subpastas) {
    await fs.ensureDir(path.join(raiz, sub));
  }
  return raiz;
}

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-pp-'));
});

after(async () => {
  await fs.remove(TMP);
});

describe('detecção de para_protocolar', () => {
  it('detecta "02 - Para Protocolar"', async () => {
    const raiz = await raizCom('a', ['01 - Fazer', '02 - Para Protocolar']);
    const r = await detectarEstrutura(raiz);
    assert.ok(r.para_protocolar, 'não detectou');
    assert.equal(path.basename(r.para_protocolar.caminho), '02 - Para Protocolar');
  });

  it('detecta "A Protocolar"', async () => {
    const raiz = await raizCom('b', ['A Protocolar']);
    const r = await detectarEstrutura(raiz);
    assert.ok(r.para_protocolar);
    assert.equal(path.basename(r.para_protocolar.caminho), 'A Protocolar');
  });

  it('NÃO confunde "03 - Protocolados" com para_protocolar', async () => {
    const raiz = await raizCom('c', ['03 - Protocolados']);
    const r = await detectarEstrutura(raiz);

    assert.equal(r.para_protocolar, null, 'protocolados vazou como para_protocolar');
    // Mas protocolados foi corretamente detectado.
    assert.ok(r.protocolados);
    assert.equal(path.basename(r.protocolados.caminho), '03 - Protocolados');
  });

  it('separa as duas quando ambas existem', async () => {
    const raiz = await raizCom('d', ['02 - Para Protocolar', '03 - Protocolados']);
    const r = await detectarEstrutura(raiz);

    assert.equal(path.basename(r.para_protocolar.caminho), '02 - Para Protocolar');
    assert.equal(path.basename(r.protocolados.caminho), '03 - Protocolados');
  });

  it('devolve null quando não há pasta de protocolar', async () => {
    const raiz = await raizCom('e', ['01 - Fazer', 'Modelos']);
    const r = await detectarEstrutura(raiz);
    assert.equal(r.para_protocolar, null);
  });

  it('para_protocolar está em ALVOS como diretório opcional, logo após a fila', () => {
    const chaves = ALVOS.map((a) => a.chave);
    assert.equal(chaves[1], 'para_protocolar', 'não é o 2º alvo');
    const alvo = ALVOS.find((a) => a.chave === 'para_protocolar');
    assert.equal(alvo.tipo, 'diretorio');
    assert.equal(alvo.obrigatorio, false);
  });
});

describe('schema com para_protocolar', () => {
  const base = {
    advogado: {
      nome: 'Henrique Chaves',
      oabPrincipal: { uf: 'BA', numero: '37.189' },
      oabsSuplementares: {},
    },
    formatacao: {},
    criadoEm: '2026-07-21T00:00:00.000Z',
  };

  it('grava para_protocolar quando informado', () => {
    const obj = montarEscritorio({
      ...base,
      escritorios: [
        {
          nome: 'HC',
          raiz: '/x',
          estrutura: {
            fila_entrada: '/x/01',
            para_protocolar: '/x/02 - Para Protocolar',
            modelos: '/x/Modelos',
            timbrado: '/x/Timbrado.docx',
            protocolados: null,
          },
        },
      ],
    });
    assert.equal(obj.escritorios[0].estrutura.para_protocolar, '/x/02 - Para Protocolar');
  });

  it('aceita para_protocolar null (aluno pulou)', () => {
    const obj = montarEscritorio({
      ...base,
      escritorios: [
        { nome: 'HC', raiz: '/x', estrutura: { fila_entrada: '/x/01' } },
      ],
    });
    assert.equal(obj.escritorios[0].estrutura.para_protocolar, null);
  });
});
