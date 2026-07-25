# Histórico — como o peticia foi construído, passo a passo

Cada passo é um commit. A ideia é mostrar não só *o que* foi feito, mas o que
apareceu no caminho — os bugs descobertos e as decisões tomadas. Vários passos
existem por causa de um problema encontrado no anterior, o que é normal e
saudável num projeto real.

> Datas em 2026. O código está em `github.com/henriquechavesjus/peticia`.

---

### Passo 1 — Esqueleto do CLI · 14/07 · `ebe50a4`

O ponto de partida: um `package.json` pronto para o npm, a estrutura de pastas
(`bin/`, `src/`, `templates/`) e os comandos `peticia --help` e `--version`
funcionando. Nenhuma lógica de negócio ainda — só o esqueleto que roda.

Decisões que valeram para sempre: **ESM** (JavaScript moderno) e **Node 20+**
como base.

### Passo 2 — `peticia configurar` · 14/07 · `cf3c847`

O primeiro comando de verdade: o wizard que pergunta os dados do escritório e
gera o `escritorio.json`. Aqui nasceram peças centrais: o **ponteiro** (para
achar a pasta do aluno depois), o **schema** do escritório e a **detecção
automática** das pastas. Também nasceu a flag `--sandbox` para testar sem sujar
a máquina.

Descoberta no caminho: a versão nova da biblioteca de perguntas (`inquirer 14`)
**quebrava no Node 20.11**. Voltamos para a `12`, que funciona.

### Passo 3 — Canonizar o número de OAB · 14/07 · `7589581`

Um bug sutil: o aluno podia digitar a OAB de três jeitos (`37189`, `37-189`,
`37.189`) e os três eram salvos diferentes. Como esse número sai **impresso no
rodapé da petição**, o mesmo advogado assinaria de formas diferentes. A correção
padroniza tudo para `37.189` e mostra na tela como vai sair impresso
(`OAB/BA 37.189`), para o aluno conferir.

### Passo 4 — Caminho colado do Finder · 14/07 · `0c9a32f`

Bug real relatado: ao **arrastar uma pasta do Finder** para o terminal, o Mac
cola o caminho com aspas (`'/Users/.../Meus Casos'`), e o programa dizia "a pasta
não existe" — mesmo existindo. Investigando, a causa era outra do que parecia: a
biblioteca de perguntas valida o texto **antes** de limpá-lo. A lição: sempre
confirmar a causa real antes de corrigir.

### Passo 5 — `peticia status` · 14/07 · `6ac1688`

Um painel que mostra tudo sobre a instalação: pasta, licença, advogado,
escritórios, formatação, e o que ainda falta. Foi construído em duas partes bem
separadas — uma que **coleta** os dados (testável) e outra que **desenha** o
painel (só cor). Essa separação virou padrão no projeto.

### Passo 6 — Timbrado impossível de informar à mão · 14/07 · `3a618e0`

O passo 4 tinha introduzido um bug novo: a validação de caminho exigia que tudo
fosse uma **pasta**. Mas o timbrado é um **arquivo** `.docx`. Então, se a
detecção automática não achasse o timbrado, o aluno ficava preso — não conseguia
informá-lo. A correção: validar cada coisa pelo seu tipo (pasta ou arquivo).

### Passo 7 — `peticia ativar` · 14/07 · `17a2817`

A autenticação online: o comando fala com o **Supabase** para validar a licença,
e só então cria a estrutura na máquina do aluno. Nasceram o `device_id` (id
anônimo da máquina), o cliente HTTP e a mensagem certa para cada tipo de recusa.

Bug pego por teste: a data de validade aparecia **um dia antes** do certo, por
causa de fuso horário. Corrigido formatando em UTC.

### Passo 8 — O redator (1º agente) · 16/07 · `9b2674c`

O primeiro agente de IA. Ele lê o `escritorio.json`, analisa os documentos e
mídias do caso e escreve a petição. Vieram junto o motor Python que gera o
`.docx` (`peticao_lib.py`) e a ferramenta de revisão GPT.

Cuidado de segurança: a ferramenta GPT tinha um `.env` com a chave da OpenAI do
dono. Copiamos só o código e um `.env.example` — **nunca a chave real**.

### Passo 9 — O revisor-gpt (2º agente) · 17/07 · `014991b`

O segundo par de olhos: manda a peça pronta para um modelo GPT, que dá um
parecer. O agente aplica só as correções seguras, numa **cópia** (`- REV.docx`),
preservando o original.

### Passo 10 — O organizador (3º agente) · 20/07 · `d8d89d9`

Agente mecânico (roda no modelo mais barato, Haiku): monta a pasta `PROTOCOLO/`
com tudo pronto para enviar — petição em Word, documentos em PDF, mídias soltas.
A conversão fica num script Python determinístico, testado de verdade com
arquivos reais.

### Passo 11 — Redator reforçado + conferente (4º agente) · 20/07 · `42220ba`

Duas coisas: o redator passou a **abortar cedo** quando os documentos são
inconsistentes (CPF divergente, procuração sem assinatura) — em vez de gastar
tempo redigindo algo que seria rejeitado. E nasceu o conferente, a checagem
final que dá o veredito 🟢/🟡/🔴.

### Passo 12 — O maestro (5º agente) · 20/07 · `f80e4fe`

