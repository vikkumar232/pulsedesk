-- PulseDesk shared incident storage
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  incident text not null,
  transcript text default '',
  location text default 'Location pending confirmation',
  services text default 'Pending dispatch selection',
  severity integer not null default 4 check (severity between 1 and 10),
  status text not null default 'open' check (status in ('open', 'resolved', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.incidents enable row level security;

create policy "Users can view their own incidents"
  on public.incidents for select
  using (auth.uid() = created_by);

create policy "Users can create their own incidents"
  on public.incidents for insert
  with check (auth.uid() = created_by);

create policy "Users can update their own incidents"
  on public.incidents for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Users can delete their own incidents"
  on public.incidents for delete
  using (auth.uid() = created_by);

create index if not exists incidents_created_by_created_at_idx
  on public.incidents (created_by, created_at desc);
