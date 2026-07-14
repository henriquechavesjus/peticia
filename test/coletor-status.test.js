import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { coletarStatus } from '../src/lib/coletor-status.js';
import { NaoConfigurado } from '../src/lib/paths.js';

/**
 * Cada cenário monta uma instalação inteira num diretório temporário e passa
 * `base` para o coletor — assim os testes nunca tocam a home real.
 */

let TMP;

const CRIADO_EM = '2026-07-14T09:12:33.000Z';

function escritorioJson(raiz, { timbrado = true, protocolados = true } = {}) {
  return {
    schema_versao: 1,
    criado_em: CRIADO_EM,
    advogado: {
      nome: 'Henrique Chaves',
      oab_principal: { uf: 'BA', numero: '37.189' },
      oabs_suplementares: { SP: '501.909' },
    },
    escritorios: [
      {
        nome: 'Chaves e Matos',
        raiz,
        assinatura_dupla: true,
        socio: { nome: 'Daniel Matos', oab: { uf: 'BA', numero: '42.004' } },
        estrutura: {
          fila_entrada: path.join(raiz, 'fila'),
          modelos: path.join(raiz, 'modelos'),
          timbrado: timbrado ? path.join(raiz, 'Timbrado.docx') : null,
          protocolados: protocolados ? path.join(raiz, 'protocolados') : null,
        },
      },
    ],
    formatacao: {
      fonte_corpo: 'Calibri Light',
      tamanho_corpo: 12,
      tamanho_citacao: 10,
      espacamento_linhas: 1.2,
      espacamento_depois_paragrafo_pt: 6,
      recuo_primeira_linha_cm: 1.25,
      alinhamento: 'justificado',
    },
  };
}

/** Monta uma instalação completa e devolve { base, home, raiz }. */
async function montarCenario(nome, opcoes = {}) {
  const base = path.join(TMP, nome);
  const home = path.join(base, 'peticia');
  const raiz = path.join(base, 'Escritorio');

  await fs.ensureDir(path.join(home, 'config'));
  await fs.ensureDir(path.join(home, 'agentes'));

  await fs.ensureDir(path.join(raiz, 'fila'));
  await fs.ensureDir(path.join(raiz, 'modelos'));
  await fs.ensureDir(path.join(raiz, 'protocolados'));
  await fs.writeFile(path.join(raiz, 'Timbrado.docx'), '');

  // Casos pendentes: 3 pastas + 1 arquivo solto + 1 oculta (não devem contar).
  for (const caso of ['0001 Fulano', '0002 Beltrano', '0003 Sicrano']) {
    await fs.ensureDir(path.join(raiz, 'fila', caso));
  }
  await fs.writeFile(path.join(raiz, 'fila', 'anotacoes.txt'), '');
  await fs.ensureDir(path.join(raiz, 'fila', '.oculta'));

  await fs.ensureDir(path.join(base, '.peticia'));
  await fs.writeJson(path.join(base, '.peticia', 'instalacao.json'), {
    schema_versao: 1,
    pasta_peticia: home,
    criado_em: CRIADO_EM,
    versao_cli: opcoes.versaoCli ?? '0.1.0',
    so: process.platform,
  });

  await fs.writeJson(
    path.join(home, 'config', 'escritorio.json'),
    escritorioJson(raiz, opcoes),
  );

  if (opcoes.comOpenai) {
    await fs.writeFile(path.join(home, '.env'), 'OPENAI_API_KEY=sk-falsa\n');
  }
  if (opcoes.comLink) {
    await fs.ensureDir(path.join(base, '.claude', 'agents'));
    await fs.symlink(path.join(home, 'agentes'), path.join(base, '.claude', 'agents', 'peticia'));
  }

  return { base, home, raiz };
}

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-status-'));
});

after(async () => {
  await fs.remove(TMP);
});

