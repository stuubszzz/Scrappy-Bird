-- Scrappy Bird database schema. Paste into Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to run once on a fresh project.

-- Profiles: one row per auth user, created automatically.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(coalesce(new.email, 'player'), '@', 1));
  v_name := left(regexp_replace(v_name, '[^A-Za-z0-9 _.-]', '', 'g'), 24);
  if v_name = '' then v_name := 'player'; end if;
  insert into public.profiles (id, display_name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Scores: every run is a row; best per user/bird is derived.
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bird text not null check (bird in ('birdie','trumpet','sammich','persu')),
  score int not null check (score >= 0 and score <= 5000),
  duration_ms int not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists scores_user_idx on public.scores (user_id, bird, score desc);
create index if not exists scores_bird_idx on public.scores (bird, score desc);

-- Row Level Security: nobody can write scores directly; only the validated RPC can.
alter table public.profiles enable row level security;
alter table public.scores enable row level security;

drop policy if exists "profiles are readable by signed-in users" on public.profiles;
create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "scores readable by signed-in users" on public.scores;
create policy "scores readable by signed-in users"
  on public.scores for select to authenticated using (true);

-- Validated score submission. Rejects impossible scores and rapid-fire spam.
create or replace function public.submit_score(p_bird text, p_score int, p_duration_ms int)
returns table (best int, is_new_best boolean)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prev int; v_last timestamptz; v_max_possible int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_bird not in ('birdie','trumpet','sammich','persu') then raise exception 'bad bird'; end if;
  if p_score < 0 or p_score > 5000 then raise exception 'bad score'; end if;
  if p_duration_ms < 0 or p_duration_ms > 6 * 60 * 60 * 1000 then raise exception 'bad duration'; end if;
  v_max_possible := floor(p_duration_ms / 1000.0) + 2;
  if p_score > v_max_possible then raise exception 'implausible score'; end if;
  select max(created_at) into v_last from scores where user_id = v_uid;
  if v_last is not null and v_last > now() - interval '2 seconds' then raise exception 'too many submissions'; end if;
  select max(score) into v_prev from scores where user_id = v_uid and bird = p_bird;
  insert into scores (user_id, bird, score, duration_ms) values (v_uid, p_bird, p_score, p_duration_ms);
  return query select greatest(coalesce(v_prev, 0), p_score), (v_prev is null or p_score > v_prev);
end $$;

-- Leaderboard: top players per bird.
create or replace function public.leaderboard(p_bird text, p_limit int default 10)
returns table (display_name text, score int)
language sql stable security definer set search_path = public as $$
  select p.display_name, max(s.score) as score
  from scores s join profiles p on p.id = s.user_id
  where s.bird = p_bird
  group by p.id, p.display_name
  order by score desc, min(s.created_at) asc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Own best scores, one call.
create or replace function public.my_bests()
returns table (bird text, best int)
language sql stable security invoker set search_path = public as $$
  select bird, max(score) from scores where user_id = auth.uid() group by bird;
$$;

-- Grants: signed-in users only. The trigger function is not callable through the API at all.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.submit_score(text, int, int) from public, anon;
grant execute on function public.submit_score(text, int, int) to authenticated;
revoke all on function public.leaderboard(text, int) from public, anon;
grant execute on function public.leaderboard(text, int) to authenticated;
revoke all on function public.my_bests() from public, anon;
grant execute on function public.my_bests() to authenticated;
alter default privileges in schema public revoke execute on functions from anon;
