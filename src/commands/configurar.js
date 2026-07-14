import path from 'node:path';

import fs from 'fs-extra';
import inquirer from 'inquirer';
import ora from 'ora';

import { ALVOS, detectarEstrutura } from '../lib/detectar-pastas.js';
import { escolherLocal } from '../lib/escolher-local.js';
import {
  CAMPOS_FORMATACAO,
  ERRO_OAB,
  FORMATACAO_PADRAO,
  montarEscritorio,
  normalizarNumeroOab,
  normalizarUf,
  numeroOabValido,
  oab,
  oabTexto,
  ufValida,
  validar,
} from '../lib/escritorio-schema.js';
import { criarEstrutura, escreverPonteiro, proteger } from '../lib/instalacao.js';
import {
  arquivoEnv,
  arquivoEscritorio,
  normalizarCaminhoColado,
  pastaPadrao,
} from '../lib/paths.js';
import { aviso, cor, dim, info, ok, passo, secao } from '../lib/ui.js';
import { validarCaminho } from '../lib/validar-caminho.js';
import { VERSAO } from '../lib/versao.js';

/** Mesma armadilha: validate recebe o texto cru, então trima aqui também. */
const naoVazio = (mensagem) => (v) => (String(v ?? '').trim() ? true : mensagem);

/**
 * A linha de confirmação também ecoa o texto cru. Sem isto, o aluno cola o
 * caminho com as aspas do Finder e vê as aspas de volta — sem saber se o
 * peticia entendeu o caminho ou a string literal. Mostramos o caminho limpo,
 * que é o que vai para o escritorio.json.
 */
const transformarCaminho = (valor, a, b) => {
  const isFinal = a?.isFinal ?? b?.isFinal ?? false;
  return isFinal ? normalizarCaminhoColado(valor) || valor : valor;
};

// --- etapa 0: onde criar a pasta ---

async function etapaLocal({ sandbox }) {
  secao('local da pasta');

  if (sandbox) {
    const destino = pastaPadrao({ sandbox });
    passo(`Modo sandbox: usando ${destino}`);
    return destino;
  }

  // Mesma pergunta usada pelo `ativar`: se cada comando perguntasse do seu
  // jeito, o aluno poderia acabar com duas pastas diferentes.
  return escolherLocal({ sandbox });
}

/**
 * Se já existe configuração no destino, faz backup antes de sobrescrever.
 * Devolve o caminho do backup, ou null se não havia nada.
 */
async function tratarExistente(destino, agoraIso) {
  const arquivo = arquivoEscritorio(destino);
  if (!(await fs.pathExists(arquivo))) return null;

  aviso(`já existe uma configuração em ${arquivo}`);

  const { sobrescrever } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'sobrescrever',
      message: 'Sobrescrever a configuração existente?',
      default: false,
    },
  ]);

  if (!sobrescrever) {
    info('Nada foi alterado.');
    process.exit(0);
  }

  // ':' é proibido em nome de arquivo no Windows — o ISO precisa ser limpo.
  const carimbo = agoraIso.replace(/[:.]/g, '-');
  const backup = `${arquivo}.bak.${carimbo}`;
  await fs.copy(arquivo, backup);
  ok(`configuração anterior salva em ${path.basename(backup)}`);

  return backup;
}

// --- etapa 1: advogado ---

/**
 * Pergunta o número de uma OAB cuja UF já é conhecida.
 *
 * O transformer faz a linha de confirmação mostrar a OAB exatamente como ela
 * vai sair impressa na petição ("OAB/BA 37.189") — não o que o aluno digitou.
 * É isso que torna a canonização visível: se a linha verde está certa, o que
 * for para o rodapé da peça está certo.
 */
async function perguntarNumeroOab(rotulo, uf) {
  const { numero } = await inquirer.prompt([
    {
      type: 'input',
      name: 'numero',
      message: `${rotulo}:`,
      filter: normalizarNumeroOab,
      validate: (v) => (numeroOabValido(v) ? true : ERRO_OAB),
      // O inquirer 12 chama transformer como (valor, { isFinal }); a API antiga
      // usava (valor, respostas, { isFinal }). Aceitamos as duas para não
      // depender de um detalhe interno que já mudou uma vez.
      transformer: (valor, a, b) => {
        const isFinal = a?.isFinal ?? b?.isFinal ?? false;
        return isFinal ? oabTexto(oab(uf, valor)) : valor;
      },
    },
  ]);

  return numero;
}

async function perguntarOab(rotulo) {
  const { uf } = await inquirer.prompt([
    {
      type: 'input',
      name: 'uf',
      message: `${rotulo} — UF (2 letras):`,
      filter: normalizarUf,
      validate: (v) => (ufValida(v) ? true : 'UF inválida. Use a sigla, ex: BA.'),
    },
  ]);

  return oab(uf, await perguntarNumeroOab(rotulo, uf));
}

