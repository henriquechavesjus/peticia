# peticia

CLI para advogados automatizarem a geração de petições jurídicas com Claude Code e agentes.

> **Em desenvolvimento.** Esta versão publica apenas o esqueleto do CLI: os comandos
> aparecem no `--help`, mas ainda não executam nada.

## Requisitos

- Node.js 20 ou superior
- Claude Code instalado e autenticado
- macOS ou Windows

## Instalação

```
npm install -g peticia
```

## Uso

O peticia tem duas superfícies.

**Uso diário** — você digita apenas `peticia` e conversa em linguagem natural.
O agente maestro decide o que fazer a partir do seu pedido.

```
$ peticia
```

**Setup** — os comandos técnicos, usados poucas vezes.

| Comando | O que faz |
| --- | --- |
| `peticia ativar` | Instala o peticia e ativa a licença neste dispositivo |
| `peticia configurar` | Configura escritórios, dados do advogado e chaves de API |
| `peticia status` | Mostra o estado da instalação, da licença e dos agentes |
| `peticia atualizar` | Busca novidades e atualiza as partes gerenciadas pelo peticia |
| `peticia editar` | Abre a pasta `~/peticia` para editar agentes e workflows |
| `peticia plugin` | Lista e instala plugins opcionais |

## O que a ativação cria

```
~/peticia/
├── agentes/        maestro, redator, revisor, organizador, conferente, transcritor
├── workflows/      pipelines de processamento
├── lib/            motor de formatação das peças
├── ferramentas/    integrações opcionais
├── config/         suas configurações (permissões restritas)
└── COMO-USAR.md
```

Além disso, um link simbólico `~/.claude/agents/peticia` aponta para `~/peticia/agentes/`,
que é onde o Claude Code procura agentes.

Depois da instalação **os agentes são seus**: o peticia nunca sobrescreve o que você
editou. Novidades chegam como plugins, que você instala se quiser.

## Desenvolvimento

```
npm install
npm link          # disponibiliza o comando `peticia` localmente
peticia --help
```

## Licença

Uso restrito a licenciados.
