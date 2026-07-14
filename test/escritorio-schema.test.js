import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizarNumeroOab,
  numeroOabValido,
  oab,
  oabTexto,
} from '../src/lib/escritorio-schema.js';

describe('normalizarNumeroOab', () => {
  it('canoniza o mesmo número escrito de jeitos diferentes', () => {
    // O ponto do exercício: as três formas têm de produzir a MESMA string,
    // porque é ela que sai impressa no rodapé da petição.
    assert.equal(normalizarNumeroOab('37189'), '37.189');
    assert.equal(normalizarNumeroOab('37-189'), '37.189');
    assert.equal(normalizarNumeroOab('37.189'), '37.189');
    assert.equal(normalizarNumeroOab('abc37189/BA'), '37.189');
  });

  it('descarta espaços e zeros à esquerda', () => {
    assert.equal(normalizarNumeroOab('  37.189  '), '37.189');
    assert.equal(normalizarNumeroOab('037189'), '37.189');
    assert.equal(normalizarNumeroOab('0037189'), '37.189');
  });

  it('pontua números de 6 dígitos', () => {
    assert.equal(normalizarNumeroOab('501909'), '501.909');
    assert.equal(normalizarNumeroOab('251948'), '251.948');
  });

  it('pontua o máximo de 8 dígitos', () => {
    assert.equal(normalizarNumeroOab('12345678'), '12.345.678');
  });

  it('é idempotente (o filter do inquirer pode reaplicar)', () => {
    assert.equal(normalizarNumeroOab(normalizarNumeroOab('37189')), '37.189');
  });

  it('devolve string vazia quando não há dígito nenhum', () => {
    assert.equal(normalizarNumeroOab('abc'), '');
    assert.equal(normalizarNumeroOab(''), '');
    assert.equal(normalizarNumeroOab(null), '');
    assert.equal(normalizarNumeroOab(undefined), '');
  });
});

describe('numeroOabValido', () => {
  it('aceita de 3 a 8 dígitos, em qualquer formatação', () => {
    assert.equal(numeroOabValido('123'), true);
    assert.equal(numeroOabValido('37189'), true);
    assert.equal(numeroOabValido('37-189'), true);
    assert.equal(numeroOabValido('37.189'), true);
    assert.equal(numeroOabValido('abc37189/BA'), true);
    assert.equal(numeroOabValido('12345678'), true);
  });

  it('rejeita número curto demais', () => {
    assert.equal(numeroOabValido('5'), false);
    assert.equal(numeroOabValido('42'), false);
  });

  it('rejeita número longo demais', () => {
    assert.equal(numeroOabValido('123456789'), false);
  });

  it('rejeita entrada sem dígito e vazia', () => {
    assert.equal(numeroOabValido('abc'), false);
    assert.equal(numeroOabValido(''), false);
    assert.equal(numeroOabValido('   '), false);
    assert.equal(numeroOabValido(null), false);
  });

  it('rejeita zeros que não sobram dígito suficiente', () => {
    // "005" tem 3 caracteres, mas só um dígito significativo.
    assert.equal(numeroOabValido('005'), false);
  });
});

describe('oab / oabTexto', () => {
  it('monta o par uf+numero já canonizado', () => {
    assert.deepEqual(oab('ba', '37189'), { uf: 'BA', numero: '37.189' });
    assert.deepEqual(oab(' sp ', '501-909'), { uf: 'SP', numero: '501.909' });
  });

  it('exibe como sai impresso na petição', () => {
    assert.equal(oabTexto(oab('ba', '37189')), 'OAB/BA 37.189');
    assert.equal(oabTexto(oab('sp', '501909')), 'OAB/SP 501.909');
  });
});
