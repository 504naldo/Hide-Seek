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
