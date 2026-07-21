# Registro de decisões

As escolhas de projeto que custaram discussão, com o porquê — para não serem
re-litigadas. Em ordem aproximada de quando surgiram.

## Stack e empacotamento

- **ESM, não CJS.** Node 20 é a baseline; carregar CommonJS seria dívida. A
  versão é lida com `createRequire` (não `import ... with { type: 'json' }`)
  para não emitir `ExperimentalWarning` no terminal do aluno.
- **`inquirer@12`, não 13/14.** As versões 13/14 declaram `engines` Node
  ≥20.12/20.17 (importam `styleText` de `node:util`) e quebram em runtime no
  Node 20.11 — instalam sem reclamar e só falham ao rodar. A 12 declara `>=18` e
  está fora da faixa do CVE do `tmp`.
- **Licença MIT** (decisão do dono). Consequência conhecida e aceita: qualquer
  um pode legalmente forkar, remover a validação de licença e redistribuir. O
  controle de acesso (Supabase) passa a ser barreira de conveniência, não
  jurídica. Copyright da ADVGROW ASSESSORIA E GESTAO LTDA - ME; a assinatura
  pessoal do Dr. Henrique permanece no README (rosto humano).

## Paths e instalação

- **Ponteiro em local fixo** (`<BASE>/.peticia/instalacao.json`), não uma env
  var nem um arquivo dentro de `~/peticia`. Um caminho customizado (o aluno pode
  instalar em `~/Desktop/peticia`) precisa ser descoberto antes de se saber onde
  a pasta está — o ponteiro na home quebra essa circularidade.
- **Distinguir "ativou" de "configurou" por `agentes_instalados`.** Os dois
  comandos escrevem o ponteiro; só o `ativar` preenche `agentes_instalados`.
  Checar só a existência do ponteiro faria o `peticia` (uso diário) e o pulo da
  Etapa 0 do `configurar` dispararem indevidamente.
- **`escreverPonteiro` faz merge**, não sobrescreve — para `ativar`
  (email/nome/device_id) e `configurar` (pasta) coexistirem no mesmo arquivo.
- **Módulo de instalação compartilhado** (`instalacao.js`) entre `ativar` e
  `configurar`. Duplicar produziria dois `instalacao.json` divergentes — o tipo
  de bug que já mordeu antes.

## Wizard (`configurar`)

- **Normalizar caminho colado do Finder.** Arrastar uma pasta no Terminal do Mac
  cola com aspas e/ou espaços escapados (`'/x/Meus\ Casos'`). Sem tratar, o
  `pathExists` falha numa pasta que existe. As aspas só são descascadas em par
  balanceado (aparecem nas duas pontas e em nenhum outro lugar).
- **`validate` roda ANTES de `filter` no inquirer, com o texto cru.** Foi a
  causa real do bug "a pasta não existe" (o validate checava a string com
  aspas). Todo validate de caminho normaliza por conta própria; nunca confie na
  ordem interna do inquirer. O mesmo vale para o `transformer` (assinatura mudou
  entre versões).
- **Validação por tipo de alvo** (`validar-caminho.js`). O timbrado é um
  **arquivo .docx**, não um diretório; exigir diretório para todos os alvos
  travava o wizard de quem tinha estrutura fora do padrão (loop sem saída ao
  informar o timbrado à mão). Extraído para módulo próprio porque a versão
  embutida no wizard era intestável — foi por isso que o bug passou.
- **Canonizar o número de OAB** (`37189`/`37-189`/`37.189` → `37.189`). É a
  string que sai impressa no rodapé da petição; sem canonizar, o mesmo advogado
  assinaria de jeitos diferentes conforme o dia. Formatação manual (não
  `toLocaleString`) para não depender do ICU. Exibido no eco como sai impresso
  (`OAB/BA 37.189`), tornando a canonização visível.
- **`peticia configurar` pula a Etapa 0 se o `ativar` já rodou** — usa a pasta
  que o ativar escolheu, em vez de perguntar de novo (o aluno poderia escolher
  um local diferente e acabar com duas pastas).

## Ativação e backend

