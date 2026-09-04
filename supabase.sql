-- Omni-QA Agent — Supabase schema (ponytail: minimal, RLS deferred until prod)
create extension if not exists "uuid-ossp";

create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  url text not null,
  bug_description text,
  status text not null default 'running',
  created_at timestamptz default now()
);
create table if not exists bug_reports (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  verdict text,
  summary text,
  steps jsonb,
  console_errors text,
  screenshot_url text,
  created_at timestamptz default now()
);
create index if not exists idx_sessions_created on sessions(created_at desc);
create index if not exists idx_reports_session on bug_reports(session_id);

-- RLS (enable, allow service_role all, anon read)
alter table sessions enable row level security;
alter table bug_reports enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='service_all_sessions') then
    create policy service_all_sessions on sessions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service_all_reports') then
    create policy service_all_reports on bug_reports for all using (true) with check (true);
  end if;
end $$;
