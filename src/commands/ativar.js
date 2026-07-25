import path from 'node:path';

import fs from 'fs-extra';
import ora from 'ora';

import { gerarDeviceId } from '../lib/device.js';
import { escolherLocal } from '../lib/escolher-local.js';
import {
  criarEstrutura,
  criarLinkAgentes,
  escreverPonteiro,
  instalarTemplates,
} from '../lib/instalacao.js';
import { arquivoEscritorio, pastaConfig } from '../lib/paths.js';
import { chamarEdgeFunction, ErroDeRede } from '../lib/supabase.js';
import { aviso, cor, dim, info, ok, secao } from '../lib/ui.js';
import { VERSAO } from '../lib/versao.js';

/** Validação de formato só: quem diz se o e-mail existe é o servidor. */
export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}

/**
 * Formata em UTC, não no fuso local: a validade vem do banco como
 * "2026-06-30T00:00:00Z", e no horário de Brasília (UTC-3) isso viraria
 * 29/06 — a licença pareceria ter vencido um dia antes do que venceu.
 */
function dataBr(iso) {
  if (!iso) return 'uma data que não consegui ler';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'uma data que não consegui ler';

  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * Mensagem para cada recusa do servidor. Exportada para ter teste: é o texto
 * que o aluno lê num momento de frustração, e não pode sair errado.
 */
export function mensagemDeErro(resposta) {
  switch (resposta?.motivo) {
    // Resposta única do servidor para e-mail inexistente, acesso suspenso,
    // cancelado, vencido e limite de máquinas estourado. O servidor não nos
    // conta qual dos cinco é — de propósito: distinguir permitiria a qualquer
    // pessoa varrer e-mails e descobrir quem é aluno. A mensagem precisa,
    // portanto, servir para todos eles sem prometer nada.
    case 'acesso_negado':
      return [
        'Este e-mail ainda não tem acesso ao peticia.',
        'Verifique com o suporte se você é aluno do curso',
        'ou possui código de ativação válido.',
      ];

    case 'rate_limit':
      return [
        'Muitas tentativas em pouco tempo.',
        'Aguarde alguns minutos e tente novamente.',
      ];

    // --- Motivos antigos -----------------------------------------------
    // O servidor agrupou todos em `acesso_negado`, mas os cases continuam
    // aqui: cobrem a janela entre publicar um CLI e atualizar a Edge Function
    // (e o caminho inverso). Sem eles, qualquer descompasso entre as duas
    // pontas jogaria o aluno na mensagem genérica do fallback.
    case 'email_nao_cadastrado':
      return [
        'Este e-mail ainda não tem acesso.',
        'Se você comprou o curso, aguarde alguns minutos ou confira',
        'se o e-mail está correto.',
      ];

    case 'suspenso':
      return [
        'Seu acesso está suspenso temporariamente.',
        'Entre em contato: peticia.app/suporte',
      ];

    case 'cancelado':
      return ['Seu acesso foi cancelado.'];

    case 'validade_expirada':
      return [
        `Sua licença venceu em ${dataBr(resposta.validade_ate)}.`,
        'Renove em: peticia.app/conta',
      ];

    case 'limite_excedido':
      return [
        `Você já ativou o peticia em ${resposta.max_dispositivos ?? 'todas as'} máquinas (limite atingido).`,
        "Para liberar uma máquina antiga, rode 'peticia desativar' nela.",
        'Ou entre em contato para aumentar seu limite.',
      ];

    case 'device_id_ausente':
    case 'sem_identificacao':
      return [
        'Não consegui identificar este computador.',
        'Isso não deveria acontecer — por favor, relate em peticia.app/suporte.',
      ];

    default:
      return [
        'Não consegui verificar seu acesso agora.',
        'Tente novamente em alguns instantes.',
        'Se persistir, verifique sua conexão.',
      ];
  }
}

/** Setup local: só roda depois de o servidor dizer sim. */
async function instalar({ sandbox, email, usuario, modulos, deviceId, agoraIso }) {
  secao('instalação local');

  const destino = await escolherLocal({ sandbox });

  // A configuração do escritório é do aluno: `ativar` nunca a destrói.
  const jaConfigurado = await fs.pathExists(arquivoEscritorio(destino));
  if (jaConfigurado) {
    aviso(`a pasta ${destino} já existe e tem um escritorio.json`);
    dim('Ele será preservado — a ativação não mexe na sua configuração.');
  }

  await criarEstrutura(destino);

  // Copia redator.md, peticao_lib.py e a ferramenta GPT para a pasta do aluno.
  const resumoTemplates = await instalarTemplates(destino);

  await fs.writeJson(
    path.join(pastaConfig(destino), 'modulos.json'),
    { modulos, atualizado_em: agoraIso },
    { spaces: 2 },
  );

  await escreverPonteiro(destino, { sandbox }, {
    criado_em: agoraIso,
    versao_cli: VERSAO,
    email,
    nome: usuario?.nome ?? null,
    device_id: deviceId,
    ...resumoTemplates,
  });

  const link = await criarLinkAgentes(destino, { sandbox });

  ok(`pasta criada em ${destino}`);
  ok(`agentes instalados: ${resumoTemplates.agentes_instalados.join(', ')}`);
  if (link.criado) {
    ok(`Claude Code conectado (${link.link})`);
  } else {
    aviso(`já existe algo em ${link.link} — não mexi nele`);
    dim('Se o Claude Code não enxergar os agentes, remova esse caminho e rode de novo.');
  }

  return { destino, link, jaConfigurado };
}

function sucesso({ usuario, modulos, jaConfigurado }) {
  const nomes = modulos.map((m) => m.id).join(', ');

  info('');
  info(`Ativado, ${usuario?.nome ?? 'bem-vindo'}.`);
  info('');
  info(
    `${modulos.length} ${modulos.length === 1 ? 'módulo liberado' : 'módulos liberados'}: ${nomes}.`,
  );
  info('');
  info('Próximo passo:');

  if (jaConfigurado) {
    info(`  ${cor.destaque('peticia')}                 → começar a usar`);
  } else {
    info(`  ${cor.destaque('peticia configurar')}   → configurar seu escritório`);
  }
  info('');
}

export async function ativar(email, { sandbox = false } = {}) {
  const agoraIso = new Date().toISOString();

  if (!emailValido(email)) {
    info(`"${email}" não parece um e-mail válido.`);
    info('Uso: peticia ativar seu@email.com');
    process.exitCode = 1;
    return null;
  }

  const deviceId = gerarDeviceId();
  const spinner = ora('Verificando acesso...').start();

  let resposta;
  try {
    resposta = await chamarEdgeFunction('ativar', {
      email: String(email).trim().toLowerCase(),
      device_id: deviceId,
      versao_cli: VERSAO,
      so: process.platform,
    });
  } catch (e) {
    spinner.stop();

    if (e instanceof ErroDeRede) {
      for (const linha of mensagemDeErro({ motivo: 'rede' })) info(linha);
      dim(`(${e.message})`);
      process.exitCode = 1;
      return null;
    }
    throw e;
  }

  spinner.stop();

  if (!resposta?.ok) {
    // Nada é criado no disco quando o servidor recusa.
    for (const linha of mensagemDeErro(resposta)) info(linha);
    process.exitCode = 1;
    return null;
  }

  const modulos = resposta.modulos ?? [];
  const { jaConfigurado } = await instalar({
    sandbox,
    email,
    usuario: resposta.usuario,
    modulos,
    deviceId,
    agoraIso,
  });

  sucesso({ usuario: resposta.usuario, modulos, jaConfigurado });

  return resposta;
}
