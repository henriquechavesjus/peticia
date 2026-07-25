-- Rate limit por IP para a Edge Function `ativar`.
--
-- Contexto: a `ativar` é chamada com a anon key, que é pública por desenho (vai
-- dentro do pacote npm). Sem limite, qualquer pessoa pode varrer e-mails para
-- descobrir quem é aluno. O agrupamento de motivos em `acesso_negado` tira o
-- sinal da resposta; este limite tira o volume.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_ativar (
  ip         text        primary key,
  requests   integer     not null default 0,
  reset_at   timestamptz not null default (now() + interval '1 hour')
);

comment on table public.rate_limit_ativar is
  'Contador de chamadas da Edge Function ativar, por IP. Escrito só pela função consumir_rate_limit (service_role).';

-- A limpeza varre por reset_at; sem índice ela é um seq scan a cada janela nova.
create index if not exists rate_limit_ativar_reset_at_idx
  on public.rate_limit_ativar (reset_at);

-- RLS ligada e NENHUMA policy: nega tudo para anon e authenticated.
-- A Edge Function usa service_role, que ignora RLS por definição.
alter table public.rate_limit_ativar enable row level security;

revoke all on table public.rate_limit_ativar from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consumo atômico
-- ---------------------------------------------------------------------------

-- Ler, comparar e incrementar em três idas ao banco abre uma janela de corrida:
-- duas requisições simultâneas leem `9`, ambas concluem que cabe, ambas passam.
-- Aqui o INSERT ... ON CONFLICT resolve tudo numa única instrução, que o
-- Postgres executa sob lock da linha — sem janela.
create or replace function public.consumir_rate_limit(
  p_ip     text,
  p_limite integer  default 10,
  p_janela interval default interval '1 hour'
)
returns table (permitido boolean, restantes integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requests integer;
  v_janela_nova boolean;
begin
  if p_ip is null or length(trim(p_ip)) = 0 then
    raise exception 'consumir_rate_limit: p_ip obrigatório';
  end if;

  insert into public.rate_limit_ativar as r (ip, requests, reset_at)
  values (p_ip, 1, now() + p_janela)
  on conflict (ip) do update
    set requests = case when r.reset_at <= now() then 1            else r.requests + 1 end,
        reset_at = case when r.reset_at <= now() then now() + p_janela else r.reset_at     end
  returning r.requests, (r.requests = 1)
  into v_requests, v_janela_nova;

  -- Limpeza oportunista: só quando esta janela acabou de nascer, o que para um
  -- IP qualquer acontece no máximo uma vez por hora. Evita depender de pg_cron
  -- e mantém a tabela pequena sem varrer a cada request.
  if v_janela_nova then
    delete from public.rate_limit_ativar
     where reset_at < now() - interval '24 hours';
  end if;

  return query select (v_requests <= p_limite), greatest(p_limite - v_requests, 0);
end;
$$;

comment on function public.consumir_rate_limit(text, integer, interval) is
  'Incrementa o contador do IP e diz se a chamada cabe no limite. Atômica. Só service_role executa.';

-- SECURITY DEFINER roda com os poderes do dono da função, então quem pode
-- executá-la importa: por padrão o Postgres concede a PUBLIC, o que deixaria a
-- anon key inflar buckets de terceiros. Só a Edge Function deve chamar.
revoke all on function public.consumir_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, integer, interval) to service_role;