- **`chamarEdgeFunction` parseia o JSON mesmo em 400/500.** A Edge Function
  responde `{ok:false, motivo}` com esses status; tratar como falha de rede
  esconderia do aluno o motivo real (ex.: "e-mail não cadastrado"). Só
  `ErroDeRede` significa "não falei com o servidor".
- **`device_id` = hash SHA-256 de hostname+usuário+MAC**, truncado em 16. Estável
  na mesma máquina, diferente entre máquinas, não reversível para a pessoa.
- **Data de validade formatada em UTC.** `2026-06-30T00:00:00Z` em UTC-3 viraria
  29/06 — a licença pareceria vencer um dia antes. Pego por teste.
- **A Edge Function passou a devolver `validade_ate`** no motivo
  `validade_expirada` (antes não devolvia, e o CLI não tinha como dizer QUANDO
  venceu). **Requer deploy da função.**

## Agentes e templates

- **`peticao_lib.py`: timbrado é parâmetro obrigatório.** O default do
  inventário apontava para o Dropbox de uma máquina específica, que não existe
  na do aluno. Falha clara é melhor que "arquivo não encontrado" obscuro.
- **Nomes reais do `escritorio.json` nos prompts.** Uma spec pediu
  `caminho_raiz`/`pasta_modelos`/`advogado_principal`/`oabs_estados`, que o
  `configurar` não grava. Usar os nomes reais (`raiz`, `estrutura.modelos`,
  `advogado`, `oabs_suplementares`) — senão o agente lê campos vazios.
- **A inicial vai a protocolo em `.docx`, NUNCA convertida para PDF pelo
  organizador.** Decisão do escritório (2026-07-08), repetida em 4 lugares do
  inventário: o PDF é passo manual pelo Word (o LibreOffice troca Calibri por
  Carlito). Manter .docx elimina o conversor — o ponto mais frágil do agente.
- **revisor-gpt salva numa cópia `- REV.docx`**, original intacto (mais seguro
  para o aluno comparar). O `corrigir_inicial.py` recebe o **caminho do .docx**
  (não texto) e devolve um **parecer** (não reescreve a peça). Ponte da chave: o
  `configurar` grava `~/peticia/.env`, mas o script lê o `.env` da pasta dele —
  o agente exporta `OPENAI_API_KEY` antes de chamar.
- **Move para "Para Protocolar": o maestro aciona, o script executa.** O
  organizador roda ANTES do conferente e não tem o veredito; quem tem o verde é
  o maestro. A parte mecânica (`organizar_pasta.py --mover`, com tratamento de
  colisão) fica no script, determinística.
- **Falha rápido no redator.** A conferência cruzada virou porta de entrada que
  ABORTA antes de redigir (não só reporta no fim) — pegar o problema cedo custa
  quase nada; a peça redigida e rejeitada no conferente custa a inicial inteira.
  Nuance preservada do inventário: grafia de nome divergente com CPF+endereço
  batendo é alerta, não bloqueio (mesma pessoa). Comprovante > 3 meses idem.
- **O maestro nunca menciona custo em dinheiro** — só contagem de pastas e tempo
  (~3 min/pasta). A estimativa "~$0,25/pasta" de uma spec estava ~16× abaixo do
  medido (~$4-6/pasta, dominado pelo redator em Opus); prometer $3 e cobrar $70
  corrói a confiança. Um teste garante que nenhuma cifra volte ao prompt.

## Detecção de pastas

- **"protocolar" vs "protocolados".** `includes("protocolar")` distingue
  naturalmente: "protocolados" termina em "dos" e nunca contém "protocolar" (que
  precisa do "r"). Sem regex de exclusão.

## Testes e verificação

- **Guarda anti-vazamento de segredo**: um teste falha se qualquer `.env` real
  ou `__pycache__` entrar em `templates/`. Essa classe de erro (vazar a chave da
  OpenAI para o npm) não passa mais silenciosa.
- **Prompt-content assertions**: como um agente é markdown, os testes garantem
  que a instrução decidida continua no arquivo, não que o LLM a obedece.
- **Lacuna conhecida**: o comportamento real dos agentes (redator abortando,
  conferente dando 🔴, maestro orquestrando o pipeline) nunca foi verificado
  rodando os subagentes de verdade. É o teste mais valioso que falta.
