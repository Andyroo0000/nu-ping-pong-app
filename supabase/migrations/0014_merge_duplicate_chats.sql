-- NU Ping Pong — merge the duplicate chats 0009 left behind, and make a
-- duplicate impossible from here on.
--
-- Additive on top of 0013. Safe to run more than once: the second run finds
-- nothing to merge and changes nothing.
--
-- ---------------------------------------------------------------------------
-- Why there are still duplicates
--
-- 0009 fixed the cause — every path that opens a two-person chat now goes
-- through channel_between first — but it deliberately left the threads the
-- bug had already created, because merging conversation is the kind of thing
-- you want to look at before you run it. This is that step.
--
-- Nothing is deleted until its contents have been moved. Messages, and any
-- challenge or report pointing at the old thread, are repointed at the
-- thread being kept; only then is the empty shell dropped. So the merged
-- chat holds the full history of every duplicate, in time order, which is
-- what it would have looked like had the bug never existed.
--
-- The thread kept is the OLDEST of each pair's duplicates. Messages sort by
-- their own timestamp, so which shell survives doesn't affect the reading
-- order — but keeping the oldest means the chat someone has had open longest
-- is the one that stays, and its title is the pair's original one.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Part 1 — the merge
-- ---------------------------------------------------------------------------

-- Every two-person channel, tagged with its normalised pair, then everything
-- in each pair that isn't the keeper. Exactly two members is the same test
-- channel_between uses: a future group channel containing both players is
-- not a duplicate of their private chat and must not be folded into it.
-- Dropped explicitly at the end rather than with `on commit drop`, because
-- that depends on whether the SQL editor wraps the script in one transaction
-- — and if it doesn't, the table would vanish before the next statement.
drop table if exists dupe_channels;

create temporary table dupe_channels as
with pair_channels as (
  select
    c.id as channel_id,
    c.created_at,
    a.user_id as p1,
    b.user_id as p2
  from public.channels c
  join public.channel_members a on a.channel_id = c.id
  join public.channel_members b on b.channel_id = c.id and b.user_id > a.user_id
  where c.kind = 'match'
    and (select count(*) from public.channel_members m where m.channel_id = c.id) = 2
),
ranked as (
  select
    channel_id,
    p1,
    p2,
    first_value(channel_id) over (
      partition by p1, p2
      order by created_at, channel_id
    ) as keeper
  from pair_channels
)
select channel_id, keeper, p1, p2
from ranked
where channel_id <> keeper;

-- Read markers first, while the old memberships still exist.
--
-- The earliest marker in the group wins. Taking the latest would be tidier
-- for the unread badge, but it can mark a message someone never saw as read,
-- and a message that quietly vanishes from the badge is worse than a badge
-- that's briefly too high. So it errs toward showing: some already-read
-- messages may count as unread once, until the chat is opened.
update public.channel_members k
set last_read_at = least(k.last_read_at, src.earliest)
from (
  select d.keeper, m.user_id, min(m.last_read_at) as earliest
  from dupe_channels d
  join public.channel_members m on m.channel_id = d.channel_id
  group by d.keeper, m.user_id
) src
where k.channel_id = src.keeper
  and k.user_id = src.user_id;

-- The conversation itself.
update public.messages m
set channel_id = d.keeper
from dupe_channels d
where m.channel_id = d.channel_id;

-- Anything else that points at a thread. Both are `on delete set null`, so
-- skipping these wouldn't break the delete — it would just silently lose the
-- link from a challenge or a report back to the conversation behind it.
update public.challenges c
set channel_id = d.keeper
from dupe_channels d
where c.channel_id = d.channel_id;

update public.reports r
set channel_id = d.keeper
from dupe_channels d
where r.channel_id = d.channel_id;

-- Now empty of everything except their memberships, which cascade.
delete from public.channels c
using dupe_channels d
where c.id = d.channel_id;

-- Chat lists sort on last_message_at, so the keeper has to inherit the
-- newest message it just absorbed or a merged chat sinks to the bottom.
update public.channels c
set last_message_at = coalesce(
  (select max(m.created_at) from public.messages m where m.channel_id = c.id),
  c.created_at
)
where c.id in (select distinct keeper from dupe_channels);

drop table dupe_channels;

-- ---------------------------------------------------------------------------
-- Part 2 — make it structural
--
-- 0009 put the reuse check in the callers. That's correct but it isn't a
-- guarantee: it holds only as long as every future caller remembers to look
-- first, and it has a race — two people accepting each other's challenge in
-- the same second both find nothing and both insert.
--
-- Moving the check inside create_channel_between makes the guarantee belong
-- to the one function that can create a pair channel at all. The advisory
-- lock is what closes the race: it's taken on the pair, so concurrent opens
-- for the same two people queue up and the second one finds the first one's
-- channel. It's transaction-scoped, so it releases on its own, and it only
-- ever blocks the same pair — two unrelated pairings don't wait on each
-- other.
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
  -- Order the pair so both players hash to the same lock.
  perform pg_advisory_xact_lock(
    hashtextextended(least(p_a, p_b)::text || '/' || greatest(p_a, p_b)::text, 0)
  );

  -- Re-check under the lock. A caller that already looked will find nothing
  -- here; one racing another pairing for the same pair finds their channel.
  v_channel_id := public.channel_between(p_a, p_b);
  if v_channel_id is not null then
    return v_channel_id;
  end if;

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
-- Check it worked. Both should come back empty.
--
--   -- pairs with more than one thread. The member count matters: without it
--   -- any group channel containing both players counts as a thread of theirs
--   -- and the query reports duplicates that aren't there.
--   select a.user_id as p1, b.user_id as p2, count(*) as threads
--   from public.channel_members a
--   join public.channel_members b
--     on b.channel_id = a.channel_id and b.user_id > a.user_id
--   where (
--     select count(*) from public.channel_members m where m.channel_id = a.channel_id
--   ) = 2
--   group by 1, 2
--   having count(*) > 1;
--
--   -- channels left holding nothing
--   select id, title from public.channels c
--   where not exists (select 1 from public.messages m where m.channel_id = c.id);
-- ---------------------------------------------------------------------------
