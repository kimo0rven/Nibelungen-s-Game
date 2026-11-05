-- Run this whole file in the Supabase SQL editor (safe to re-run).
-- To add a host: Authentication > Users > Add user (email + password, auto-confirm), then run:
--   insert into public.hosts (user_id) select id from auth.users where email = 'host@example.com';
-- Also enable: Authentication > Providers > Anonymous Sign-Ins (players use these).

create extension if not exists pgcrypto;

-- ───────── Tables ─────────
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  description text not null default '',
  join_code text unique not null,
  status text not null default 'draft' check (status in ('draft','lobby','live','finished')),
  phase text not null default 'question' check (phase in ('question','reveal')),
  current_index int not null default -1,
  question_count int not null default 0,
  question_started_at timestamptz,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.quizzes add column if not exists paused_at timestamptz;

create or replace function public.gen_join_code() returns text language plpgsql as $$
declare c text; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.quizzes where join_code = c);
  end loop;
  return c;
end $$;
alter table public.quizzes alter column join_code set default public.gen_join_code();

create or replace function public.gen_pin() returns text language plpgsql as $$
declare c text := ''; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
  return c;
end $$;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes on delete cascade,
  idx int not null,
  type text not null,
  prompt text not null default '',
  image_url text,
  options jsonb not null default '[]',      -- [{id, text, image_url}]
  extra jsonb not null default '[]',        -- matching: shuffled right-hand items [{id, text}]
  time_limit int not null default 20 check (time_limit between 5 and 300),
  points int not null default 1000 check (points between 0 and 10000)
);
alter table public.questions add column if not exists extra jsonb not null default '[]';
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('single','multiple','true_false','text','number','ordering','matching','pin'));
create index if not exists questions_quiz_idx on public.questions (quiz_id, idx);

-- Answer keys are kept apart so players can never select them.
-- {correct:[ids]} | {accepted:[..], case_sensitive} | {value, tolerance} | {order:[ids]} | {pairs:{leftId:rightId}} | {x,y,radius,aspect}
create table if not exists public.question_keys (
  question_id uuid primary key references public.questions on delete cascade,
  key jsonb not null
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  score int not null default 0,
  joined_at timestamptz not null default now()
);
alter table public.players add column if not exists violations int not null default 0;
alter table public.players add column if not exists team int;
alter table public.players add column if not exists streak int not null default 0;
alter table public.players add column if not exists powerups jsonb not null default '{"fifty":1,"double":1,"skip":1}';
-- Duplicate-join protection: one seat per device identity AND one per (case-insensitive) name.
create unique index if not exists players_quiz_user_uq on public.players (quiz_id, user_id);
create unique index if not exists players_quiz_name_uq on public.players (quiz_id, lower(name));

-- Rejoin PINs are never selectable by clients (no RLS policies on this table).
create table if not exists public.player_secrets (
  player_id uuid primary key references public.players on delete cascade,
  pin text not null,
  attempts int not null default 0
);

create table if not exists public.bans (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes on delete cascade,
  user_id uuid not null,
  name_lower text not null
);
create index if not exists bans_quiz_idx on public.bans (quiz_id);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  user_id uuid not null,
  answer jsonb not null,
  is_correct boolean not null,
  points int not null,
  elapsed_ms int not null,
  created_at timestamptz not null default now(),
  unique (question_id, player_id)
);
alter table public.answers add column if not exists bonus int not null default 0;
alter table public.answers add column if not exists skipped boolean not null default false;
create index if not exists answers_quiz_idx on public.answers (quiz_id);

-- Card hands are kept apart from `players` (which every player can read) so hands stay private.
create table if not exists public.player_hands (
  player_id uuid primary key references public.players on delete cascade,
  cards jsonb not null default '{}'
);

-- One card per player per question. Hostile effects target another player; self cards target the caster.
create table if not exists public.card_effects (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  source_player_id uuid not null references public.players on delete cascade,
  target_player_id uuid not null references public.players on delete cascade,
  kind text not null,
  status text not null,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  data jsonb not null default '{}',
  unique (question_id, source_player_id)
);
create unique index if not exists card_effects_one_hostile
  on public.card_effects (question_id, target_player_id)
  where source_player_id <> target_player_id and not blocked;
create index if not exists card_effects_quiz_idx on public.card_effects (quiz_id);

-- ───────── Host allowlist ─────────
create table if not exists public.hosts (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.hosts enable row level security;
create or replace function public.is_allowed_host() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hosts where user_id = auth.uid())
$$;

