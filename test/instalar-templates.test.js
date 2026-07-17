import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import fs from 'fs-extra';

import { instalarTemplates, RESUMO_TEMPLATES } from '../src/lib/instalacao.js';
import { pastaTemplates } from '../src/lib/paths.js';

describe('instalarTemplates', () => {
  let destino;

  before(async () => {
    destino = await fs.mkdtemp(path.join(os.tmpdir(), 'peticia-tmpl-'));
    // instalarTemplates copia para destino/agentes, destino/lib, etc.
    for (const sub of ['agentes', 'lib', 'ferramentas']) {
      await fs.ensureDir(path.join(destino, sub));
    }
  });

  after(async () => {
    await fs.remove(destino);
  });

  it('copia os agentes, a lib e a ferramenta GPT para os locais certos', async () => {
    const resumo = await instalarTemplates(destino);

    const redator = path.join(destino, 'agentes', 'redator.md');
    const revisor = path.join(destino, 'agentes', 'revisor-gpt.md');
    const lib = path.join(destino, 'lib', 'peticao_lib.py');
    const tool = path.join(destino, 'ferramentas', 'correcao-inicial-gpt', 'corrigir_inicial.py');

    for (const [rotulo, arquivo] of [
      ['redator.md', redator],
      ['revisor-gpt.md', revisor],
      ['peticao_lib.py', lib],
      ['corrigir_inicial.py', tool],
    ]) {
      assert.ok(await fs.pathExists(arquivo), `${rotulo} não foi copiado`);
      const conteudo = await fs.readFile(arquivo, 'utf8');
      assert.ok(conteudo.trim().length > 0, `${rotulo} está vazio`);
    }

    assert.deepEqual(resumo, RESUMO_TEMPLATES);
    assert.deepEqual(resumo.agentes_instalados, ['redator', 'revisor-gpt']);
  });

  it('NÃO copia o .env real da ferramenta (só o .env.example)', async () => {
    const dir = path.join(destino, 'ferramentas', 'correcao-inicial-gpt');
    assert.ok(!(await fs.pathExists(path.join(dir, '.env'))), '.env real vazou para a instalação');
    assert.ok(await fs.pathExists(path.join(dir, '.env.example')), 'faltou o .env.example');
  });

  it('não sobrescreve um agente que o aluno já editou', async () => {
    const redator = path.join(destino, 'agentes', 'redator.md');
    await fs.writeFile(redator, 'EDITADO PELO ALUNO');

    await instalarTemplates(destino);

    assert.equal(await fs.readFile(redator, 'utf8'), 'EDITADO PELO ALUNO');
  });
});

describe('templates do pacote (segurança de publicação)', () => {
  it('nenhum .env real está em templates/ (só .env.example)', async () => {
    const raiz = pastaTemplates();

    async function varrer(dir) {
      const entradas = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entradas) {
        const caminho = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === '__pycache__') {
            assert.fail(`__pycache__ não deveria estar no pacote: ${caminho}`);
          }
          await varrer(caminho);
        } else if (e.name === '.env') {
          assert.fail(`.env real no pacote — VAZAMENTO DE SEGREDO: ${caminho}`);
        }
      }
    }

    await varrer(raiz);
  });

  it('peticao_lib.py exige o timbrado (sem caminho hardcoded de ninguém)', async () => {
    const lib = await fs.readFile(
      path.join(pastaTemplates(), 'lib', 'peticao_lib.py'),
      'utf8',
    );
    // Não pode carregar o caminho do Dropbox de nenhuma máquina específica.
    assert.ok(!lib.includes('/Users/'), 'peticao_lib.py tem caminho absoluto hardcoded');
    assert.ok(lib.includes('def __init__(self, timbrado)'), 'timbrado deixou de ser obrigatório');
  });
});
