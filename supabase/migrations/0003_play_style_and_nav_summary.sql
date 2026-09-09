-- NU Ping Pong — quick/long play styles, and one round trip for the nav.
-- Additive on top of 0002. Safe to run on a database with real data.

-- ---------------------------------------------------------------------------
-- queue_entries.play_style — "I only want one game" vs "I'm sticking around".
-- Replaces the old expires_at duration picker: players sort timing out in
-- chat, so the app no longer asks how long they'll be there. The 2 hour
-- default expiry stays, purely so the queue cleans itself up.
-- ---------------------------------------------------------------------------
alter table public.queue_entries
  add column if not exists play_style text not null default 'long';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'queue_entries_play_style_check'
  ) then
    alter table public.queue_entries
      add constraint queue_entries_play_style_check
      check (play_style in ('quick', 'long'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_queue — no more p_minutes. The old three-arg version has a different
-- signature, so it's an overload rather than a replacement: drop it.
-- ---------------------------------------------------------------------------
drop function if exists public.join_queue(text, text, integer);

create or replace function public.join_queue(
  p_location text default null,
  p_note text default null,
  p_play_style text default 'long'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_style text := case when p_play_style = 'quick' then 'quick' else 'long' end;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join the queue.';
  end if;

  insert into public.queue_entries (user_id, location, note, play_style, joined_at, expires_at)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_style,
    now(),
    now() + interval '2 hours'
  )
  on conflict (user_id) do update
    set location = excluded.location,
        note = excluded.note,
        play_style = excluded.play_style,
        joined_at = now(),
        expires_at = excluded.expires_at;
end;
$$;

grant execute on function public.join_queue(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- find_match — same as before, but prefers someone who wants the same kind of
-- session. Only a preference: being paired with anyone beats being paired
-- with nobody, so a mismatch still gets matched if that's all there is.
-- ---------------------------------------------------------------------------
drop function if exists public.find_match();

create or replace function public.find_match(p_play_style text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_my_rating integer;
  v_my_style text;
  v_opponent uuid;
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;

  select rating into v_my_rating from public.profiles where id = v_me;
  if v_my_rating is null then
    raise exception 'Your profile is not set up yet.';
  end if;

  -- Prefer what was asked for on the button; otherwise reuse whatever the
  -- player already put in their own queue entry.
  v_my_style := case
    when p_play_style in ('quick', 'long') then p_play_style
    else (select play_style from public.queue_entries where user_id = v_me)
  end;

  -- Lock the queue rows we're about to consume so two people pressing the
  -- button at the same moment can't both grab the same opponent.
  select q.user_id into v_opponent
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_me
    and q.expires_at > now()
  order by
    (v_my_style is not null and q.play_style <> v_my_style),
    abs(p.rating - v_my_rating),
    q.joined_at
  limit 1
  for update of q skip locked;

  if v_opponent is null then
    return null;
  end if;

  v_channel_id := public.open_match_channel(v_me, v_opponent);

  insert into public.challenges (challenger, opponent, status, channel_id, responded_at)
  values (v_me, v_opponent, 'accepted', v_channel_id, now());

  delete from public.queue_entries where user_id in (v_me, v_opponent);

  return v_channel_id;
end;
$$;

grant execute on function public.find_match(text) to authenticated;

-- ---------------------------------------------------------------------------
-- nav_summary — everything <Nav /> needs in one round trip instead of three
-- (profile lookup + unread_summary + a pending-challenge count). The nav
-- renders on every signed-in page, so those round trips were being paid on
-- every single navigation.
-- ---------------------------------------------------------------------------
create or replace function public.nav_summary()
returns table (username text, unread integer, pending_challenges integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.username,
    coalesce((
      select count(*)::integer
      from public.channel_members cm
      join public.messages m on m.channel_id = cm.channel_id
      where cm.user_id = p.id
        and m.created_at > cm.last_read_at
        and coalesce(m.author_id, '00000000-0000-0000-0000-000000000000'::uuid) <> cm.user_id
    ), 0),
    coalesce((
      select count(*)::integer
      from public.challenges c
      where c.opponent = p.id and c.status = 'pending'
    ), 0)
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.nav_summary() to authenticated;

-- Supporting index for the unread count above.
create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);