-- ───────── Helpers (security definer avoids RLS recursion) ─────────
create or replace function public.is_host(p_quiz uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quizzes where id = p_quiz and host_id = auth.uid()) and public.is_allowed_host()
$$;

create or replace function public.is_player(p_quiz uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where quiz_id = p_quiz and user_id = auth.uid())
$$;

create or replace function public.owns_player(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player and user_id = auth.uid())
$$;

create or replace function public.can_see_question(p_quiz uuid, p_idx int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_player(p_quiz) and exists (
    select 1 from quizzes q where q.id = p_quiz
      and (q.status = 'finished' or (q.status = 'live' and p_idx <= q.current_index)))
$$;

-- ───────── RLS ─────────
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.player_secrets enable row level security;
alter table public.bans enable row level security;
alter table public.player_hands enable row level security;
alter table public.card_effects enable row level security;

-- Targets may read effects aimed at them (this is what drives realtime delivery); hands have no policies.
drop policy if exists card_effects_host_select on public.card_effects;
create policy card_effects_host_select on public.card_effects for select to authenticated
  using (public.is_host(quiz_id));
drop policy if exists card_effects_target_select on public.card_effects;
create policy card_effects_target_select on public.card_effects for select to authenticated
  using (public.owns_player(target_player_id));

drop policy if exists hosts_self on public.hosts;
create policy hosts_self on public.hosts for select to authenticated using (user_id = auth.uid());

drop policy if exists quizzes_host_all on public.quizzes;
create policy quizzes_host_all on public.quizzes for all to authenticated
  using (host_id = auth.uid() and public.is_allowed_host())
  with check (host_id = auth.uid() and public.is_allowed_host());
drop policy if exists quizzes_player_select on public.quizzes;
create policy quizzes_player_select on public.quizzes for select to authenticated
  using (public.is_player(id));

drop policy if exists questions_host_all on public.questions;
create policy questions_host_all on public.questions for all to authenticated
  using (public.is_host(quiz_id)) with check (public.is_host(quiz_id));
drop policy if exists questions_player_select on public.questions;
create policy questions_player_select on public.questions for select to authenticated
  using (public.can_see_question(quiz_id, idx));

drop policy if exists keys_host_all on public.question_keys;
create policy keys_host_all on public.question_keys for all to authenticated
  using (exists (select 1 from questions q where q.id = question_id and public.is_host(q.quiz_id)))
  with check (exists (select 1 from questions q where q.id = question_id and public.is_host(q.quiz_id)));

drop policy if exists players_select on public.players;
create policy players_select on public.players for select to authenticated
  using (public.is_host(quiz_id) or public.is_player(quiz_id));
drop policy if exists players_host_delete on public.players;
create policy players_host_delete on public.players for delete to authenticated
  using (public.is_host(quiz_id));

-- Players read their own answer only through get_my_answer (hides correctness until reveal).
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select to authenticated
  using (public.is_host(quiz_id));

-- ───────── RPCs ─────────
create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public.get_quiz_public(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'title', title, 'description', description, 'status', status)
  from quizzes where join_code = upper(trim(p_code))
$$;

-- ───────── Cards ─────────
create or replace function public.add_card(p_cards jsonb, p_kind text) returns jsonb
language sql immutable as $$
  select jsonb_set(p_cards, array[p_kind], to_jsonb(coalesce((p_cards ->> p_kind)::int, 0) + 1), true)
$$;

-- 40% hostile, 50% self cards, 10% passive immunity.
create or replace function public.random_card() returns text
language plpgsql volatile as $$
declare
  r double precision := random();
  hostile text[] := array['metaller','hatii','dragonoid','savage','requiem','familiar','plankton','kraken','boa','skeleton'];
  -- Phreeoni appears once, the others twice, so it is about half as common as any other self card.
  selfc text[] := array['atroce','atroce','ghostring','ghostring','angeling','angeling','osiris','osiris','doppel','doppel','phreeoni'];
  passive text[] := array['maarduk','giearth','hardexp'];
begin
  if r < 0.4 then return hostile[1 + floor(random() * array_length(hostile, 1))::int];
  elsif r < 0.9 then return selfc[1 + floor(random() * array_length(selfc, 1))::int];
  else return passive[1 + floor(random() * array_length(passive, 1))::int];
  end if;
end $$;

create or replace function public.deal_hand(p_player uuid, p_n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into player_hands (player_id) values (p_player) on conflict do nothing;
  for i in 1..p_n loop
    update player_hands set cards = public.add_card(cards, public.random_card()) where player_id = p_player;
  end loop;
end $$;

create or replace function public.join_quiz(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  qz quizzes; pl players; teams int; t int;
  nm text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into qz from quizzes where join_code = upper(trim(p_code));
  if not found then raise exception 'quiz_not_found'; end if;

  -- Same device re-joining gets its existing seat back (no duplicate).
  select * into pl from players where quiz_id = qz.id and user_id = auth.uid();
  if found then return to_jsonb(pl); end if;

  if qz.status = 'draft' then raise exception 'not_open'; end if;
  if qz.status = 'finished' then raise exception 'finished'; end if;
  if qz.status = 'live' and not coalesce((qz.settings ->> 'allow_late_join')::boolean, true) then
    raise exception 'already_started';
  end if;
  if char_length(nm) < 1 or char_length(nm) > 20 then raise exception 'invalid_name'; end if;
  if exists (select 1 from bans where quiz_id = qz.id and (user_id = auth.uid() or name_lower = lower(nm))) then
    raise exception 'banned';
  end if;

  -- Team mode: auto-balance into the smallest team.
  if coalesce((qz.settings ->> 'team_mode')::boolean, false) then
    teams := greatest(2, least(6, coalesce((qz.settings ->> 'team_count')::int, 2)));
    select g.n into t from generate_series(0, teams - 1) as g(n)
      left join players p on p.quiz_id = qz.id and p.team = g.n
      group by g.n order by count(p.id), random() limit 1;
  end if;

  begin
    insert into players (quiz_id, user_id, name, team) values (qz.id, auth.uid(), nm, t) returning * into pl;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  insert into player_secrets (player_id, pin) values (pl.id, public.gen_pin());
  if coalesce((qz.settings ->> 'cards')::boolean, true) then perform public.deal_hand(pl.id, 3); end if;
  return to_jsonb(pl);
end $$;

create or replace function public.get_my_pin(p_quiz uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.pin from player_secrets s join players p on p.id = s.player_id
  where p.quiz_id = p_quiz and p.user_id = auth.uid()
$$;

-- Take over an existing seat from another device using name + PIN. Failures return
-- {error} rather than raising so the attempt counter is not rolled back.
create or replace function public.rejoin_quiz(p_code text, p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare qz quizzes; pl players; sec player_secrets;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into qz from quizzes where join_code = upper(trim(p_code));
  if not found then raise exception 'quiz_not_found'; end if;
  if exists (select 1 from players where quiz_id = qz.id and user_id = auth.uid()) then
    raise exception 'already_joined';
  end if;
  select * into pl from players where quiz_id = qz.id and lower(name) = lower(trim(coalesce(p_name, '')));
  if not found then return jsonb_build_object('error', 'rejoin_failed'); end if;
  select * into sec from player_secrets where player_id = pl.id;
  if sec.attempts >= 5 then return jsonb_build_object('error', 'pin_locked'); end if;
  if upper(trim(coalesce(p_pin, ''))) <> sec.pin then
    update player_secrets set attempts = attempts + 1 where player_id = pl.id;
    return jsonb_build_object('error', 'rejoin_failed');
  end if;
  update player_secrets set attempts = 0 where player_id = pl.id;
  update answers set user_id = auth.uid() where player_id = pl.id;
  update players set user_id = auth.uid() where id = pl.id returning * into pl;
  return to_jsonb(pl);
end $$;

create or replace function public.kick_player(p_quiz uuid, p_player uuid, p_ban boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pl players;
begin
  if not public.is_host(p_quiz) then raise exception 'forbidden'; end if;
  select * into pl from players where id = p_player and quiz_id = p_quiz;
  if not found then return; end if;
  if p_ban then
    insert into bans (quiz_id, user_id, name_lower) values (p_quiz, pl.user_id, lower(pl.name));
  end if;
  delete from players where id = p_player;
end $$;

create or replace function public.submit_answer(p_quiz uuid, p_answer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  qz quizzes; pl players; q questions; k jsonb;
  elapsed numeric; ok boolean := false; pts int := 0;
  sel text[]; cor text[]; txt text; n numeric; dx numeric; dy numeric;
  lim numeric; hotj jsonb; mult numeric := 1; fx record;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found or qz.status <> 'live' or qz.phase <> 'question' then raise exception 'not_accepting'; end if;
  if qz.paused_at is not null then raise exception 'paused'; end if;
  select * into pl from players where quiz_id = p_quiz and user_id = auth.uid();
  if not found then raise exception 'not_joined'; end if;
  select * into q from questions where quiz_id = p_quiz and idx = qz.current_index;
  elapsed := extract(epoch from (now() - qz.question_started_at));
  lim := q.time_limit;
  if exists (select 1 from card_effects where question_id = q.id and target_player_id = pl.id
             and status = 'slow' and not blocked) then
    lim := lim * 0.7;
  end if;
  if elapsed > lim + 1 then raise exception 'time_up'; end if;
  if exists (select 1 from card_effects where question_id = q.id and target_player_id = pl.id and not blocked
             and status in ('silence', 'freeze') and expires_at > now()) then
    raise exception 'locked';
  end if;
  select data -> 'hot' into hotj from card_effects
    where question_id = q.id and target_player_id = pl.id and status = 'burn' and not blocked and expires_at > now();
  if hotj is not null and (p_answer -> 'selected') ?| array(select jsonb_array_elements_text(hotj)) then
    raise exception 'too_hot';
  end if;
  select key into k from question_keys where question_id = q.id;

  if q.type in ('single', 'multiple', 'true_false') then
    select coalesce(array_agg(x order by x), '{}') into sel
      from jsonb_array_elements_text(coalesce(p_answer -> 'selected', '[]'::jsonb)) x;
    select coalesce(array_agg(x order by x), '{}') into cor
      from jsonb_array_elements_text(coalesce(k -> 'correct', '[]'::jsonb)) x;
    ok := cardinality(sel) > 0 and sel = cor;
  elsif q.type = 'text' then
    txt := trim(coalesce(p_answer ->> 'text', ''));
    ok := txt <> '' and exists (
      select 1 from jsonb_array_elements_text(coalesce(k -> 'accepted', '[]'::jsonb)) a
      where case when coalesce((k ->> 'case_sensitive')::boolean, false)
                 then trim(a) = txt else lower(trim(a)) = lower(txt) end);
  elsif q.type = 'number' then
    n := (p_answer ->> 'number')::numeric;
    ok := abs(n - (k ->> 'value')::numeric) <= coalesce((k ->> 'tolerance')::numeric, 0);
  elsif q.type = 'ordering' then
    ok := (p_answer -> 'order') = (k -> 'order');
  elsif q.type = 'matching' then
    ok := (p_answer -> 'pairs') = (k -> 'pairs');
  elsif q.type = 'pin' then
    dx := (p_answer ->> 'x')::numeric - (k ->> 'x')::numeric;
    dy := ((p_answer ->> 'y')::numeric - (k ->> 'y')::numeric) / greatest(coalesce((k ->> 'aspect')::numeric, 1), 0.1);
    ok := sqrt(dx * dx + dy * dy) <= (k ->> 'radius')::numeric;
  end if;
  ok := coalesce(ok, false);

  if ok then
    pts := round(q.points * (1 - 0.5 * least(greatest(elapsed, 0) / q.time_limit, 1)));
    for fx in select status, created_at from card_effects
      where question_id = q.id and not blocked
        and ((target_player_id = pl.id and status in ('wound', 'poison', 'slow')) or (source_player_id = pl.id and status in ('boost', 'double')))
    loop
      if fx.status = 'wound' then mult := mult * 0.7;
      elsif fx.status = 'slow' then mult := mult * 0.7;
      elsif fx.status = 'poison' then mult := mult * (1 - 0.4 * least(1, extract(epoch from (now() - fx.created_at)) / 6));
      elsif fx.status = 'double' then mult := mult * 2;
      else mult := mult * 1.5;
      end if;
    end loop;
    pts := round(pts * mult);
  end if;

  begin
    insert into answers (quiz_id, question_id, player_id, user_id, answer, is_correct, points, elapsed_ms)
    values (p_quiz, q.id, pl.id, auth.uid(), p_answer, ok, pts, (elapsed * 1000)::int);
  exception when unique_violation then
    raise exception 'already_answered';
  end;
  -- Score is applied (and the verdict revealed) only when the host's reveal runs after the timer.
  return jsonb_build_object('submitted', true);
end $$;

create or replace function public.play_card(p_quiz uuid, p_kind text, p_target uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  qz quizzes; pl players; tg players; q questions; elapsed numeric;
  st text; secs double precision; self_card boolean := false; imm text;
  have int; hot jsonb := '[]'::jsonb; hidden jsonb := '[]'::jsonb; hotkey jsonb; exp timestamptz; is_blocked boolean := false;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found or qz.status <> 'live' or qz.phase <> 'question' then raise exception 'not_accepting'; end if;
  if qz.paused_at is not null then raise exception 'paused'; end if;
  if not coalesce((qz.settings ->> 'cards')::boolean, true) then raise exception 'cards_off'; end if;
  select * into pl from players where quiz_id = p_quiz and user_id = auth.uid();
  if not found then raise exception 'not_joined'; end if;
  select * into q from questions where quiz_id = p_quiz and idx = qz.current_index;
  elapsed := extract(epoch from (now() - qz.question_started_at));
  if elapsed > q.time_limit then raise exception 'time_up'; end if;

  case p_kind
    when 'metaller' then st := 'silence'; secs := 4;
    when 'hatii' then st := 'freeze'; secs := 4;
    when 'dragonoid' then st := 'burn'; secs := 5;
    when 'savage' then st := 'stun'; secs := 4;
    when 'requiem' then st := 'confusion'; secs := 4;
    when 'familiar' then st := 'darkness'; secs := 3;
    when 'plankton' then st := 'blur'; secs := 4;
    when 'kraken' then st := 'wound';
    when 'boa' then st := 'poison';
    when 'skeleton' then st := 'slow';
    when 'atroce' then st := 'boost'; self_card := true;
    when 'ghostring' then st := 'ghost'; self_card := true;
    when 'angeling' then st := 'immune'; self_card := true;
    when 'phreeoni' then st := 'double'; self_card := true;
    when 'osiris' then st := 'skip'; self_card := true;
    when 'doppel' then st := 'fifty'; self_card := true;
    when 'maarduk', 'giearth', 'hardexp' then raise exception 'passive_card';
    else raise exception 'unknown_action';
  end case;

  if st in ('stun', 'confusion', 'darkness', 'blur')
     and not coalesce((qz.settings ->> 'visual_effects')::boolean, true) then
    raise exception 'card_unavailable';
  end if;
  if p_kind in ('dragonoid', 'requiem') and q.type not in ('single', 'multiple', 'true_false') then
    raise exception 'card_unavailable';
  end if;
  if p_kind = 'doppel' and (q.type <> 'single' or jsonb_array_length(q.options) < 3) then
    raise exception 'card_unavailable';
  end if;

  select coalesce((cards ->> p_kind)::int, 0) into have from player_hands where player_id = pl.id;
  if coalesce(have, 0) <= 0 then raise exception 'no_card'; end if;
  if exists (select 1 from card_effects where question_id = q.id and source_player_id = pl.id) then
    raise exception 'already_used';
  end if;

  if self_card then
    tg := pl;
    -- Self cards change how this question is answered or scored, so they must come before answering.
    if exists (select 1 from answers where question_id = q.id and player_id = pl.id) then
      raise exception 'already_answered';
    end if;
    if p_kind = 'angeling' then
      -- Cleanse anything already cast on me this question.
      update card_effects set blocked = true
        where question_id = q.id and target_player_id = pl.id and source_player_id <> pl.id and not blocked;
    elsif p_kind = 'doppel' then
      select k.key into hotkey from question_keys k where k.question_id = q.id;
      select coalesce(jsonb_agg(s.o ->> 'id'), '[]'::jsonb) into hidden from (
        select o from jsonb_array_elements(q.options) as o
        where not ((hotkey -> 'correct') @> to_jsonb(o ->> 'id'))
        order by random()
        limit (case when jsonb_array_length(q.options) >= 4 then 2 else 1 end)) s;
    elsif p_kind = 'osiris' then
      insert into answers (quiz_id, question_id, player_id, user_id, answer, is_correct, points, elapsed_ms, skipped)
      values (p_quiz, q.id, pl.id, auth.uid(), '{"skipped":true}'::jsonb, false, 0, (elapsed * 1000)::int, true);
    end if;
  else
    if p_target is null or p_target = pl.id then raise exception 'invalid_target'; end if;
    select * into tg from players where id = p_target and quiz_id = p_quiz;
    if not found then raise exception 'invalid_target'; end if;
    if coalesce((qz.settings ->> 'team_mode')::boolean, false) and pl.team is not null and tg.team = pl.team then
      raise exception 'cannot_target_teammate';
    end if;
    if exists (select 1 from answers where question_id = q.id and player_id = tg.id) then
      raise exception 'target_answered';
    end if;
    if exists (select 1 from card_effects where question_id = q.id and target_player_id = tg.id and status = 'ghost') then
      raise exception 'untargetable';
    end if;
    if exists (select 1 from card_effects where question_id = q.id and target_player_id = tg.id
               and source_player_id <> target_player_id and not blocked) then
      raise exception 'already_afflicted';
    end if;
    -- Each immunity covers a whole family of effects.
    imm := case when st in ('silence', 'freeze', 'burn') then 'maarduk'
                when st in ('stun', 'confusion', 'darkness', 'blur') then 'giearth'
                when st in ('wound', 'poison', 'slow') then 'hardexp' end;
    if exists (select 1 from card_effects where question_id = q.id and target_player_id = tg.id and status = 'immune') then
      is_blocked := true;
    elsif imm is not null and coalesce((select (cards ->> imm)::int from player_hands where player_id = tg.id), 0) > 0 then
      update player_hands set cards = jsonb_set(cards, array[imm], to_jsonb((cards ->> imm)::int - 1))
        where player_id = tg.id;
      is_blocked := true;
    end if;
  end if;

  if secs is not null and not is_blocked then exp := now() + make_interval(secs => secs); end if;
  if st = 'burn' and not is_blocked then
    select coalesce(jsonb_agg(s.o ->> 'id'), '[]'::jsonb) into hot from (
      select o from jsonb_array_elements(q.options) as o order by random()
      limit least(2, jsonb_array_length(q.options) - 1)) s;
  end if;

  begin
    insert into card_effects (quiz_id, question_id, source_player_id, target_player_id, kind, status, blocked, expires_at, data)
    values (p_quiz, q.id, pl.id, tg.id, p_kind, st, is_blocked, exp, jsonb_build_object('hot', hot, 'hidden', hidden));
  exception when unique_violation then
    raise exception 'already_afflicted';
  end;
  update player_hands set cards = jsonb_set(cards, array[p_kind], to_jsonb((cards ->> p_kind)::int - 1))
    where player_id = pl.id;
  return jsonb_build_object('blocked', is_blocked, 'status', st, 'target', tg.name, 'self', self_card);
end $$;

-- Freeze can be broken early by tapping: 6 taps thaw the player.
create or replace function public.thaw_freeze(p_quiz uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl players; fx card_effects; taps int;
begin
  select * into pl from players where quiz_id = p_quiz and user_id = auth.uid();
  if not found then return; end if;
  select * into fx from card_effects
    where quiz_id = p_quiz and target_player_id = pl.id and status = 'freeze' and not blocked and expires_at > now()
    order by created_at desc limit 1;
  if not found then return; end if;
  taps := coalesce((fx.data ->> 'taps')::int, 0) + 1;
  if taps >= 6 then
    update card_effects set expires_at = now(), data = data || jsonb_build_object('taps', taps) where id = fx.id;
  else
    update card_effects set data = data || jsonb_build_object('taps', taps) where id = fx.id;
  end if;
end $$;

create or replace function public.get_my_cards(p_question uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q questions; pl players; played jsonb; fx jsonb;
begin
  select * into q from questions where id = p_question;
  if not found then return null; end if;
  select * into pl from players where quiz_id = q.quiz_id and user_id = auth.uid();
  if not found then return null; end if;
  select jsonb_build_object('kind', e.kind, 'blocked', e.blocked, 'target', t.name) into played
    from card_effects e join players t on t.id = e.target_player_id
    where e.question_id = p_question and e.source_player_id = pl.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'status', e.status, 'blocked', e.blocked,
      'until', e.expires_at, 'since', e.created_at, 'data', e.data,
      'from', case when e.source_player_id = pl.id then null else s.name end)), '[]'::jsonb) into fx
    from card_effects e join players s on s.id = e.source_player_id
    where e.question_id = p_question and e.target_player_id = pl.id;
  return jsonb_build_object('hand', coalesce((select cards from player_hands where player_id = pl.id), '{}'::jsonb),
                            'played', played, 'effects', fx);
end $$;

-- A player's own answer; correctness and points stay hidden until the reveal phase.
create or replace function public.get_my_answer(p_question uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a answers; qz quizzes; q questions; pl players; shown boolean;
begin
  select * into a from answers where question_id = p_question and user_id = auth.uid();
  if not found then return null; end if;
  select * into q from questions where id = p_question;
  select * into qz from quizzes where id = q.quiz_id;
  select * into pl from players where id = a.player_id;
  shown := qz.status = 'finished' or q.idx < qz.current_index or (q.idx = qz.current_index and qz.phase = 'reveal');
  return jsonb_build_object('question_id', a.question_id, 'answer', a.answer, 'skipped', a.skipped)
    || case when shown
         then jsonb_build_object('is_correct', a.is_correct, 'points', a.points, 'bonus', a.bonus, 'streak', pl.streak)
         else '{}'::jsonb end;
end $$;

-- Correct answer is only revealed to players during the reveal phase.
create or replace function public.get_reveal(p_quiz uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare qz quizzes; k jsonb;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found then return null; end if;
  if not (public.is_host(p_quiz) or (public.is_player(p_quiz) and qz.status = 'live' and qz.phase = 'reveal')) then
    return null;
  end if;
  select qk.key into k from questions q join question_keys qk on qk.question_id = q.id
    where q.quiz_id = p_quiz and q.idx = qz.current_index;
  return k;
end $$;

-- Read-only big-screen feed. Contains no answer key until the reveal phase.
create or replace function public.get_spectator_state(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare qz quizzes; q questions; k jsonb; answered int := 0;
begin
  select * into qz from quizzes where join_code = upper(trim(p_code));
  if not found or not coalesce((qz.settings ->> 'allow_spectators')::boolean, true) then return null; end if;
  if qz.status = 'live' then
    select * into q from questions where quiz_id = qz.id and idx = qz.current_index;
    if q.id is not null then
      select count(*) into answered from answers where question_id = q.id;
      if qz.phase = 'reveal' then select key into k from question_keys where question_id = q.id; end if;
    end if;
  end if;
  return jsonb_build_object(
    'server_now', now(),
    'quiz', jsonb_build_object('id', qz.id, 'title', qz.title, 'status', qz.status, 'phase', qz.phase,
      'current_index', qz.current_index, 'question_count', qz.question_count,
      'question_started_at', qz.question_started_at, 'paused_at', qz.paused_at,
      'join_code', qz.join_code, 'settings', qz.settings),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'score', score,
      'team', team, 'streak', streak, 'joined_at', joined_at)) from players where quiz_id = qz.id), '[]'::jsonb),
    'plays', case when qz.status = 'live' then coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'blocked', e.blocked,
        'from', s.name, 'target', t.name, 'self', e.source_player_id = e.target_player_id,
        'at', e.created_at) order by e.created_at)
      from card_effects e join players s on s.id = e.source_player_id join players t on t.id = e.target_player_id
      where e.quiz_id = qz.id and e.created_at > now() - interval '8 seconds'), '[]'::jsonb) else '[]'::jsonb end,
    'question', case when q.id is null then null else to_jsonb(q) end,
    'key', k,
    'answered', answered);
end $$;

create or replace function public.host_advance(p_quiz uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare qz quizzes; q questions; n int;
begin
  if not public.is_host(p_quiz) then raise exception 'forbidden'; end if;
  select * into qz from quizzes where id = p_quiz;

  if p_action = 'open' then
    select count(*) into n from questions where quiz_id = p_quiz;
    if n = 0 then raise exception 'no_questions'; end if;
    update quizzes set status = 'lobby', question_count = n, current_index = -1, phase = 'question',
      question_started_at = null, paused_at = null where id = p_quiz;
  elsif p_action = 'close' then
    delete from players where quiz_id = p_quiz;
    delete from bans where quiz_id = p_quiz;
    update quizzes set status = 'draft', current_index = -1, phase = 'question', paused_at = null where id = p_quiz;
  elsif p_action = 'start' then
    update quizzes set status = 'live', current_index = 0, phase = 'question', question_started_at = now(),
      paused_at = null where id = p_quiz and status = 'lobby';
  elsif p_action = 'pause' then
    update quizzes set paused_at = now() where id = p_quiz and status = 'live' and paused_at is null;
  elsif p_action = 'resume' then
    update quizzes set question_started_at = question_started_at + (now() - paused_at), paused_at = null
      where id = p_quiz and status = 'live' and paused_at is not null;
  elsif p_action = 'reveal' then
    if qz.status = 'live' and qz.phase = 'question' then
      if qz.paused_at is not null then raise exception 'paused'; end if;
      select * into q from questions where quiz_id = p_quiz and idx = qz.current_index;
      if extract(epoch from (now() - qz.question_started_at)) < q.time_limit + 1 then
        raise exception 'too_early';
      end if;
      -- The phase flip doubles as a lock so concurrent reveals can't score twice.
      update quizzes set phase = 'reveal' where id = p_quiz and phase = 'question';
      if found then
        -- Streak bonus: +10% of the question's points per previous correct answer in a row (max +50%).
        if coalesce((qz.settings ->> 'streaks')::boolean, true) then
          update answers a set bonus = round(a.points * 0.1 * least(pl.streak, 5))
            from players pl
            where a.player_id = pl.id and a.question_id = q.id and a.is_correct;
        end if;
        update players pl set
          score = score + coalesce((select sum(a.points + a.bonus) from answers a
                                    where a.player_id = pl.id and a.question_id = q.id), 0),
          streak = case
            when exists (select 1 from answers a where a.player_id = pl.id and a.question_id = q.id and a.is_correct)
              then pl.streak + 1
            when exists (select 1 from answers a where a.player_id = pl.id and a.question_id = q.id and a.skipped)
              then pl.streak
            else 0 end
          where pl.quiz_id = p_quiz;
        -- Every 3rd question everyone draws a card; the bottom half of the board draws two.
        if coalesce((qz.settings ->> 'cards')::boolean, true) and (qz.current_index + 1) % 3 = 0 then
          perform public.deal_hand(r.id, case when r.rk * 2 > r.total then 2 else 1 end)
            from (select id, row_number() over (order by score desc) as rk, count(*) over () as total
                  from players where quiz_id = p_quiz) r;
        end if;
      end if;
    end if;
  elsif p_action = 'next' then
    if qz.status = 'live' and qz.phase = 'reveal' then
      if qz.current_index + 1 >= qz.question_count then
        update quizzes set status = 'finished', paused_at = null where id = p_quiz;
      else
        update quizzes set current_index = current_index + 1, phase = 'question', question_started_at = now(),
          paused_at = null where id = p_quiz;
      end if;
    end if;
  elsif p_action = 'finish' then
    update quizzes set status = 'finished', paused_at = null where id = p_quiz;
  elsif p_action = 'reset' then
    delete from answers where quiz_id = p_quiz;
    delete from card_effects where quiz_id = p_quiz;
    update player_hands set cards = '{}'::jsonb where player_id in (select id from players where quiz_id = p_quiz);
    if coalesce((qz.settings ->> 'cards')::boolean, true) then
      perform public.deal_hand(id, 3) from players where quiz_id = p_quiz;
    end if;
    update players set score = 0, streak = 0 where quiz_id = p_quiz;
    update quizzes set status = 'lobby', current_index = -1, phase = 'question', question_started_at = null,
      paused_at = null where id = p_quiz;
  else
    raise exception 'unknown_action';
  end if;
end $$;

revoke execute on function
  public.join_quiz(text, text), public.rejoin_quiz(text, text, text), public.get_my_pin(uuid),
  public.kick_player(uuid, uuid, boolean), public.submit_answer(uuid, jsonb), public.get_my_answer(uuid), public.get_reveal(uuid),
  public.get_spectator_state(text), public.host_advance(uuid, text), public.get_quiz_public(text),
  public.play_card(uuid, text, uuid), public.get_my_cards(uuid), public.thaw_freeze(uuid),
  public.server_time() from public, anon;
-- Internal helpers must not be callable by clients at all.
revoke execute on function public.deal_hand(uuid, int), public.random_card(), public.add_card(jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.join_quiz(text, text), public.rejoin_quiz(text, text, text), public.get_my_pin(uuid),
  public.kick_player(uuid, uuid, boolean), public.submit_answer(uuid, jsonb), public.get_my_answer(uuid), public.get_reveal(uuid),
  public.get_spectator_state(text), public.host_advance(uuid, text), public.get_quiz_public(text),
  public.play_card(uuid, text, uuid), public.get_my_cards(uuid), public.thaw_freeze(uuid),
  public.server_time() to authenticated;

-- ───────── Anti-cheat reporting ─────────
create or replace function public.report_violation(p_quiz uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('tab_hidden', 'window_blur', 'devtools', 'paste', 'shortcut') then return; end if;
  update players set violations = violations + 1
    where quiz_id = p_quiz and user_id = auth.uid()
      and exists (select 1 from quizzes where id = p_quiz and status = 'live' and phase = 'question');
end $$;
revoke execute on function public.report_violation(uuid, text) from public, anon;
grant execute on function public.report_violation(uuid, text) to authenticated;

-- ───────── Realtime ─────────
do $$
declare t text;
begin
  foreach t in array array['quizzes', 'players', 'answers', 'card_effects'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────── Storage (question images) ─────────
insert into storage.buckets (id, name, public) values ('quiz-images', 'quiz-images', true)
  on conflict (id) do nothing;
drop policy if exists "hosts upload quiz images" on storage.objects;
create policy "hosts upload quiz images" on storage.objects for insert to authenticated
  with check (bucket_id = 'quiz-images'
    and public.is_allowed_host()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "hosts delete quiz images" on storage.objects;
create policy "hosts delete quiz images" on storage.objects for delete to authenticated
  using (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Old power-ups were replaced by cards (Phreeoni = double, Osiris = skip, Doppelganger = 50/50).
drop function if exists public.use_powerup(uuid, text);
drop function if exists public.get_my_powerups(uuid);
drop table if exists public.powerup_uses;
