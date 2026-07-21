# peticia — guia do projeto

CLI Node.js, distribuído via npm, que instala e orquestra um time de agentes do
Claude Code para gerar petições iniciais de Direito do Consumidor no padrão do
escritório do advogado. Produto da **ADVGROW ASSESSORIA E GESTAO LTDA - ME**;
licença **MIT**; repositório `github.com/henriquechavesjus/peticia`.

Duas experiências:
- **Setup** (comandos técnicos, poucas vezes): `ativar`, `configurar`, `status`.
- **Uso diário**: o aluno digita `peticia` e conversa em português com o agente
  `maestro`, que decide o que fazer.

## Como rodar e testar

```bash
npm install          # dependências
npm test             # suite (node --test, 105 testes)
npm link             # disponibiliza o comando `peticia` localmente
npm pack --dry-run   # confere o que iria para o npm (sem publicar)
```

Node 20+ é a baseline. O projeto é **ESM** (`"type": "module"`).

## Arquitetura

### Comandos (`src/commands/`, montados em `src/cli.js` via commander)

| Comando | Arquivo | O que faz |
| --- | --- | --- |
| `peticia` (sem args) | `peticia.js` | valida o setup e abre o Claude Code (`claude --dangerously-skip-permissions`) |
| `peticia ativar <email>` | `ativar.js` | autentica na Edge Function, cria a pasta, instala os agentes, cria o link |
| `peticia configurar` | `configurar.js` | wizard do escritório (pastas, advogado, formatação, OpenAI) |
| `peticia status` | `status.js` | painel do estado da instalação |

`ativar`, `atualizar`, `editar`, `plugin` que não existem ainda são stubs em
`commands/index.js` (aparecem no `--help`, falham com código 1).

### O ponteiro (`src/lib/paths.js`) — como tudo se encontra

O estado vive **fora** da pasta do aluno, num ponteiro em local previsível:

```
<BASE>/.peticia/instalacao.json      ← o ponteiro (pasta_peticia, email, agentes_instalados, ...)
<BASE>/peticia/                      ← a pasta do aluno (pode ser customizada)
  ├── agentes/ config/ lib/ ferramentas/ workflows/
  ├── .env                           ← chave OpenAI (chmod 600; opcional)
  └── config/escritorio.json  config/modulos.json
<BASE>/.claude/agents/peticia  →  <pasta_peticia>/agentes   (symlink / junction no Windows)
```

`BASE` = `os.homedir()`, ou `~/.peticia-sandbox` quando `--sandbox`, ou
`PETICIA_SANDBOX_DIR` se setado. `getPeticiaHome()` lê o ponteiro e resolve
`pasta_peticia`; lança `NaoConfigurado` se não existe. O ponteiro fica na home
(e não dentro de `~/peticia`) para quebrar a circularidade: o CLI precisa achar
a pasta antes de saber onde ela está.

**Tanto `ativar` quanto `configurar` escrevem o ponteiro** (via
`escreverPonteiro`, que faz merge — não sobrescreve). O que distingue "ativou"
de "só configurou" é o campo `agentes_instalados` (só o `ativar` o preenche).
Essa distinção é usada em `ambiente.js` (comando `peticia`) e em
`configurar.js` (`pastaDaAtivacao`, para pular a Etapa 0 se o ativar já rodou).

### Templates → instalação (`src/lib/instalacao.js`)

`templates/` contém o que é copiado para a pasta do aluno na ativação:
- `agentes/*.md` — os 5 agentes
- `lib/peticao_lib.py` — motor de geração do .docx (python-docx)
- `ferramentas/correcao-inicial-gpt/` — revisor GPT (Python; só `.py` + `.env.example`)
- `ferramentas/organizador/organizar_pasta.py` — montagem do PROTOCOLO/ (Pillow+pypdf)

`instalarTemplates(destino)` copia **sem sobrescrever** o que o aluno já editou
(os agentes viram dele depois de instalados). `TEMPLATES` e `RESUMO_TEMPLATES`
são a fonte única do que existe; adicionar um agente = editar essas listas.

### Os agentes (pipeline)

O aluno fala com o `maestro`, que delega, uma pasta por vez:

```
maestro → redator → revisor-gpt → organizador → conferente
          (opus)    (sonnet,opc)   (haiku)       (sonnet)
```

- **redator** — lê o `escritorio.json`, analisa todas as mídias (whisper/ffmpeg/
  pdftotext), tem uma **porta de entrada** que ABORTA antes de redigir se os
  documentos são inconsistentes (CPF/RG divergente, procuração sem assinatura,
  comprovante de terceiro sem vínculo), escolhe o modelo lendo a pasta, gera o
  .docx sobre o timbrado.
