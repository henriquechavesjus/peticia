import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { pastaDaAtivacao } from '../src/commands/configurar.js';

/**
 * O configurar deve pular a Etapa 0 (onde criar a pasta) quando o ativar já
 * rodou. A decisão está em pastaDaAtivacao: devolve a pasta se o ativar rodou
 * (ponteiro com agentes_instalados), senão null (configurar pergunta).
 */

let TMP;

/** Escreve o ponteiro <base>/.peticia/instalacao.json com os campos dados. */
async function escreverPonteiro(base, dados) {
  await fs.ensureDir(path.join(base, '.peticia'));
  await fs.writeJson(path.join(base, '.peticia', 'instalacao.json'), dados);
}

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-etapa0-'));
});

after(async () => {
  await fs.remove(TMP);
});

describe('pastaDaAtivacao', () => {
  it('ativou e configura: devolve a pasta do ativar (pula a Etapa 0)', async () => {
    const base = path.join(TMP, 'ativou');
    const home = path.join(base, 'peticia');
    await escreverPonteiro(base, {
      pasta_peticia: home,
      agentes_instalados: ['redator', 'maestro'],
    });

    assert.equal(await pastaDaAtivacao({ base }), home);
  });

  it('configurou sem ativar: devolve null (pergunta a Etapa 0)', async () => {
    const base = path.join(TMP, 'so-configurou');
    // O configurar grava o ponteiro, mas SEM agentes_instalados.
    await escreverPonteiro(base, { pasta_peticia: path.join(base, 'peticia') });

    assert.equal(await pastaDaAtivacao({ base }), null);
  });

  it('sem ponteiro nenhum: devolve null', async () => {
    const base = path.join(TMP, 'nada');
    await fs.ensureDir(base);

    assert.equal(await pastaDaAtivacao({ base }), null);
  });

  it('ponteiro com agentes_instalados vazio: devolve null', async () => {
    const base = path.join(TMP, 'vazio');
    await escreverPonteiro(base, {
      pasta_peticia: path.join(base, 'peticia'),
      agentes_instalados: [],
    });

    assert.equal(await pastaDaAtivacao({ base }), null);
  });
});
