import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { normalizarCaminhoColado } from '../src/lib/paths.js';

const HOME = os.homedir();

describe('normalizarCaminhoColado', () => {
  it('descasca aspas simples (é assim que o Finder do Mac cola)', () => {
    assert.equal(
      normalizarCaminhoColado("'/tmp/caminho com espaço'"),
      '/tmp/caminho com espaço',
    );
  });

  it('descasca aspas duplas', () => {
    assert.equal(
      normalizarCaminhoColado('"/tmp/caminho com espaço"'),
      '/tmp/caminho com espaço',
    );
  });

  it('desfaz espaços escapados com barra invertida', () => {
    assert.equal(
      normalizarCaminhoColado('/tmp/caminho\\ com\\ espaço'),
      '/tmp/caminho com espaço',
    );
  });

  it('trata o caso misto: aspas E barras de escape', () => {
    assert.equal(
      normalizarCaminhoColado("'/tmp/caminho\\ com\\ espaço'"),
      '/tmp/caminho com espaço',
    );
  });

  it('apara espaços em volta', () => {
    assert.equal(normalizarCaminhoColado('   /tmp/caminho   '), '/tmp/caminho');
    assert.equal(normalizarCaminhoColado("  '/tmp/caminho'  "), '/tmp/caminho');
  });

  it('não mexe num caminho já limpo', () => {
    assert.equal(normalizarCaminhoColado('/tmp/caminho'), '/tmp/caminho');
  });

  it('preserva aspas que não formam par nas pontas', () => {
    // Aspa no meio do nome: as pontas não são invólucro, e descascá-las
    // corromperia o caminho.
    const entrada = "/tmp/aspa de'entrada";
    assert.equal(normalizarCaminhoColado(entrada), entrada);
  });

  it('não descasca quando a aspa também aparece no interior', () => {
    // "'aspa de'entrada'" tem aspa nas pontas E no meio: não é um invólucro
    // balanceado, então nada é removido.
    const entrada = "'aspa de'entrada'";
    assert.equal(
      normalizarCaminhoColado(entrada),
      path.resolve(entrada),
    );
  });

  it('expande o til', () => {
    assert.equal(normalizarCaminhoColado('~/peticia'), path.join(HOME, 'peticia'));
  });

  it('devolve vazio para entrada vazia ou nula', () => {
    assert.equal(normalizarCaminhoColado(''), '');
    assert.equal(normalizarCaminhoColado('   '), '');
    assert.equal(normalizarCaminhoColado(null), '');
    assert.equal(normalizarCaminhoColado(undefined), '');
  });

  it('trata o caminho real do OneDrive colado pelo Finder', () => {
    const colado =
      "'/Users/henriquechaves/Library/CloudStorage/OneDrive-Pessoal/Grupo Reclama/Henrique Chaves/HC - Equipe/Henrique Chaves'";
    assert.equal(
      normalizarCaminhoColado(colado),
      '/Users/henriquechaves/Library/CloudStorage/OneDrive-Pessoal/Grupo Reclama/Henrique Chaves/HC - Equipe/Henrique Chaves',
    );
  });
});
