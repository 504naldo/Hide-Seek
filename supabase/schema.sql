create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  avatar_url text,
  auth_provider text not null check (auth_provider in ('email','google','apple')),
  age_confirmed boolean default false,
  created_at timestamptz default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid references users(id) on delete set null,
  name text not null,
  city text not null,
  invite_code text unique not null,
  boundary_geojson jsonb not null,
  duration_minutes integer not null,
  reveal_interval_minutes integer not null default 30,
  capture_radius_meters integer not null default 50,
  capture_max_valid_accuracy_meters numeric,
  capture_stale_window_ms integer,
  capture_hold_window_seconds integer,
  capture_min_valid_samples integer,
  capture_suspicious_speed_mps numeric,
  capture_impossible_speed_mps numeric,
  capture_max_pair_time_delta_ms integer,
  challenge_difficulty text not null default 'medium',
  transport_rules text,
  status text not null default 'pending' check (status in ('pending','active','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('hider','seeker','spectator')),
  team text,
  is_captured boolean not null default false,
  joined_at timestamptz default now(),
  unique (game_id, user_id)
);

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  title text not null,
  description text,
  mission_type text not null,
  reward_type text not null,
  reward_value jsonb,
  reward_definition jsonb,
  difficulty text not null,
  geofence jsonb,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists mission_completions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  proof_url text,
  verified boolean default false,
  completed_at timestamptz default now(),
  unique (mission_id, user_id)
);

create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  seeker_user_id uuid not null references users(id) on delete cascade,
  hider_user_id uuid not null references users(id) on delete cascade,
  capture_distance_meters numeric,
  hold_time_seconds integer,
  captured_at timestamptz default now()
);

create table if not exists location_updates (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters numeric,
  encrypted_payload text,
  created_at timestamptz default now()
);

create table if not exists clues (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  target_user_id uuid not null references users(id) on delete cascade,
  clue_type text not null,
  clue_value text not null,
  visible_to_role text,
  revealed_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  channel text not null,
  sender_user_id uuid references users(id) on delete set null,
  message text not null,
  created_at timestamptz default now()
);

create table if not exists leaderboard_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references users(id) on delete cascade,
  distance_km numeric not null default 0,
  missions_completed integer not null default 0,
  longest_survival_minutes integer not null default 0,
  captures integer not null default 0,
  unique (game_id, player_id)
);

create table if not exists capture_audit_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  seeker_user_id uuid not null references users(id) on delete cascade,
  hider_user_id uuid not null references users(id) on delete cascade,
  decision text not null check (decision in ('captured','denied')),
  denied_reasons jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create table if not exists suspicious_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  seeker_user_id uuid references users(id) on delete set null,
  hider_user_id uuid references users(id) on delete set null,
  event_type text not null,
  reasons jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists safe_zones (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  geometry jsonb not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists mission_zones (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  title text not null,
  description text,
  geometry jsonb not null,
  reward_metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


alter table missions add column if not exists reward_definition jsonb;

create table if not exists mission_reward_activations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions(id) on delete set null,
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reward_type text not null check (reward_type in ('radar_ping','ghost_mode','speed_boost','false_signal')),
  role_suitability text not null check (role_suitability in ('hider','seeker','both')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  label text,
  description text,
  created_at timestamptz default now()
);

create index if not exists mission_reward_activations_game_idx on mission_reward_activations(game_id, expires_at desc);
create index if not exists mission_reward_activations_user_idx on mission_reward_activations(user_id, expires_at desc);


create table if not exists player_rewards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reward_type text not null check (reward_type in ('radar_ping','ghost_mode','speed_boost','false_signal')),
  metadata_json jsonb not null default '{}'::jsonb,
  earned_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists player_rewards_user_game_idx on player_rewards(user_id, game_id, earned_at desc);


create table if not exists player_reward_cooldowns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reward_type text not null check (reward_type in ('radar_ping','ghost_mode','speed_boost','false_signal')),
  last_activated_at timestamptz not null,
  cooldown_ends_at timestamptz not null,
  created_at timestamptz default now(),
  unique (game_id, user_id, reward_type)
);

create index if not exists player_reward_cooldowns_lookup_idx on player_reward_cooldowns(game_id, user_id, reward_type, cooldown_ends_at desc);
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs


-- RLS helpers
create or replace function public.is_game_participant(target_game_id uuid)
returns boolean
language sql
stable
<<<<<<< ours
as $$
  select exists (
    select 1
    from game_players gp
=======
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_players gp
>>>>>>> theirs
    where gp.game_id = target_game_id
      and gp.user_id = auth.uid()
  );
$$;

create or replace function public.is_game_host(target_game_id uuid)
returns boolean
language sql
stable
<<<<<<< ours
as $$
  select exists (
    select 1
    from games g
=======
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
>>>>>>> theirs
    where g.id = target_game_id
      and g.host_user_id = auth.uid()
  );
$$;


-- Enable RLS on gameplay tables
alter table users enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table location_updates enable row level security;
alter table chat_messages enable row level security;
alter table player_rewards enable row level security;
alter table player_reward_cooldowns enable row level security;
alter table push_subscriptions enable row level security;
alter table safe_zones enable row level security;
alter table mission_zones enable row level security;
alter table mission_reward_activations enable row level security;


-- users: own profile row only
drop policy if exists users_select_own on users;
create policy users_select_own
  on users
  for select
  using (id = auth.uid());

drop policy if exists users_update_own on users;
create policy users_update_own
  on users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());


