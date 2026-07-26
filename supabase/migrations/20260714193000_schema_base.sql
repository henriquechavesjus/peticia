-- Schema base do controle de acesso do peticia: usuários, ativações, módulos e
-- telemetria.
--
-- MIGRATION RETROATIVA (escrita em 26/07/2026). Estas cinco tabelas foram
-- criadas à mão no SQL Editor em 14/07/2026 e viveram meses só no banco de
-- produção — não havia DDL delas em lugar nenhum do repositório, então ninguém
-- conseguia reconstruir o projeto a partir do código. Este arquivo fecha essa
-- lacuna: ele foi derivado do estado real de produção (colunas, defaults,
-- constraints e índices conferidos um a um) e verificado aplicando-o num banco
-- vazio e diffando o resultado contra produção.
--
-- LIMITE DESTE ARQUIVO: todo `create table` aqui é `if not exists`, para ser
-- idempotente contra o banco que já existe. Isso significa que ele NÃO repara
-- uma tabela divergente — numa tabela que já existe, o corpo do `create` é
-- ignorado inteiro, constraints incluídas. Ele é a fonte de verdade para um
-- banco NOVO. Divergência em produção se conserta com migration própria.
--
-- Os nomes das constraints estão escritos à mão de propósito. Em produção eles
-- foram gerados pelo Postgres; fixá-los aqui é o que garante que um banco novo
-- não invente `usuarios_check1` e divirja no nome.

-- ---------------------------------------------------------------------------
-- usuarios — quem tem acesso ao CLI
-- ---------------------------------------------------------------------------

create table if not exists public.usuarios (
  id               uuid        primary key default gen_random_uuid(),
  email            text        not null,
  nome             text,
  tipo             text        not null,
  status           text        not null default 'ativo',
  max_dispositivos integer     not null default 2,
  validade_ate     timestamptz,
  observacoes      text,
  criado_em        timestamptz not null default now(),

  constraint usuarios_email_key  unique (email),
  constraint usuarios_tipo_check   check (tipo   in ('aluno', 'avulso')),
  constraint usuarios_status_check check (status in ('ativo', 'suspenso', 'cancelado'))
);

comment on table public.usuarios is
  'Quem pode ativar o CLI. A Edge Function ativar busca por email; status e validade_ate negam o acesso sem dizer por quê.';

comment on column public.usuarios.max_dispositivos is
  'Quantas máquinas simultâneas esta licença permite. Default 2; a turma de lançamento usa 99 (decisão do dono, acesso praticamente sem limite de máquina).';

comment on column public.usuarios.validade_ate is
  'Nulo = vitalício, e é o caso de todos os usuários atuais (decisão do dono). Quando preenchido e vencido, a ativação é negada como acesso_negado.';

-- O unique de email já cria um índice btree; este índice extra é redundante com
-- ele. Recriado aqui porque existe em produção e derrubá-lo não é objetivo
-- desta migration — o schema precisa bater, não ficar ótimo.
create index if not exists idx_usuarios_email on public.usuarios (email);

-- ---------------------------------------------------------------------------
-- modulos_disponiveis — catálogo dos agentes que a licença pode liberar
-- ---------------------------------------------------------------------------

create table if not exists public.modulos_disponiveis (
  id           text        primary key,
  nome         text        not null,
  descricao    text,
  incluso_core boolean     not null default false,
  ativo        boolean     not null default true,
  criado_em    timestamptz not null default now()
);

comment on table public.modulos_disponiveis is
  'Catálogo de módulos (agentes). incluso_core = liberado para todo usuário sem precisar de linha em modulos_do_usuario.';

comment on column public.modulos_disponiveis.incluso_core is
  'Se true, a Edge Function devolve o módulo para qualquer usuário válido. Um módulo core NÃO deve ser vendido com prazo: na resposta o core ganha da linha contratada, e o prazo seria ignorado em silêncio.';

