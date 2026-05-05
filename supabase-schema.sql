create table if not exists baby_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists baby_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owned integer not null default 0,
  desired integer not null default 1,
  image_url text,
  note text,
  category text not null,
  created_at timestamptz default now()
);

alter table baby_groups enable row level security;
alter table baby_items enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on baby_groups to anon, authenticated;
grant select, insert, update, delete on baby_items to anon, authenticated;

drop policy if exists "Public read groups" on baby_groups;
drop policy if exists "Public insert groups" on baby_groups;
drop policy if exists "Public update groups" on baby_groups;
drop policy if exists "Public read items" on baby_items;
drop policy if exists "Public insert items" on baby_items;
drop policy if exists "Public update items" on baby_items;
drop policy if exists "Public delete items" on baby_items;

create policy "Public read groups"
on baby_groups for select
using (true);

create policy "Public insert groups"
on baby_groups for insert
with check (true);

create policy "Public update groups"
on baby_groups for update
using (true)
with check (true);

create policy "Public read items"
on baby_items for select
using (true);

create policy "Public insert items"
on baby_items for insert
with check (true);

create policy "Public update items"
on baby_items for update
using (true)
with check (true);

create policy "Public delete items"
on baby_items for delete
using (true);

insert into baby_groups (name, sort_order)
values
  ('Newborn', 1),
  ('1-3m', 2),
  ('3-6m', 3),
  ('6-9m', 4),
  ('9-12m', 5),
  ('1-2y', 6),
  ('2-3y', 7),
  ('General', 8)
on conflict (name) do nothing;
