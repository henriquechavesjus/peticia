# peticia

[![npm](https://img.shields.io/npm/v/peticia)](https://www.npmjs.com/package/peticia)
[![license](https://img.shields.io/npm/l/peticia)](LICENSE)

Gere petições iniciais no padrão do seu escritório, conversando em português com um agente de IA.

## O que é

O peticia instala e coordena um time de agentes do Claude Code que redigem, revisam, organizam e conferem petições iniciais de Direito do Consumidor — sempre a partir dos seus modelos, do seu timbrado e das regras do seu escritório. Você configura uma vez; depois, digita `peticia` e pede em linguagem natural o que precisa ("faça a próxima inicial", "processe a fila do escritório"), e o agente maestro conduz o trabalho do começo ao protocolo.

## Como usar

**1. Instalar** (precisa de Node.js 20+ e do [Claude Code](https://docs.claude.com/en/docs/claude-code)):

```
npm install -g peticia
```

**2. Ativar** — uma vez, com o e-mail da sua licença:

```
peticia ativar seu@email.com
```

Isso cria a pasta `~/peticia/`, instala os agentes e conecta o Claude Code a eles.

<details>
<summary>Se a ativação não funcionar</summary>

**"Este e-mail ainda não tem acesso ao peticia."** — uma resposta única para
vários casos: e-mail não cadastrado, digitado errado, acesso suspenso ou
cancelado, licença vencida, ou limite de computadores atingido. Não dizemos qual
é de propósito — se a mensagem fosse específica, qualquer pessoa poderia testar
e-mails para descobrir quem é aluno. Fale com o suporte, que identifica o caso.

**"Muitas tentativas em pouco tempo."** — o limite é de 10 tentativas por hora,
por conexão de internet. Espere e tente de novo. Se você está num escritório onde
várias pessoas ativam no mesmo dia, a cota é compartilhada pela rede.

A ativação leva cerca de 2 segundos mesmo quando falha — isso é proposital, não
lentidão.

</details>

**3. Configurar seu escritório** — uma vez:

```
peticia configurar
```

Um assistente pergunta onde estão suas pastas (fila de entrada, modelos, protocolados), os dados do advogado (nome, OABs por estado), a formatação padrão e, opcionalmente, uma chave OpenAI para a revisão automática.

**4. Usar no dia a dia:**

```
peticia
```

Abre o Claude Code já conversando com o maestro. A partir daí é português: peça a próxima inicial, um lote da fila, ou uma revisão avulsa.

## Os agentes

A ativação instala cinco agentes em `~/peticia/agentes/` — e eles passam a ser seus: edite o texto de cada um como quiser, o peticia não sobrescreve suas alterações.

| Agente | Papel |
| --- | --- |
| `maestro` | Interpreta o pedido e coordena os demais |
| `redator` | Redige a inicial a partir da pasta do caso |
| `revisor-gpt` | Segunda opinião via OpenAI (opcional) |
| `organizador` | Monta a pasta `PROTOCOLO/` |
| `conferente` | Veredito final antes do protocolo |

## O que você precisa

- Node.js 20 ou superior
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e autenticado
- macOS ou Windows
- Acesso ao peticia (pelo curso ou por código de ativação)

## Comandos

| Comando | O que faz |
| --- | --- |
| `peticia` | Abre o Claude Code para trabalhar |
| `peticia ativar EMAIL` | Ativa a licença e instala os agentes |
| `peticia configurar` | Configura escritório, advogado e formatação |
| `peticia status` | Mostra o estado da instalação |

## Documentação

- [Guia do desenvolvedor](docs/GUIA-DO-DESENVOLVEDOR.md) — entenda o projeto do zero (para todos os níveis).
- [Registro de decisões](docs/DECISOES.md) — por que cada escolha foi feita.
- [Histórico](docs/HISTORICO.md) — a construção passo a passo.
- [CLAUDE.md](CLAUDE.md) — resumo técnico denso.

## Licença

MIT — veja o arquivo [LICENSE](LICENSE).

## Autor

Dr. Henrique Chaves Bernardo — OAB/BA 37.189

Um produto AdvGrow.