-- games: participants/host can read, host can update host-owned game config
drop policy if exists games_select_participant on games;
create policy games_select_participant
  on games
  for select
  using (is_game_participant(id) or host_user_id = auth.uid());

drop policy if exists games_update_host on games;
create policy games_update_host
  on games
  for update
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());


-- game_players: players can read membership for their games
drop policy if exists game_players_select_participant_game on game_players;
create policy game_players_select_participant_game
  on game_players
  for select
  using (is_game_participant(game_id));


-- location updates: players can read/write only their own updates
drop policy if exists location_updates_select_own on location_updates;
create policy location_updates_select_own
  on location_updates
  for select
  using (user_id = auth.uid());

drop policy if exists location_updates_insert_own on location_updates;
create policy location_updates_insert_own
  on location_updates
  for insert
  with check (user_id = auth.uid() and is_game_participant(game_id));

drop policy if exists location_updates_update_own on location_updates;
create policy location_updates_update_own
  on location_updates
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists location_updates_delete_own on location_updates;
create policy location_updates_delete_own
  on location_updates
  for delete
  using (user_id = auth.uid());


-- chat: participants can read/write chat for games they belong to
drop policy if exists chat_messages_select_participant on chat_messages;
create policy chat_messages_select_participant
  on chat_messages
  for select
  using (is_game_participant(game_id));

drop policy if exists chat_messages_insert_participant on chat_messages;
create policy chat_messages_insert_participant
  on chat_messages
  for insert
  with check (sender_user_id = auth.uid() and is_game_participant(game_id));

drop policy if exists chat_messages_update_sender on chat_messages;
create policy chat_messages_update_sender
  on chat_messages
  for update
  using (sender_user_id = auth.uid() and is_game_participant(game_id))
  with check (sender_user_id = auth.uid() and is_game_participant(game_id));

drop policy if exists chat_messages_delete_sender on chat_messages;
create policy chat_messages_delete_sender
  on chat_messages
  for delete
  using (sender_user_id = auth.uid() and is_game_participant(game_id));


-- rewards/cooldowns: players can read their own reward state
drop policy if exists player_rewards_select_own on player_rewards;
create policy player_rewards_select_own
  on player_rewards
  for select
  using (user_id = auth.uid());

drop policy if exists player_reward_cooldowns_select_own on player_reward_cooldowns;
create policy player_reward_cooldowns_select_own
  on player_reward_cooldowns
  for select
  using (user_id = auth.uid());


-- push subscriptions: owner-managed only
drop policy if exists push_subscriptions_select_own on push_subscriptions;
create policy push_subscriptions_select_own
  on push_subscriptions
  for select
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on push_subscriptions;
create policy push_subscriptions_insert_own
  on push_subscriptions
  for insert
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on push_subscriptions;
create policy push_subscriptions_update_own
  on push_subscriptions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on push_subscriptions;
create policy push_subscriptions_delete_own
  on push_subscriptions
  for delete
  using (user_id = auth.uid());


-- zones: participants can read, hosts can manage for games they host
drop policy if exists safe_zones_select_participant on safe_zones;
create policy safe_zones_select_participant
  on safe_zones
  for select
  using (is_game_participant(game_id));

drop policy if exists safe_zones_manage_host on safe_zones;
create policy safe_zones_manage_host
  on safe_zones
  for all
  using (is_game_host(game_id))
  with check (is_game_host(game_id));

drop policy if exists mission_zones_select_participant on mission_zones;
create policy mission_zones_select_participant
  on mission_zones
  for select
  using (is_game_participant(game_id));

drop policy if exists mission_zones_manage_host on mission_zones;
create policy mission_zones_manage_host
  on mission_zones
  for all
  using (is_game_host(game_id))
  with check (is_game_host(game_id));


-- mission reward activations: readable by relevant game participants/host
drop policy if exists mission_reward_activations_select_participants on mission_reward_activations;
create policy mission_reward_activations_select_participants
  on mission_reward_activations
  for select
  using (is_game_participant(game_id) or is_game_host(game_id));
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