async function etapaAdvogado() {
  secao('advogado principal');

  const { nome } = await inquirer.prompt([
    {
      type: 'input',
      name: 'nome',
      message: 'Nome completo:',
      filter: (v) => String(v).trim(),
      validate: naoVazio('O nome é obrigatório.'),
    },
  ]);

  const oabPrincipal = await perguntarOab('OAB principal');

  info('');
  dim('OABs suplementares (Enter em branco na UF para encerrar).');

  const oabsSuplementares = {};
  for (;;) {
    const { uf } = await inquirer.prompt([
      {
        type: 'input',
        name: 'uf',
        message: 'UF da OAB suplementar:',
        filter: normalizarUf,
        validate: (v) =>
          v === '' || ufValida(v) ? true : 'UF inválida. Use a sigla, ex: SP.',
      },
    ]);

    if (!uf) break;

    if (uf === oabPrincipal.uf || oabsSuplementares[uf]) {
      aviso(`${uf} já foi informada; pulando.`);
      continue;
    }

    oabsSuplementares[uf] = await perguntarNumeroOab('OAB suplementar', uf);
  }

  return { nome, oabPrincipal, oabsSuplementares };
}

// --- etapa 2: escritório ---

async function etapaEscritorio() {
  secao('escritório');

  const { nome } = await inquirer.prompt([
    {
      type: 'input',
      name: 'nome',
      message: 'Nome do escritório:',
      filter: (v) => String(v).trim(),
      validate: naoVazio('O nome é obrigatório.'),
    },
  ]);

  dim('Dica: você pode arrastar a pasta para o terminal.');

  const { raiz } = await inquirer.prompt([
    {
      type: 'input',
      name: 'raiz',
      message: 'Caminho da pasta raiz do escritório:',
      filter: normalizarCaminhoColado,
      // O validate roda em loop até passar: é a re-pergunta pedida na spec.
      validate: (v) => validarCaminho(v, { tipo: 'diretorio' }),
      transformer: transformarCaminho,
    },
  ]);

  const { assinaturaDupla } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'assinaturaDupla',
      message: 'As petições levam assinatura dupla (dois advogados)?',
      default: false,
    },
  ]);

  let socio = null;
  if (assinaturaDupla) {
    const { nomeSocio } = await inquirer.prompt([
      {
        type: 'input',
        name: 'nomeSocio',
        message: 'Nome do sócio:',
        filter: (v) => String(v).trim(),
        validate: naoVazio('O nome do sócio é obrigatório.'),
      },
    ]);
    socio = { nome: nomeSocio, oab: await perguntarOab('OAB do sócio') };
  }

  return { nome, raiz, assinaturaDupla, socio };
}

// --- etapa 3: detecção ---

async function etapaEstrutura(raiz) {
  secao('estrutura da pasta');

  const spinner = ora('Procurando as pastas de trabalho...').start();
  const achados = await detectarEstrutura(raiz);
  spinner.stop();

  for (const alvo of ALVOS) {
    const achado = achados[alvo.chave];
    if (achado) {
      ok(`${alvo.rotulo}: ${path.relative(raiz, achado.caminho)}  ${cor.fraco(`(${achado.comoAchou})`)}`);
    } else {
      info(`${cor.atencao('—')} ${alvo.rotulo}: não encontrado`);
    }
  }

  const estrutura = {};
  const faltando = ALVOS.filter((a) => !achados[a.chave]);

  if (faltando.length > 0) {
    info('');
    dim('Informe os caminhos que não foram encontrados (Enter para pular).');
  }

  for (const alvo of ALVOS) {
    const achado = achados[alvo.chave];
    if (achado) {
      estrutura[alvo.chave] = achado.caminho;
      continue;
    }

    const { manual } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manual',
        message: `${alvo.rotulo}${alvo.obrigatorio ? '' : ' (opcional)'}:`,
        filter: normalizarCaminhoColado,
        // Cada alvo valida pelo SEU tipo: o timbrado é um arquivo .docx, e
        // exigir diretório aqui travava o wizard num loop sem saída.
        validate: (v) =>
          validarCaminho(v, {
            tipo: alvo.tipo,
            extensoes: alvo.extensoes,
            opcional: true, // Enter = pular
          }),
        transformer: transformarCaminho,
      },
    ]);

    estrutura[alvo.chave] = manual || null;
  }

  info('');
  const { confirma } = await inquirer.prompt([
    { type: 'confirm', name: 'confirma', message: 'Confirma essa estrutura?', default: true },
  ]);

  if (!confirma) {
    info('Vamos refazer esta etapa.');
    return etapaEstrutura(raiz);
  }

  return estrutura;
}

// --- etapa 4: formatação ---