-- Dado de referência, não dado de usuário: sem estas cinco linhas um projeto
-- novo sobe com o schema certo e o produto quebrado (o CLI imprimiria
-- "0 módulos liberados"). `do nothing` para não sobrescrever texto que já
-- tenha sido editado em produção.
insert into public.modulos_disponiveis (id, nome, descricao, incluso_core, ativo) values
  ('redator',     'Redator de Iniciais',       'Gera petições iniciais no padrão do escritório',   true, true),
  ('revisor-gpt', 'Revisor com GPT',           'Segunda opinião via OpenAI (aluno usa própria chave)', true, true),
  ('organizador', 'Organizador de Documentos', 'Converte imagens, junta PDFs, prepara PROTOCOLO/', true, true),
  ('conferente',  'Conferente Final',          'Veredito PODE / NÃO PROTOCOLAR',                   true, true),
  ('transcritor', 'Transcritor de Áudios',     'Transcreve áudios via Whisper local',              true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ativacoes — uma linha por máquina de cada usuário
-- ---------------------------------------------------------------------------

create table if not exists public.ativacoes (
  id          uuid        primary key default gen_random_uuid(),
  usuario_id  uuid        not null,
  device_id   text        not null,
  so          text,
  versao_cli  text,
  ativado_em  timestamptz not null default now(),
  ativo       boolean     not null default true,

  constraint ativacoes_usuario_id_device_id_key unique (usuario_id, device_id),
  constraint ativacoes_usuario_id_fkey foreign key (usuario_id)
    references public.usuarios (id) on delete cascade
);

comment on table public.ativacoes is
  'Máquinas registradas por usuário. O unique (usuario_id, device_id) é o que faz reativação da mesma máquina não consumir vaga nova.';

comment on column public.ativacoes.ativo is
  'Baixa lógica: uma máquina revogada fica na tabela com ativo=false e deixa de contar contra max_dispositivos, preservando o histórico.';

-- A Edge Function conta as máquinas ativas do usuário a cada ativação; este é
-- exatamente o filtro dela.
create index if not exists idx_ativacoes_usuario_ativo on public.ativacoes (usuario_id, ativo);

-- ---------------------------------------------------------------------------
-- modulos_do_usuario — módulos contratados além do core
-- ---------------------------------------------------------------------------

create table if not exists public.modulos_do_usuario (
  id            uuid        primary key default gen_random_uuid(),
  usuario_id    uuid        not null,
  modulo_id     text        not null,
  status        text        not null default 'ativo',
  validade_ate  timestamptz,
  contratado_em timestamptz not null default now(),
  observacoes   text,

  constraint modulos_do_usuario_usuario_id_modulo_id_key unique (usuario_id, modulo_id),
  constraint modulos_do_usuario_status_check check (status in ('ativo', 'suspenso', 'cancelado')),
  constraint modulos_do_usuario_usuario_id_fkey foreign key (usuario_id)
    references public.usuarios (id) on delete cascade,
  -- Sem ON DELETE: apagar um módulo do catálogo que alguém contratou deve
  -- FALHAR, não apagar o contrato nem deixá-lo apontando para o nada.
  constraint modulos_do_usuario_modulo_id_fkey foreign key (modulo_id)
    references public.modulos_disponiveis (id)
);

comment on table public.modulos_do_usuario is
  'Módulos contratados individualmente. Hoje todo módulo do catálogo é core, então estas linhas são inertes: a Edge Function deduplica e o core ganha. Existem para o dia em que houver módulo pago fora do core.';

create index if not exists idx_modulos_usuario on public.modulos_do_usuario (usuario_id, status);

-- ---------------------------------------------------------------------------
-- pings — telemetria de uso
-- ---------------------------------------------------------------------------

create table if not exists public.pings (
  id            uuid        primary key default gen_random_uuid(),
  usuario_id    uuid,
  ativacao_id   uuid,
  comando       text,
  versao_cli    text,
  registrado_em timestamptz not null default now(),

  -- SET NULL nas duas: telemetria sobrevive ao usuário e à máquina que a
  -- gerou. Perder a contagem histórica porque um cadastro foi apagado seria
  -- pior que perder o vínculo.
  constraint pings_usuario_id_fkey foreign key (usuario_id)
    references public.usuarios (id) on delete set null,
  constraint pings_ativacao_id_fkey foreign key (ativacao_id)
    references public.ativacoes (id) on delete set null
);

comment on table public.pings is
  'Registro de uso do CLI, um por comando reportado.';

comment on column public.pings.ativacao_id is
  'De qual máquina veio o ping. Nulo nos 4 pings de julho/2026, quando a Edge Function ainda não preenchia o campo.';

create index if not exists idx_pings_usuario on public.pings (usuario_id, registrado_em desc);
create index if not exists idx_pings_data    on public.pings (registrado_em desc);

-- ---------------------------------------------------------------------------
-- Fechamento do acesso
-- ---------------------------------------------------------------------------

-- RLS ligada e NENHUMA policy: nega tudo para anon e authenticated. A Edge
-- Function usa service_role, que ignora RLS por definição. Este é o desenho
-- deliberado — o linter do Supabase reporta `rls_enabled_no_policy` como INFO
-- nas cinco, e é o esperado.
alter table public.usuarios            enable row level security;
alter table public.modulos_disponiveis enable row level security;
alter table public.ativacoes           enable row level security;
alter table public.modulos_do_usuario  enable row level security;
alter table public.pings               enable row level security;

-- Segundo cinto, e ele não é decorativo: o Supabase mantém ALTER DEFAULT
-- PRIVILEGES concedendo a anon e authenticated em `public`, então uma tabela
-- criada aqui NASCE com SELECT/INSERT/UPDATE/DELETE para a anon key. Hoje a
-- RLS sem policy é o que segura isso sozinha — basta uma policy permissiva
-- escrita sem cuidado para a porta abrir. O revoke tira a porta.
revoke all on table public.usuarios            from public, anon, authenticated;
revoke all on table public.modulos_disponiveis from public, anon, authenticated;
revoke all on table public.ativacoes           from public, anon, authenticated;
revoke all on table public.modulos_do_usuario  from public, anon, authenticated;
revoke all on table public.pings               from public, anon, authenticated;
