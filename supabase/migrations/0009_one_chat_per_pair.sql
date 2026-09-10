-- NU Ping Pong — one chat per pair of players.
--
-- Bug: open_match_channel always created a new channel, so every accepted
-- challenge, every hall pairing and every "Join" against the same person
-- opened another thread. Play someone three times and you had three chats
-- with them, each holding a fragment of the conversation.
--
-- open_direct_channel (the Chat button, added in 0007) already reused an
-- existing thread. This makes every path do the same, through one shared
-- lookup, and folds away the duplicated creation logic while it's here.
--
-- Additive on top of 0008. Existing duplicate channels are left alone — see
-- the note at the bottom for tidying them up if you want to.

-- ---------------------------------------------------------------------------
-- channel_between — the existing two-person channel for this pair, or null.
--
-- "Exactly two members, and both of them are these two." Counting members
-- matters: without it a future group channel containing both players would
-- match and their private messages would land in it.
-- ---------------------------------------------------------------------------
create or replace function public.channel_between(p_a uuid, p_b uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select cm.channel_id
  from public.channel_members cm
  join public.channel_members other
    on other.channel_id = cm.channel_id and other.user_id = p_b
  where cm.user_id = p_a
    and (
      select count(*) from public.channel_members x where x.channel_id = cm.channel_id
    ) = 2
  order by cm.channel_id
  limit 1;
$$;

grant execute on function public.channel_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_channel_between — the one place a two-person channel is made.
-- ---------------------------------------------------------------------------
create or replace function public.create_channel_between(
  p_a uuid,
  p_b uuid,
  p_opening text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  name_a text;
  name_b text;
begin
  select coalesce(full_name, '@' || username) into name_a from public.profiles where id = p_a;
  select coalesce(full_name, '@' || username) into name_b from public.profiles where id = p_b;

  insert into public.channels (kind, title)
  values ('match', coalesce(name_a, 'Player') || ' & ' || coalesce(name_b, 'Player'))
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, p_a), (v_channel_id, p_b);

  insert into public.messages (channel_id, author_id, body, kind)
  values (v_channel_id, null, p_opening, 'system');

  return v_channel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- open_match_channel — reuse the pair's thread, or start it.
--
-- On reuse it still posts a system line. Accepting a challenge has to show
-- something happened; silently dropping you into an old thread with no new
-- content looks like the button did nothing.
-- ---------------------------------------------------------------------------
create or replace function public.open_match_channel(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  v_channel_id := public.channel_between(p_a, p_b);

  if v_channel_id is not null then
    insert into public.messages (channel_id, author_id, body, kind)
    values (
      v_channel_id,
      null,
      'You''re matched again. Sort out a time and a table here, then log the score afterwards.',
      'system'
    );
    return v_channel_id;
  end if;

  return public.create_channel_between(
    p_a,
    p_b,
    'You two are matched! Sort out a time and a table here. '
      || 'When you''re done playing, one of you logs the score and the other confirms it.'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- open_direct_channel — same lookup, no extra system line on reuse: opening
-- an existing chat to say hello shouldn't announce itself.
-- ---------------------------------------------------------------------------
create or replace function public.open_direct_channel(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to start a chat.';
  end if;
  if p_other = v_me then
    raise exception 'You can''t message yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'That player no longer exists.';
  end if;
  if public.is_blocked_pair(v_me, p_other) then
    -- Deliberately vague: don't confirm to a blocked player that they were.
    raise exception 'You can''t start a chat with that player.';
  end if;

  v_channel_id := public.channel_between(v_me, p_other);
  if v_channel_id is not null then
    return v_channel_id;
  end if;

  return public.create_channel_between(
    v_me,
    p_other,
    'Say hello. When you two play, one of you logs the score and the other confirms it.'
  );
end;
$$;

grant execute on function public.open_direct_channel(uuid) to authenticated;

-- Superseded by create_channel_between.
drop function if exists public.open_direct_channel_create(uuid, uuid);

-- ---------------------------------------------------------------------------
-- Tidying up duplicates this bug already created
--
-- Nothing is merged automatically: messages would have to be moved between
-- channels and read markers reconciled, and getting that wrong loses
-- conversation. Run this to see whether you have any:
--
--   select least(a.user_id, b.user_id) as p1,
--          greatest(a.user_id, b.user_id) as p2,
--          count(*) as channels
--   from public.channel_members a
--   join public.channel_members b
--     on b.channel_id = a.channel_id and b.user_id > a.user_id
--   group by 1, 2
--   having count(*) > 1;
--
-- From here on each pair gets one thread, so any duplicates are from before
-- this migration. If they're only test data, delete the extra channel ids
-- (messages and memberships cascade):
--
--   delete from public.channels where id = 'the-duplicate-channel-id';
-- ---------------------------------------------------------------------------
