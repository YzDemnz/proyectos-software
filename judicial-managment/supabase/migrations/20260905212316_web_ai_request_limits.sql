-- Request ceilings bound consumption. They are not a monetary spending guarantee.
create table judicial_web_private.ai_usage (
  scope text not null check(scope in ('global_day','user_day','user_minute')),
  subject text not null,
  period timestamptz not null,
  requests integer not null default 0,
  primary key(scope,subject,period)
);
create table judicial_web_private.ai_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table judicial_web_private.ai_usage enable row level security;
alter table judicial_web_private.ai_requests enable row level security;
revoke all on judicial_web_private.ai_usage, judicial_web_private.ai_requests from public,anon,authenticated;

create function judicial_web_private.reserve_ai(actor uuid, request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare amount integer; minute_period timestamptz:=date_trunc('minute',now()); day_period timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  if actor is null or request_key is null then raise exception 'Invalid request'; end if;
  if not exists(select 1 from public.app_profiles where id=actor and account_status='active'
    and (subscription_status in ('active','manual') or role in ('owner','admin')))
  then raise exception 'La IA requiere una cuenta Premium activa.' using errcode='42501'; end if;
  if not exists(select 1 from public.app_profiles where id=actor and role in ('owner','admin'))
    and not exists(select 1 from public.web_account_workspaces w join public.despacho_miembros m on m.despacho_id=w.despacho_id and m.user_id=w.user_id
      join public.despachos d on d.id=w.despacho_id where w.user_id=actor and d.deleted_at is null)
  then raise exception 'Tu despacho web no está disponible.' using errcode='42501'; end if;
  insert into judicial_web_private.ai_requests(request_id,user_id) values(request_key,actor) on conflict do nothing;
  if not found then return jsonb_build_object('allowed',false,'reason','duplicate'); end if;
  -- Same lock order for every request; exceeding any limit rolls the whole reservation back.
  insert into judicial_web_private.ai_usage(scope,subject,period,requests) values('global_day','all',day_period,1)
    on conflict(scope,subject,period) do update set requests=judicial_web_private.ai_usage.requests+1 returning requests into amount;
  if amount>2000 then raise exception 'Se alcanzó el cupo diario del servicio. Vuelve mañana.' using errcode='P0001'; end if;
  insert into judicial_web_private.ai_usage(scope,subject,period,requests) values('user_day',actor::text,day_period,1)
    on conflict(scope,subject,period) do update set requests=judicial_web_private.ai_usage.requests+1 returning requests into amount;
  if amount>100 then raise exception 'Alcanzaste tu cupo diario de IA. Se renueva mañana.' using errcode='P0001'; end if;
  insert into judicial_web_private.ai_usage(scope,subject,period,requests) values('user_minute',actor::text,minute_period,1)
    on conflict(scope,subject,period) do update set requests=judicial_web_private.ai_usage.requests+1 returning requests into amount;
  if amount>10 then raise exception 'Espera un minuto antes de seguir consultando.' using errcode='P0001'; end if;
  return jsonb_build_object('allowed',true,'daily_remaining',100-(select requests from judicial_web_private.ai_usage where scope='user_day' and subject=actor::text and period=day_period));
end;
$$;
revoke all on function judicial_web_private.reserve_ai(uuid,uuid) from public,anon,authenticated;
grant execute on function judicial_web_private.reserve_ai(uuid,uuid) to service_role;
create function public.reserve_web_ai_request(actor uuid,request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$ select judicial_web_private.reserve_ai(actor,request_key); $$;
revoke all on function public.reserve_web_ai_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_web_ai_request(uuid,uuid) to service_role;