describe('coletarStatus', () => {
  it('lança NaoConfigurado quando não há ponteiro', async () => {
    const base = path.join(TMP, 'vazio');
    await fs.ensureDir(base);
    await assert.rejects(() => coletarStatus({ base }), NaoConfigurado);
  });

  it('coleta uma instalação saudável sem avisos', async () => {
    const { base, home } = await montarCenario('feliz', { comOpenai: true, comLink: true });
    const s = await coletarStatus({ base });

    assert.equal(s.instalacao.pasta, home);
    assert.equal(s.instalacao.criado_em, CRIADO_EM);
    assert.equal(s.advogado.nome, 'Henrique Chaves');
    assert.equal(s.advogado.oab_principal.texto, 'OAB/BA 37.189');
    assert.deepEqual(
      s.advogado.suplementares.map((o) => o.texto),
      ['OAB/SP 501.909'],
    );
    assert.equal(s.escritorios[0].socio.oab.texto, 'OAB/BA 42.004');
    assert.equal(s.integracoes.openai.configurada, true);
    assert.equal(s.integracoes.claude_code.conectado, true);
    assert.equal(s.integracoes.claude_code.apontaCerto, true);
    assert.deepEqual(s.avisos, []);
  });

  it('conta só as subpastas diretas da fila', async () => {
    const { base } = await montarCenario('fila', { comLink: true });
    const s = await coletarStatus({ base });

    // 3 pastas de caso; o arquivo solto e a pasta oculta ficam de fora.
    assert.equal(s.escritorios[0].estrutura.fila.pastas, 3);
  });

  it('avisa quando um caminho configurado sumiu do disco', async () => {
    const { base, raiz } = await montarCenario('sumiu', { comLink: true });
    await fs.remove(path.join(raiz, 'modelos'));

    const s = await coletarStatus({ base });

    assert.equal(s.escritorios[0].estrutura.modelos.existe, false);
    assert.ok(s.avisos.some((a) => a.includes('modelos') && a.includes('não existe mais')));
  });

  it('marca a fila como inacessível quando ela não existe', async () => {
    const { base, raiz } = await montarCenario('sem-fila', { comLink: true });
    await fs.remove(path.join(raiz, 'fila'));

    const s = await coletarStatus({ base });

    assert.equal(s.escritorios[0].estrutura.fila.existe, false);
    assert.equal(s.escritorios[0].estrutura.fila.pastas, null);
  });

  it('trata timbrado não configurado sem virar aviso', async () => {
    const { base } = await montarCenario('sem-timbrado', { timbrado: false, comLink: true });
    const s = await coletarStatus({ base });

    assert.equal(s.escritorios[0].estrutura.timbrado.configurado, false);
    // Não configurar o timbrado é uma escolha, não um defeito.
    assert.deepEqual(s.avisos, []);
  });

  it('avisa quando o link do Claude Code não existe', async () => {
    const { base } = await montarCenario('sem-link');
    const s = await coletarStatus({ base });

    assert.equal(s.integracoes.claude_code.conectado, false);
    assert.ok(s.avisos.some((a) => a.includes('Claude Code')));
  });

  it('avisa quando a versão instalada difere da atual', async () => {
    const { base } = await montarCenario('versao-velha', {
      versaoCli: '0.0.1',
      comLink: true,
    });
    const s = await coletarStatus({ base });

    assert.equal(s.instalacao.versao_instalada, '0.0.1');
    assert.ok(s.avisos.some((a) => a.includes('0.0.1')));
  });

  it('reporta erro de schema como aviso', async () => {
    const { base, home } = await montarCenario('schema-ruim', { comLink: true });
    const arquivo = path.join(home, 'config', 'escritorio.json');
    const config = await fs.readJson(arquivo);
    config.advogado.oab_principal.uf = 'XX'; // UF inexistente
    await fs.writeJson(arquivo, config);

    const s = await coletarStatus({ base });

    assert.ok(s.avisos.some((a) => a.startsWith('escritorio.json:')));
  });

  it('nunca expõe a chave da OpenAI', async () => {
    const { base } = await montarCenario('segredo', { comOpenai: true, comLink: true });
    const s = await coletarStatus({ base });

    assert.equal(s.integracoes.openai.configurada, true);
    assert.ok(!JSON.stringify(s).includes('sk-falsa'));
  });
});
