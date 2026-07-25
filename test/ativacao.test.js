import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { emailValido, mensagemDeErro } from '../src/commands/ativar.js';
import { gerarDeviceId } from '../src/lib/device.js';
import { chamarEdgeFunction, ErroDeRede } from '../src/lib/supabase.js';

describe('gerarDeviceId', () => {
  it('devolve 16 caracteres hexadecimais', () => {
    const id = gerarDeviceId();
    assert.equal(id.length, 16);
    assert.match(id, /^[0-9a-f]{16}$/);
  });

  it('é idempotente: a mesma máquina gera sempre o mesmo id', () => {
    assert.equal(gerarDeviceId(), gerarDeviceId());
  });

  it('não contém o nome do usuário nem o hostname em claro', () => {
    const id = gerarDeviceId();
    assert.ok(!id.includes(process.env.USER ?? 'nada-que-bata'));
  });
});

describe('emailValido', () => {
  it('aceita e-mails plausíveis', () => {
    assert.equal(emailValido('henrique@henriquechaves.adv.br'), true);
    assert.equal(emailValido('  a@b.co  '), true);
  });

  it('rejeita o que não é e-mail', () => {
    for (const ruim of ['', 'henrique', 'henrique@', '@dominio.com', 'a b@c.com', null]) {
      assert.equal(emailValido(ruim), false, `deveria rejeitar: ${ruim}`);
    }
  });
});

describe('mensagemDeErro', () => {
  it('acesso negado serve para os cinco casos agrupados', () => {
    const m = mensagemDeErro({ motivo: 'acesso_negado' }).join(' ');
    assert.match(m, /ainda não tem acesso ao peticia/);
    assert.match(m, /suporte/);
  });

  it('acesso negado não vaza a validade nem o motivo real', () => {
    // O servidor agrupa e-mail inexistente, suspenso, cancelado, vencido e
    // limite estourado nesta única resposta. Se a mensagem citar a data de
    // vencimento ou nomear o caso, o CLI reabre no texto a enumeração que a
    // Edge Function fechou no protocolo.
    const m = mensagemDeErro({
      motivo: 'acesso_negado',
      validade_ate: '2026-06-30T00:00:00.000Z',
    }).join(' ');

    assert.doesNotMatch(m, /2026|30\/06|venceu/);
    assert.doesNotMatch(m, /suspenso|cancelado|máquinas/i);
  });

  it('rate limit pede para esperar', () => {
    const m = mensagemDeErro({ motivo: 'rate_limit' }).join(' ');
    assert.match(m, /Muitas tentativas/);
    assert.match(m, /Aguarde/);
  });

  it('e-mail não cadastrado', () => {
    const m = mensagemDeErro({ motivo: 'email_nao_cadastrado' }).join(' ');
    assert.match(m, /ainda não tem acesso/);
  });

  it('suspenso aponta o suporte', () => {
    const m = mensagemDeErro({ motivo: 'suspenso' }).join(' ');
    assert.match(m, /suspenso temporariamente/);
    assert.match(m, /peticia\.app\/suporte/);
  });

  it('cancelado', () => {
    assert.deepEqual(mensagemDeErro({ motivo: 'cancelado' }), ['Seu acesso foi cancelado.']);
  });

  it('validade expirada formata a data em pt-BR', () => {
    const m = mensagemDeErro({
      motivo: 'validade_expirada',
      validade_ate: '2026-06-30T00:00:00.000Z',
    }).join(' ');
    assert.match(m, /venceu em 30\/06\/2026/);
    assert.match(m, /peticia\.app\/conta/);
  });

  it('limite excedido usa o max_dispositivos da resposta', () => {
    const m = mensagemDeErro({ motivo: 'limite_excedido', max_dispositivos: 2 }).join(' ');
    assert.match(m, /em 2 máquinas/);
    assert.match(m, /peticia desativar/);
  });

  it('motivo desconhecido cai na mensagem genérica de conexão', () => {
    const m = mensagemDeErro({ motivo: 'erro_interno' }).join(' ');
    assert.match(m, /Não consegui verificar seu acesso agora/);
    assert.match(m, /verifique sua conexão/);
  });
});

describe('chamarEdgeFunction', () => {
  let servidor;
  let urlAntiga;

  before(async () => {
    servidor = http.createServer((req, res) => {
      const url = req.url ?? '';

      if (url.endsWith('/lento')) {
        return; // nunca responde: força o timeout
      }

      if (url.endsWith('/html')) {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        return res.end('<html>bad gateway</html>');
      }

      // Recusa com HTTP 400 — precisa chegar ao CLI como {ok:false}, não como
      // erro de rede, senão o aluno nunca vê o motivo real.
      if (url.endsWith('/recusa')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, motivo: 'device_id_ausente' }));
      }

      let corpo = '';
      req.on('data', (c) => (corpo += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, recebido: JSON.parse(corpo || '{}') }));
      });
    });

    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));

    urlAntiga = process.env.PETICIA_SUPABASE_URL;
    process.env.PETICIA_SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(async () => {
    if (urlAntiga === undefined) delete process.env.PETICIA_SUPABASE_URL;
    else process.env.PETICIA_SUPABASE_URL = urlAntiga;
    await new Promise((r) => servidor.close(r));
  });

  it('envia o payload e devolve o JSON', async () => {
    const r = await chamarEdgeFunction('ativar', { email: 'a@b.co', device_id: 'abc' });
    assert.equal(r.ok, true);
    assert.equal(r.recebido.email, 'a@b.co');
    assert.equal(r.recebido.device_id, 'abc');
  });

  it('devolve o JSON mesmo quando o status é 400', async () => {
    const r = await chamarEdgeFunction('recusa', {});
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'device_id_ausente');
  });

  it('lança ErroDeRede no timeout', async () => {
    await assert.rejects(
      () => chamarEdgeFunction('lento', {}, { timeout: 300 }),
      (e) => {
        assert.ok(e instanceof ErroDeRede);
        assert.match(e.message, /não respondeu em 0\.3s/);
        return true;
      },
    );
  });

  it('lança ErroDeRede quando a resposta não é JSON', async () => {
    await assert.rejects(() => chamarEdgeFunction('html', {}), ErroDeRede);
  });

  it('lança ErroDeRede quando não há servidor', async () => {
    const antes = process.env.PETICIA_SUPABASE_URL;
    process.env.PETICIA_SUPABASE_URL = 'http://127.0.0.1:1';
    await assert.rejects(() => chamarEdgeFunction('ativar', {}), ErroDeRede);
    process.env.PETICIA_SUPABASE_URL = antes;
  });
});
