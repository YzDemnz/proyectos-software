-- Ejecuta este archivo completo en Supabase SQL Editor para habilitar las
-- referencias privadas y el estilo por despacho de Juris.
-- Las politicas RLS mantienen los datos separados: solo propietario y
-- administradores gestionan, y solo miembros del mismo despacho pueden leer.

create table if not exists public.juris_preferencias (
  despacho_id uuid primary key references public.despachos(id) on delete cascade,
  response_tone text not null default 'formal' check (response_tone in ('formal', 'claro', 'directo')),
  custom_instructions text not null default '' check (char_length(custom_instructions) <= 2000),
  updated_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.juris_referencias (
  id uuid primary key default gen_random_uuid(), despacho_id uuid not null references public.despachos(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180), file_name text not null, file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 104857600), storage_path text not null unique,
  extraction_status text not null default 'pending' check (extraction_status in ('ready', 'needs_ocr', 'unsupported', 'failed', 'pending')),
  extracted_text text not null default '' check (char_length(extracted_text) <= 160000),
  uploaded_by uuid not null references auth.users(id) on delete restrict default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_juris_referencias_despacho_created on public.juris_referencias(despacho_id, created_at desc);
alter table public.juris_preferencias enable row level security; alter table public.juris_referencias enable row level security;
drop policy if exists "Despacho members can read Juris preferences" on public.juris_preferencias;
create policy "Despacho members can read Juris preferences" on public.juris_preferencias for select to authenticated using (public.is_despacho_member(despacho_id));
drop policy if exists "Despacho admins can manage Juris preferences" on public.juris_preferencias;
create policy "Despacho admins can manage Juris preferences" on public.juris_preferencias for all to authenticated using (public.can_admin_despacho(despacho_id)) with check (public.can_admin_despacho(despacho_id) and updated_by = auth.uid());
drop policy if exists "Despacho members can read Juris references" on public.juris_referencias;
create policy "Despacho members can read Juris references" on public.juris_referencias for select to authenticated using (public.is_despacho_member(despacho_id));
drop policy if exists "Despacho admins can add Juris references" on public.juris_referencias;
create policy "Despacho admins can add Juris references" on public.juris_referencias for insert to authenticated with check (public.can_admin_despacho(despacho_id) and uploaded_by = auth.uid());
drop policy if exists "Despacho admins can remove Juris references" on public.juris_referencias;
create policy "Despacho admins can remove Juris references" on public.juris_referencias for delete to authenticated using (public.can_admin_despacho(despacho_id));
notify pgrst, 'reload schema';