async function etapaFormatacao() {
  secao('formatação das peças');

  for (const campo of CAMPOS_FORMATACAO) {
    info(`  ${campo.rotulo.padEnd(32)} ${cor.destaque(String(FORMATACAO_PADRAO[campo.chave]))}`);
  }
  info('');

  const { ajustar } = await inquirer.prompt([
    { type: 'confirm', name: 'ajustar', message: 'Quer ajustar algum valor?', default: false },
  ]);

  if (!ajustar) return { ...FORMATACAO_PADRAO };

  const formatacao = { ...FORMATACAO_PADRAO };
  for (const campo of CAMPOS_FORMATACAO) {
    const { valor } = await inquirer.prompt([
      {
        type: campo.tipo === 'numero' ? 'number' : 'input',
        name: 'valor',
        message: `${campo.rotulo}:`,
        default: FORMATACAO_PADRAO[campo.chave],
      },
    ]);

    // O prompt "number" devolve NaN quando o aluno só dá Enter em alguns
    // terminais; nesse caso mantemos o padrão em vez de gravar lixo.
    formatacao[campo.chave] =
      valor === '' || valor === null || (typeof valor === 'number' && Number.isNaN(valor))
        ? FORMATACAO_PADRAO[campo.chave]
        : valor;
  }

  return formatacao;
}

// --- etapa 5: openai ---

async function etapaOpenai() {
  secao('revisão com openai (opcional)');

  info('O peticia pode usar sua chave OpenAI para dupla revisão');
  info('(Claude redige, GPT confere). O custo da API OpenAI é seu —');
  info('o peticia não intermedia esse pagamento.');
  info('');

  const { configurar } = await inquirer.prompt([
    { type: 'confirm', name: 'configurar', message: 'Configurar agora?', default: false },
  ]);

  if (!configurar) {
    dim('Você pode configurar depois com: peticia configurar');
    return null;
  }

  const { chave } = await inquirer.prompt([
    {
      type: 'password',
      name: 'chave',
      mask: '*',
      message: 'Chave OpenAI:',
      filter: (v) => String(v).trim(),
      validate: (v) => (v ? true : 'A chave não pode ficar vazia.'),
    },
  ]);

  return chave;
}

// --- escrita ---

/**
 * Grava tudo. Só roda depois que todas as perguntas foram respondidas — assim
 * um Ctrl+C no meio do wizard não deixa meia instalação no disco.
 * Exportada para permitir teste sem TTY.
 */
export async function aplicar({ destino, dados, chaveOpenai, sandbox, agoraIso }) {
  const escritorioJson = montarEscritorio({ ...dados, criadoEm: agoraIso });

  const erros = validar(escritorioJson);
  if (erros.length > 0) {
    // Bug nosso, não erro do aluno: melhor falhar do que gravar algo quebrado.
    throw new Error(`configuração inválida:\n  - ${erros.join('\n  - ')}`);
  }

  await criarEstrutura(destino);

  await fs.writeJson(arquivoEscritorio(destino), escritorioJson, { spaces: 2 });

  if (chaveOpenai) {
    const env = arquivoEnv(destino);
    await fs.writeFile(env, `OPENAI_API_KEY=${chaveOpenai}\n`);
    await proteger(env);
  }

  // O ponteiro: é assim que todo comando futuro acha esta pasta. Escrever por
  // aqui preserva o que o `ativar` já tiver gravado (email, nome, device_id).
  await escreverPonteiro(destino, { sandbox }, { criado_em: agoraIso, versao_cli: VERSAO });

  return escritorioJson;
}

// --- saída final ---

function resumo({ destino, escritorioJson, chaveOpenai }) {
  const adv = escritorioJson.advogado;
  const ufs = [adv.oab_principal.uf, ...Object.keys(adv.oabs_suplementares)];
  const nomes = escritorioJson.escritorios.map((e) => e.nome).join(', ');

  secao('configuração salva');

  ok(`${arquivoEscritorio(destino)} criado`);
  ok(
    `${escritorioJson.escritorios.length} escritório${
      escritorioJson.escritorios.length > 1 ? 's' : ''
    } configurado (${nomes})`,
  );
  ok(`1 advogado com ${ufs.length} OAB${ufs.length > 1 ? 's' : ''} (${ufs.join(', ')})`);
  ok('Formatação padrão aplicada');
  if (chaveOpenai) ok('OpenAI configurada');

  info('');
  info('Próximo passo:');
  info(`  ${cor.destaque('peticia')}                 → começar a usar`);
  info(`  ${cor.destaque('peticia editar')}          → personalizar agentes ou config`);
  info('');
}

// --- orquestração ---

export async function configurar({ sandbox = false } = {}) {
  const agoraIso = new Date().toISOString();

  if (sandbox) {
    aviso('modo sandbox: nada fora de ~/.peticia-sandbox será tocado');
  }

  const destino = await etapaLocal({ sandbox });
  await tratarExistente(destino, agoraIso);

  const advogado = await etapaAdvogado();
  const escritorio = await etapaEscritorio();
  const estrutura = await etapaEstrutura(escritorio.raiz);
  const formatacao = await etapaFormatacao();
  const chaveOpenai = await etapaOpenai();

  const dados = {
    advogado,
    escritorios: [{ ...escritorio, estrutura }],
    formatacao,
    openaiConfigurada: Boolean(chaveOpenai),
  };

  const escritorioJson = await aplicar({ destino, dados, chaveOpenai, sandbox, agoraIso });

  resumo({ destino, escritorioJson, chaveOpenai });

  return escritorioJson;
}
