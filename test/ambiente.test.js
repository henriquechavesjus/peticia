import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { temClaude, validarInstalacao } from '../src/lib/ambiente.js';
import { TEMPLATES } from '../src/lib/instalacao.js';

let TMP;

/**
 * Monta uma instalação completa e válida em base/, e devolve os caminhos das
 * peças, para cada teste derrubar uma e ver o problema específico.
 */
async function montarValida(nome) {
  const base = path.join(TMP, nome);
  const home = path.join(base, 'peticia');

  await fs.ensureDir(path.join(home, 'config'));
  await fs.ensureDir(path.join(home, 'agentes'));
  for (const agente of TEMPLATES.agentes) {
    await fs.writeFile(path.join(home, 'agentes', agente), '# agente');
  }

  await fs.writeJson(path.join(home, 'config', 'escritorio.json'), {
    escritorios: [{ nome: 'Chaves e Matos' }],
  });

  await fs.ensureDir(path.join(base, '.peticia'));
  await fs.writeJson(path.join(base, '.peticia', 'instalacao.json'), {
    pasta_peticia: home,
    agentes_instalados: [...TEMPLATES.agentes].map((a) => a.replace('.md', '')),
  });

  await fs.ensureDir(path.join(base, '.claude', 'agents'));
  await fs.symlink(
    path.join(home, 'agentes'),
    path.join(base, '.claude', 'agents', 'peticia'),
  );

  return { base, home };
}

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-amb-'));
});

after(async () => {
  await fs.remove(TMP);
});

describe('validarInstalacao', () => {
  it('aprova uma instalação completa', async () => {
    const { base } = await montarValida('feliz');
    const v = await validarInstalacao({ base });

    assert.equal(v.ok, true);
    assert.equal(v.escritorio, 'Chaves e Matos');
    assert.equal(v.nAgentes, TEMPLATES.agentes.length);
  });

  it('sem ponteiro → não ativado', async () => {
    const base = path.join(TMP, 'vazio');
    await fs.ensureDir(base);
    const v = await validarInstalacao({ base });

    assert.equal(v.ok, false);
    assert.equal(v.codigo, 'nao_ativado');
    assert.match(v.dica, /peticia ativar/);
  });

  it('ponteiro sem agentes_instalados → não ativado', async () => {
    const { base } = await montarValida('so-configurou');
    const ponteiro = path.join(base, '.peticia', 'instalacao.json');
    await fs.writeJson(ponteiro, { pasta_peticia: path.join(base, 'peticia') });

    const v = await validarInstalacao({ base });
    assert.equal(v.codigo, 'nao_ativado');
  });

  it('sem escritorio.json → não configurado', async () => {
    const { base, home } = await montarValida('sem-config');
    await fs.remove(path.join(home, 'config', 'escritorio.json'));

    const v = await validarInstalacao({ base });
    assert.equal(v.codigo, 'nao_configurado');
    assert.match(v.dica, /peticia configurar/);
  });

  it('sem link → sem_link', async () => {
    const { base } = await montarValida('sem-link');
    await fs.remove(path.join(base, '.claude', 'agents', 'peticia'));

    const v = await validarInstalacao({ base });
    assert.equal(v.codigo, 'sem_link');
  });

  it('link apontando para o lugar errado → sem_link', async () => {
    const { base } = await montarValida('link-errado');
    const link = path.join(base, '.claude', 'agents', 'peticia');
    await fs.remove(link);
    await fs.symlink(path.join(base, 'outra-pasta'), link);

    const v = await validarInstalacao({ base });
    assert.equal(v.codigo, 'sem_link');
  });

  it('faltando um agente → agentes_incompletos, e diz qual', async () => {
    const { base, home } = await montarValida('sem-maestro');
    await fs.remove(path.join(home, 'agentes', 'maestro.md'));

    const v = await validarInstalacao({ base });
    assert.equal(v.codigo, 'agentes_incompletos');
    assert.match(v.mensagem, /maestro\.md/);
  });
});

describe('temClaude', () => {
  it('retorna false quando claude não está no PATH', () => {
    const antes = process.env.PATH;
    process.env.PATH = path.join(TMP, 'path-vazio');
    try {
      assert.equal(temClaude(), false);
    } finally {
      process.env.PATH = antes;
    }
  });

  it('retorna um booleano', () => {
    assert.equal(typeof temClaude(), 'boolean');
  });
});
