import path from 'node:path';

import fs from 'fs-extra';
import inquirer from 'inquirer';
import ora from 'ora';

import { SUBPASTAS } from '../constants.js';
import { ALVOS, detectarEstrutura } from '../lib/detectar-pastas.js';
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
import {
  arquivoEnv,
  arquivoEscritorio,
  arquivoInstalacao,
  ehWindows,
  locaisSugeridos,
  normalizarCaminhoColado,
  pastaConfig,
  pastaEstado,
  pastaPadrao,
} from '../lib/paths.js';
import { aviso, cor, dim, info, ok, passo, secao } from '../lib/ui.js';
import { VERSAO } from '../lib/versao.js';

const CAMINHO_CUSTOMIZADO = Symbol('customizado');

/**
 * O inquirer chama validate ANTES de filter, e passa o texto cru. Validar o
 * caminho sem normalizar antes significa checar a existência de uma string que
 * ainda tem as aspas que o Finder colou — a pasta existe e o wizard jura que
 * não. Por isso todo validate de caminho normaliza por conta própria.
 */
async function validarPasta(entrada, { opcional = false } = {}) {
  const caminho = normalizarCaminhoColado(entrada);

  if (!caminho) {
    return opcional ? true : 'Digite um caminho.';
  }
  if (!(await fs.pathExists(caminho))) {
    return `A pasta não existe: ${caminho}`;
  }
  if (!(await fs.stat(caminho)).isDirectory()) {
    return 'O caminho existe, mas não é uma pasta.';
  }

  return true;
}

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
  if (sandbox) {
    const destino = pastaPadrao({ sandbox });
    secao('local da pasta');
    passo(`Modo sandbox: usando ${destino}`);
    return destino;
  }

  secao('local da pasta');
  info('Onde você quer criar a pasta principal do peticia?');
  info('');

  const locais = await locaisSugeridos({ sandbox });

  const { escolha } = await inquirer.prompt([
    {
      type: 'list',
      name: 'escolha',
      message: 'Local:',
      choices: [
        ...locais.map((l) => ({ name: `${l.nome}  ${cor.fraco(l.caminho)}`, value: l.caminho })),
        { name: 'Outro caminho (eu digito)', value: CAMINHO_CUSTOMIZADO },
      ],
    },
  ]);

  if (escolha !== CAMINHO_CUSTOMIZADO) return escolha;

  const { customizado } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customizado',
      message: 'Caminho completo da pasta:',
      filter: normalizarCaminhoColado,
      validate: (v) => (normalizarCaminhoColado(v) ? true : 'Digite um caminho.'),
      transformer: transformarCaminho,
    },
  ]);

  return customizado;
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
      validate: (v) => validarPasta(v),
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
        validate: (v) => validarPasta(v, { opcional: true }), // Enter = pular
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

const README = (destino) => `# peticia

Esta é a sua pasta de trabalho do peticia (\`${destino}\`).
O que você editar aqui é seu: o peticia não sobrescreve suas alterações.

## As pastas

- \`agentes/\` — os agentes que redigem, revisam, organizam e conferem.
  Depois da instalação, eles são seus: pode editar o texto de cada um.
- \`workflows/\` — os pipelines que encadeiam os agentes.
- \`lib/\` — o motor de formatação das peças.
- \`ferramentas/\` — integrações opcionais (ex: revisão via OpenAI).
- \`config/\` — sua configuração. O \`escritorio.json\` foi gerado pelo wizard.

## Arquivos sensíveis

- \`.env\` — guarda sua chave da OpenAI, se você configurou uma.
  Não compartilhe este arquivo e não o coloque em nenhum repositório.

## Para mudar algo

    peticia configurar     refaz a configuração (guarda backup da anterior)
    peticia editar         abre esta pasta
    peticia status         mostra o estado da instalação
`;

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

  await fs.ensureDir(destino);
  for (const sub of SUBPASTAS) {
    await fs.ensureDir(path.join(destino, sub));
    await fs.writeFile(path.join(destino, sub, '.gitkeep'), '');
  }

  await fs.writeJson(arquivoEscritorio(destino), escritorioJson, { spaces: 2 });
  await fs.writeFile(path.join(destino, 'README.md'), README(destino));

  if (chaveOpenai) {
    const env = arquivoEnv(destino);
    await fs.writeFile(env, `OPENAI_API_KEY=${chaveOpenai}\n`);
    await protegerArquivo(env);
  }

  await protegerArquivo(pastaConfig(destino), 0o700);

  // O ponteiro: é assim que todo comando futuro acha esta pasta.
  await fs.ensureDir(pastaEstado({ sandbox }));
  await fs.writeJson(
    arquivoInstalacao({ sandbox }),
    {
      schema_versao: 1,
      pasta_peticia: destino,
      criado_em: agoraIso,
      versao_cli: VERSAO,
      so: process.platform,
    },
    { spaces: 2 },
  );

  return escritorioJson;
}

/**
 * chmod não tem efeito real no Windows: prometer "600" lá seria mentira.
 * Em vez de fingir, avisamos o aluno uma vez.
 */
let avisouWindows = false;
async function protegerArquivo(alvo, modo = 0o600) {
  if (ehWindows) {
    if (!avisouWindows) {
      aviso('no Windows as permissões de arquivo não são restringidas pelo peticia;');
      aviso('mantenha o .env fora de pastas compartilhadas.');
      avisouWindows = true;
    }
    return;
  }
  await fs.chmod(alvo, modo);
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