O orquestrador, com quem o aluno conversa. Ele entende o pedido, escolhe o
escritório, e comanda os outros quatro na ordem. Decisão importante: o maestro
**nunca fala em dinheiro** — só em quantidade de pastas e tempo. Uma estimativa
de custo errada minaria a confiança quando a fatura chegasse.

### Passo 13 — O comando `peticia` (uso diário) · 21/07 · `4d6a342`

A última peça funcional: `peticia` sem argumentos valida se está tudo no lugar e
abre o Claude Code já conversando com o maestro. Zero fricção — o aluno digita
`peticia` e começa a trabalhar.

### Passo 14 — Preparar para o npm · 21/07 · `9d49915`

Licença **MIT**, `package.json` completo (autor, repositório...), README público
reescrito, e uma verificação de segurança do pacote: conferir exatamente quais
arquivos iriam para o npm, garantindo que nenhum segredo escapa.

### Passo 15 — Copyright para a empresa · 21/07 · `f5a60c7`

O produto passou a ser da **ADVGROW ASSESSORIA E GESTAO LTDA - ME**. A assinatura
pessoal do Dr. Henrique continua no README (o aluno vê um rosto humano).

### Passo 16 — configurar pula a Etapa 0 · 21/07 · `81d0ff4`

Bug de experiência: se o aluno já tinha ativado (e portanto já escolhido a
pasta), o `configurar` perguntava a pasta **de novo**. A correção: se o ativar já
rodou, usa a pasta dele e vai direto para a próxima etapa.

### Passo 17 — Categoria "Para Protocolar" · 21/07 · `3118123`

Uma nova categoria de pasta: peças **prontas aguardando o aluno protocolar** no
tribunal — o estado entre "pronta" e "enviada". Quando o conferente aprova, o
maestro move a pasta para lá automaticamente (se o aluno configurou essa pasta).

Detalhe técnico bonito: distinguir "Protocolar" (futuro) de "Protocolados"
(passado) foi simples, porque a palavra "protocolados" nunca contém "protocolar".

### Passo 18 — Documentação · 21/07 · `3e68106`

O `CLAUDE.md` (guia técnico) e o `DECISOES.md` (registro de decisões) — para o
conhecimento não se perder entre sessões.

### Passo 19 — Este guia · 25/07

A documentação didática (`GUIA-DO-DESENVOLVEDOR.md`) e este histórico, para que
qualquer pessoa — mesmo sem experiência — consiga entender o projeto inteiro.

### Passo 20 — A auditoria antes de publicar · 25/07

Antes de apertar o botão do `npm publish`, uma varredura do que iria para dentro
do pacote e do que a chave pública abre. O pacote estava limpo: nenhum `.env`,
nenhum token, nenhuma chave privada — em nenhum commit do histórico.

Duas coisas apareceram. Uma era sujeira: `@supabase/supabase-js` estava
declarado como dependência mas **nunca era importado** — o CLI fala com o
servidor por `fetch` puro. Saiu.

A outra era real. A Edge Function respondia `email_nao_cadastrado` para quem não
era aluno e outra coisa para quem era. Como a chave anon é pública por desenho
(vai dentro do pacote), qualquer pessoa podia testar uma lista de e-mails e
montar a relação de quem comprou o curso. Não dava acesso a nada — mas expunha
os alunos.

### Passo 21 — Fechar a enumeração · 25/07

Três correções que só funcionam juntas: uma resposta única `acesso_negado` para
todos os casos de recusa, tempo de resposta constante de 2 segundos (senão o
relógio conta o que a resposta calou) e um limite de 10 chamadas por hora por
IP.

O limite é a parte com armadilha. A versão óbvia — ler o contador, comparar,
incrementar — deixa duas chamadas simultâneas lerem o mesmo número e passarem
juntas. A versão correta faz tudo numa instrução só, dentro do banco. Testado
com 30 conexões em paralelo: exatamente 10 passam.

E a própria correção quase abriu um buraco novo: a função precisa de poderes
elevados para escrever na tabela, e o Postgres deixa qualquer um chamar funções
assim por padrão. Sem revogar isso, a chave pública inflaria o contador de
qualquer IP.

### Passo 22 — Publicado · 25/07

Repositório tornado público, SQL aplicado, função em produção, verificação
contra o servidor real: 10 chamadas passam, a 11ª bloqueia, todas em ~2,3s.

O `npm publish` foi recusado na primeira tentativa — o npm passou a **exigir
2FA** para publicar. Ativado o 2FA por passkey, apareceu o detalhe: passkey não
gera código de 6 dígitos, e o `--otp` precisa de um. A saída foi um recovery
code.

`peticia@0.1.0` no ar, tag `v0.1.0` no GitHub.

---

## O estado hoje

- **22 passos**, 108 testes passando, **publicado no npm** em 25/07/2026.
- Os 5 agentes instalados e conectados; os 4 comandos funcionando.
- O backend endurecido contra enumeração de e-mails e verificado em produção.
- **Maior lacuna de verificação**: o comportamento dos agentes rodando de
  verdade (o pipeline nunca foi exercitado ponta a ponta com a IA real). Em
  segundo lugar, o fluxo de **sucesso** do `ativar`/`configurar`, que nunca
  rodou de ponta a ponta — só os caminhos de erro.
