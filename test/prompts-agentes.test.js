import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import fs from 'fs-extra';

import { pastaTemplates } from '../src/lib/paths.js';

/**
 * Um agente é um prompt em markdown, não código — não dá para unit-testar o
 * julgamento do LLM de forma estável. Mas dá para garantir que o prompt CONTÉM
 * as instruções que decidimos: se alguém apagar a porta de aborto do redator ou
 * um veredito do conferente, isto pega a regressão.
 */

const agente = (nome) =>
  fs.readFile(path.join(pastaTemplates(), 'agentes', nome), 'utf8');

describe('redator.md — conferência cruzada (porta de entrada)', () => {
  it('mantém a checagem de PRESENÇA dos 3 documentos', async () => {
    const t = await agente('redator.md');
    assert.match(t, /CONFERÊNCIA OBRIGATÓRIA DE DOCUMENTOS/);
  });

  it('tem a porta de aborto ANTES de redigir, com a regra de ouro', async () => {
    const t = await agente('redator.md');
    assert.match(t, /ANTES de redigir/i);
    assert.match(t, /PARE\. Não redija/);
    assert.match(t, /CPF divergente/i);
    assert.match(t, /Comprovante em nome de terceiro sem vínculo/i);
    assert.match(t, /Procuração sem assinatura/i);
  });

  it('preserva a nuance: grafia divergente com CPF batendo NÃO bloqueia', async () => {
    const t = await agente('redator.md');
    // A grafia tem de estar entre os ALERTAS, não entre os bloqueios.
    assert.match(t, /Grafia do nome.*NÃO bloqueia|NÃO bloqueia.*mesma pessoa/s);
    assert.match(t, /mais de 3 meses.*decide|registre.*data de emissão/s);
  });

  it('inclui o formato do relatório de aborto', async () => {
    const t = await agente('redator.md');
    assert.match(t, /Não vou redigir esta inicial/);
  });
});

describe('conferente.md — validação final', () => {
  it('é um agente Sonnet', async () => {
    const t = await agente('conferente.md');
    assert.match(t, /^---[\s\S]*model:\s*sonnet[\s\S]*?---/);
  });

  it('tem os três vereditos', async () => {
    const t = await agente('conferente.md');
    assert.match(t, /🟢 PRONTO PARA PROTOCOLO/);
    assert.match(t, /🟡 ATENÇÃO/);
    assert.match(t, /🔴 NÃO PODE PROTOCOLAR/);
  });

  it('cobre as verificações cruzadas A–G', async () => {
    const t = await agente('conferente.md');
    for (const marca of ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.']) {
      assert.ok(t.includes(`**${marca}`), `falta a verificação ${marca}`);
    }
    assert.match(t, /assinatura_dupla/);
    assert.match(t, /oabs_suplementares/);
  });

  it('sabe que a inicial em .docx é o esperado (não pendência)', async () => {
    const t = await agente('conferente.md');
    assert.match(t, /\.docx.*ESPERADO|ESPERADO.*não uma pendência/s);
  });
});

describe('maestro.md — orquestração', () => {
  it('é um agente Sonnet', async () => {
    const t = await agente('maestro.md');
    assert.match(t, /^---[\s\S]*model:\s*sonnet[\s\S]*?---/);
  });

  it('coordena os 4 agentes na sequência do pipeline', async () => {
    const t = await agente('maestro.md');
    // As etapas do pipeline são marcadas "a) redator", "b) revisor-gpt", etc.
    const etapas = ['a) redator', 'b) revisor-gpt', 'c) organizador', 'd) conferente'];
    let pos = -1;
    for (const marca of etapas) {
      const i = t.indexOf(marca);
      assert.ok(i > pos, `etapa fora de ordem no pipeline: ${marca}`);
      pos = i;
    }
  });

  it('faz seleção de escritório (1/pergunta) e pula redator que abortou', async () => {
    const t = await agente('maestro.md');
    assert.match(t, /PARE e pergunte|Nunca presuma/);
    assert.match(t, /abortou.*PULE|PULE para a próxima/s);
  });

  it('pula o revisor-gpt com nota quando falta chave, e confirma antes de lote', async () => {
    const t = await agente('maestro.md');
    assert.match(t, /revisor-gpt pulado/);
    assert.match(t, /Prosseguir\?/);
  });

  it('nunca menciona custo em dinheiro — só tempo', async () => {
    const t = await agente('maestro.md');
    // Sem cifras em dólar/real em lugar nenhum do prompt.
    assert.ok(!/\$\s?\d|R\$\s?\d/.test(t), 'o maestro menciona custo em dinheiro');
    assert.match(t, /minutos/);
  });
});
