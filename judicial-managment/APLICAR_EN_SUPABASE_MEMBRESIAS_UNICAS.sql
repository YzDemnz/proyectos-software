/* Run this in Supabase SQL Editor after deploying the desktop update. */

with ranked_memberships as (
  select
    id,
    row_number() over (
      partition by despacho_id, user_id
      order by
        case role
          when 'owner' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end,
        created_at asc,
        id asc
    ) as row_number
  from public.despacho_miembros
)
delete from public.despacho_miembros
where id in (
  select id
  from ranked_memberships
  where row_number > 1
);

create unique index if not exists idx_despacho_miembros_one_membership
  on public.despacho_miembros(despacho_id, user_id);

notify pgrst, 'reload schema';