- **revisor-gpt** — opcional (só com chave OpenAI). Roda o GPT via
  `corrigir_inicial.py`, julga o parecer, aplica só correções seguras numa
  **cópia `- REV.docx`** (original intacto).
- **organizador** — Haiku, mecânico. Monta `PROTOCOLO/` (inicial em .docx na
  posição 01, docs/provas em PDF, mídias soltas em MIDIAS/). O agente identifica
  os arquivos e passa um manifesto; `organizar_pasta.py` executa.
- **conferente** — lê a inicial .docx e cruza os dados (A–G) com os documentos e
  o `escritorio.json`. Veredito 🟢/🟡/🔴. Não modifica nada.
- **maestro** — interpreta o pedido, seleciona o escritório, confirma antes de
  lote (só tempo, **nunca custo em dinheiro**), reporta. Após o verde, aciona o
  move para "Para Protocolar" (`organizar_pasta.py --mover`) se configurado.

Cada agente tem zonas marcadas `=== NÚCLEO ===` (a lógica; mexer com cuidado) e
`=== ESTILO ===` (regras que o aluno ajusta).

## Schema do `escritorio.json` (`src/lib/escritorio-schema.js`)

Use os **nomes reais** dos campos (não confie em specs que digam outra coisa):

```jsonc
{
  "schema_versao": 1,
  "advogado": {
    "nome": "...",
    "oab_principal": { "uf": "BA", "numero": "37.189" },
    "oabs_suplementares": { "SP": "501.909" }        // OAB por UF do cliente
  },
  "escritorios": [{
    "nome": "...",
    "raiz": "/caminho/absoluto",
    "assinatura_dupla": false,
    "socio": null,                                   // ou { nome, oab:{uf,numero} }
    "estrutura": {
      "fila_entrada": "...",       // casos aguardando redação
      "para_protocolar": null,     // opcional: prontas aguardando protocolo
      "modelos": "...",            // templates de petição
      "timbrado": "...",           // arquivo .docx
      "protocolados": null         // opcional: já enviadas
    }
  }],
  "formatacao": { "fonte_corpo": "Calibri Light", "tamanho_corpo": 12, ... },
  "openai": { "configurada": false }
}
```

Detecção das pastas: `src/lib/detectar-pastas.js` (`ALVOS` é a fonte única —
cada alvo declara `tipo` diretorio/arquivo e se é obrigatório). Número de OAB é
canonizado (`37189`, `37-189`, `37.189` → todos `37.189`); exibido como
`OAB/BA 37.189`.

## Convenções

- **Sandbox**: `--sandbox` troca `BASE` por `~/.peticia-sandbox`. Drivers de
  teste automatizados usam `PETICIA_SANDBOX_DIR=~/.peticia-sandbox-teste` e
  **nunca** respondem "sim" a prompts de sobrescrita (ver `memory/`).
- **Segredos**: a `SUPABASE_ANON_KEY` em `src/lib/supabase.js` é pública por
  desenho (role `anon`). A `service_role` vive só na Edge Function. Nenhum
  `.env` real vai para o pacote — só `.env.example`. Um teste
  (`test/instalar-templates.test.js`) FALHA se qualquer `.env` ou `__pycache__`
  entrar em `templates/`.
- **inquirer** fixado em `^12`: as versões 13/14 exigem Node ≥20.12/20.17
  (importam `styleText`) e quebram no Node 20.11.
- **Agente é prompt, não código**: `test/prompts-agentes.test.js` só garante que
  as instruções decididas continuam no .md (rede contra regressão), não que o
  LLM se comporta assim. O comportamento real dos agentes nunca foi testado
  ponta a ponta — é a maior lacuna de verificação do projeto.

## Testes (`test/`, `node --test`)

Sem dependências novas. Módulos com lógica (paths, schema, detecção, validação,
device, ambiente, coletor-status, instalação) têm teste unitário com fixtures em
diretório temporário (via override `base` em `baseHome`). O que exige rede
(`ativar`) usa um servidor HTTP local falso. O que exige um binário externo
(`claude`, `python3`) é testado por injeção/PATH ou E2E manual.

## O que falta

- `npm publish` — preparado, **não publicado**. Pendências: teste manual no Mac
  e tornar o repo público (senão os links do npm dão 404).
- Comandos `atualizar`, `desativar`, `editar`, `plugin` — stubs.
- Verificação end-to-end dos agentes rodando de verdade (o pipeline nunca foi
  exercitado com os subagentes reais).
- Validação periódica com Supabase (ping a cada 7 dias), ativação por código.

Ver `docs/DECISOES.md` para o registro das decisões e seus porquês.
