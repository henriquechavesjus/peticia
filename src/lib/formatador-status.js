import path from 'node:path';

import chalk from 'chalk';

/**
 * Recebe o objeto do coletor e devolve o painel como string. Não lê disco e não
 * imprime: dá para testar o texto sem montar uma instalação.
 */

const ROTULO = 15;

const rotulo = (texto) => `  ${texto.padEnd(ROTULO)}`;
const titulo = (texto) => chalk.bold(texto);

/** "2026-07-14T09:12:33.000Z" -> "2026-07-14 09:12" (hora local) */
function dataHora(iso) {
  if (!iso) return 'desconhecida';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'desconhecida';

  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O nome do alvo relativo à raiz — o caminho absoluto seria ilegível aqui. */
function nomeRelativo(alvo, raiz) {
  if (!alvo?.configurado) return null;
  const relativo = raiz ? path.relative(raiz, alvo.caminho) : alvo.caminho;
  return relativo && !relativo.startsWith('..') ? relativo : alvo.caminho;
}

/**
 * Uma linha da estrutura. `largura` alinha os marcadores numa coluna só: com
 * nomes de tamanhos diferentes, [ok] e [NÃO ENCONTRADO] espalhados pela tela
 * são bem mais difíceis de varrer do que empilhados.
 */
// "Para Protocolar:" tem 16 caracteres — a coluna precisa de 17 para que mesmo
// o rótulo mais longo fique com um espaço antes do valor.
const ROTULO_ESTRUTURA = 17;

function linhaEstrutura(nome, alvo, raiz, largura, extra = null) {
  const rot = `      ${nome.padEnd(ROTULO_ESTRUTURA)}`;

  if (!alvo?.configurado) {
    return `${rot}${chalk.yellow('não configurado')}`;
  }

  const curto = nomeRelativo(alvo, raiz).padEnd(largura);
  const marca = alvo.existe ? (extra ?? chalk.dim('[ok]')) : chalk.red('[NÃO ENCONTRADO]');

  return `${rot}${curto}   ${marca}`;
}

function secaoInstalacao(s, linhas) {
  linhas.push(titulo('Instalação'));
  linhas.push(
    `${rotulo('Pasta:')}${s.instalacao.pasta}${
      s.instalacao.pasta_existe ? '' : `   ${chalk.red('[NÃO ENCONTRADA]')}`
    }`,
  );
  linhas.push(`${rotulo('Instalada:')}${dataHora(s.instalacao.criado_em)}`);

  const instalada = s.instalacao.versao_instalada;
  const atual = s.instalacao.versao_atual;
  linhas.push(
    `${rotulo('Versão CLI:')}${atual}${
      instalada && instalada !== atual
        ? chalk.yellow(`   (instalado com ${instalada})`)
        : ''
    }`,
  );
  linhas.push('');
}

function secaoAdvogado(s, linhas) {
  if (!s.advogado) return;

  linhas.push(titulo('Advogado principal'));
  linhas.push(`${rotulo('Nome:')}${s.advogado.nome}`);
  linhas.push(`${rotulo('OAB principal:')}${s.advogado.oab_principal.texto}`);

  // Sem suplementares, a linha simplesmente não aparece.
  if (s.advogado.suplementares.length > 0) {
    const lista = s.advogado.suplementares.map((o) => o.texto).join(' · ');
    linhas.push(`${rotulo('Suplementares:')}${lista}`);
  }
  linhas.push('');
}

function secaoEscritorios(s, linhas) {
  const varios = s.escritorios.length > 1;
  linhas.push(titulo(`Escritórios (${s.escritorios.length})`));
  linhas.push('');

  s.escritorios.forEach((e, i) => {
    const prefixo = varios ? `${i + 1}. ` : '';
    linhas.push(`  ${chalk.cyan(prefixo + e.nome)}`);

    const raiz = e.raiz.existe
      ? e.raiz.caminho
      : `${e.raiz.caminho}   ${chalk.red('[NÃO ENCONTRADO]')}`;
    linhas.push(`  ${rotulo('Raiz:')}${raiz}`);

    const assinatura = e.assinatura_dupla
      ? `dupla (com ${e.socio?.nome}, ${e.socio?.oab?.texto})`
      : 'simples';
    linhas.push(`  ${rotulo('Assinatura:')}${assinatura}`);
    linhas.push('');

    linhas.push('    Estrutura:');

    const raizDir = e.raiz.caminho;
    const fila = e.estrutura.fila;
    const contagem =
      fila.acessivel === false
        ? chalk.red('[fila inacessível]')
        : fila.pastas === null
          ? null
          : chalk.dim(`[${fila.pastas} ${fila.pastas === 1 ? 'pasta' : 'pastas'}]`);

    const alvos = [
      ['Fila:', fila, contagem],
      ['Para Protocolar:', e.estrutura.para_protocolar, null],
      ['Modelos:', e.estrutura.modelos, null],
      ['Timbrado:', e.estrutura.timbrado, null],
      ['Protocolados:', e.estrutura.protocolados, null],
    ];

    const largura = Math.max(
      ...alvos.map(([, alvo]) => (nomeRelativo(alvo, raizDir) ?? '').length),
    );

    for (const [nome, alvo, extra] of alvos) {
      linhas.push(linhaEstrutura(nome, alvo, raizDir, largura, extra));
    }
    linhas.push('');
  });
}

function secaoFormatacao(s, linhas) {
  if (!s.formatacao) return;
  const f = s.formatacao;

  linhas.push(titulo('Formatação'));
  linhas.push(`${rotulo('Fonte:')}${f.fonte_corpo} ${f.tamanho_corpo} (citações ${f.tamanho_citacao})`);
  linhas.push(
    `${rotulo('Espaçamento:')}${f.espacamento_linhas} · depois de parágrafo: ${f.espacamento_depois_paragrafo_pt}pt`,
  );
  linhas.push(`${rotulo('Recuo:')}${f.recuo_primeira_linha_cm}cm`);
  linhas.push(`${rotulo('Alinhamento:')}${f.alinhamento}`);
  linhas.push('');
}

function secaoIntegracoes(s, linhas) {
  const openai = s.integracoes.openai.configurada
    ? chalk.green('configurada')
    : chalk.dim('não configurada (opcional)');

  const cc = s.integracoes.claude_code;
  const claude = !cc.conectado
    ? chalk.yellow('não conectado (link simbólico ausente)')
    : cc.apontaCerto
      ? chalk.green('conectado (link simbólico ok)')
      : chalk.red('link aponta para o lugar errado');

  linhas.push(titulo('Integrações'));
  linhas.push(`  ${'OpenAI (revisor-gpt):'.padEnd(24)}${openai}`);
  linhas.push(`  ${'Claude Code:'.padEnd(24)}${claude}`);
  linhas.push('');
}

export function formatarStatus(s) {
  const linhas = [];

  linhas.push(`${chalk.bold('peticia')} ${s.versao_cli}`);
  linhas.push('');

  secaoInstalacao(s, linhas);

  linhas.push(titulo('Licença'));
  linhas.push(`${rotulo('Status:')}${s.licenca.status} (${s.licenca.detalhe})`);
  linhas.push('');

  secaoAdvogado(s, linhas);
  secaoEscritorios(s, linhas);
  secaoFormatacao(s, linhas);
  secaoIntegracoes(s, linhas);

  if (s.avisos.length > 0) {
    linhas.push(chalk.yellow(`⚠ Avisos`));
    for (const aviso of s.avisos) {
      linhas.push(`  - ${aviso}`);
    }
    linhas.push('');
  }

  return linhas.join('\n');
}
