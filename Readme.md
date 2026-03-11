# Hide & Seek: Urban Ops PWA

Mobile-first Progressive Web App for real-world hide-and-seek strategy gameplay.

## What is implemented in this MVP
- Email signup/login via Supabase Auth REST API.
- Game host can create sessions and receive invite codes.
- Players can join by invite code.
- Active session lookup by user ID.
- Location updates stream via Supabase Realtime subscriptions with polling fallback.
- Chat message posting + fetching per game.
- Mission and leaderboard endpoints wired to Supabase tables.

## Tech stack
- Next.js 14 + React + TypeScript (strict mode)
- Supabase (Auth + Postgres)
- PWA manifest + installable metadata

## Environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN
NEXT_PUBLIC_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:you@example.com
```

> `SUPABASE_SERVICE_ROLE_KEY` is required for server route handlers and must never be exposed publicly.

## Database setup
1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.

## Local setup
```bash
npm install
npm run dev
```
App runs at `http://localhost:3000`.

## API routes
- `POST /api/auth` → `{ mode: "signup" | "login", email, password }` (sets HTTP-only session cookies when tokens are returned)
- `GET /api/auth/session` → resolve/refresh server session and return `{ authenticated, userId? }`
- `POST /api/auth/logout` → clear auth cookies
- `POST /api/push/subscription` → register/rotate user device push subscription
- `DELETE /api/push/subscription` → remove device push subscription
- `POST /api/game` → create game session
- `POST /api/game/join` → join by invite code
- `GET /api/game/active?userId=...` → fetch active game for user
- `POST /api/game/start` → host starts pending game
- `POST /api/game/pause` → host pauses active game
- `POST /api/game/resume` → host resumes paused game
- `POST /api/game/end` → host ends pending/active/paused game
- `GET /api/game/monitoring/suspicious?gameId=...&limit=...`
- `GET /api/game/monitoring/capture-audits?gameId=...&limit=...`
- `GET /api/game/monitoring/captures?gameId=...&limit=...`
- `GET /api/game/monitoring/player-activity?gameId=...&limit=...`
- `GET /api/locations?gameId=...` / `POST /api/locations`
- `GET /api/chat?gameId=...` / `POST /api/chat`
- `GET /api/missions?gameId=...` / `POST /api/missions`
- `GET /api/leaderboard?gameId=...`
- `GET /api/zones?gameId=...`
- `POST /api/zones/safe`
- `PATCH /api/zones/safe/:zoneId`
- `DELETE /api/zones/safe/:zoneId`
- `POST /api/zones/mission`
- `PATCH /api/zones/mission/:zoneId`
- `DELETE /api/zones/mission/:zoneId`

## Notes
- Google/Apple auth buttons remain in UI but provider setup must be enabled in Supabase first.
- Map rendering currently uses the map panel abstraction and location list, ready for direct Mapbox map integration.


## Mapbox setup
1. Create a Mapbox account and generate a public access token.
2. Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`.
3. Restart `npm run dev` after changing env vars.
4. Enable Realtime on `location_updates` in Supabase (Database → Replication) for instant marker updates.
5. Open `/game/[gameId]` to see player markers, safe zones, and game boundary overlays.


## Capture validation
- Per-game capture rule fields on `games` include: `capture_max_valid_accuracy_meters`, `capture_stale_window_ms`, `capture_radius_meters`, `capture_hold_window_seconds`, `capture_min_valid_samples`, `capture_suspicious_speed_mps`, `capture_impossible_speed_mps`, `capture_max_pair_time_delta_ms`.
- `POST /api/capture` performs server-authoritative checks using Supabase `location_updates` (no trusted client sample arrays).
- Capture/anti-cheat thresholds are resolved in `lib/capture-config.ts` from per-game `games` capture-rule columns with safe defaults when fields are null.
- Validation uses only capture-ready samples:
  - ignores poor GPS accuracy samples (`accuracy_meters > maxValidAccuracyMeters`)
  - ignores stale data outside freshness window
  - requires multiple recent valid samples inside capture radius during hold window
- Temporal alignment model:
  - seeker and hider histories are aligned by nearest timestamp pairing
  - only pairs within a configured max timestamp delta are evaluated
  - capture is approved only when enough aligned pairs are inside radius
- Anti-cheat protections deny captures on suspicious movement:
  - rejects impossible jumps based on distance/time
  - flags suspicious speed spikes
- Denied captures return structured `deniedReasons` such as `poor_accuracy`, `insufficient_samples`, `outside_radius`, `stale_data`, `suspicious_movement`, `impossible_jump`.
- Every evaluation is persisted to `capture_audit_logs` with decision, denial reasons, evaluation time, and summary metrics (sample counts, hold-window coverage, pair time delta, distance stats).
- Suspicious anti-cheat outcomes are additionally written to `suspicious_events` as structured events.


## Zone storage and map loading
- `safe_zones` table stores per-game safe areas with `name`, GeoJSON `geometry`, and optional `metadata`.
- `mission_zones` table stores per-game mission areas with `title`, optional `description`, GeoJSON `geometry`, optional `reward_metadata`, and optional `expires_at`.
- Game page fetches zones from `/api/zones?gameId=...`, converts GeoJSON into map overlays, and passes them to `MapPanel`.
- `MapPanel` keeps the existing Mapbox overlay approach and renders safe zones + mission zones from backend data.


## Zone CRUD permissions
- Zone create/update/delete endpoints are host-only and resolve the acting user from the server-side Supabase session using the HTTP-only `hs-access-token` cookie, then compare it against `games.host_user_id`.
- Unauthenticated zone CRUD requests return `401`; authenticated non-host users return `403`.
- `requesterUserId` is no longer trusted for authorization decisions.
- `safe_zones` CRUD supports Point/Polygon GeoJSON, `name`, and optional `metadata`.
- `mission_zones` CRUD supports Point/Polygon GeoJSON, `title`, optional `description`, optional `reward_metadata`, and optional `expires_at`.
- Existing `GET /api/zones?gameId=...` behavior is preserved for map loading.


## Host game lifecycle controls
- Host-only lifecycle routes resolve identity server-side via Supabase Auth using the HTTP-only session cookie.
- Lifecycle routes return `401` for unauthenticated requests and `403` for authenticated non-host users.
- Supported transitions:
  - `start`: `pending -> active`
  - `pause`: `active -> paused`
  - `resume`: `paused -> active`
  - `end`: `pending|active|paused -> ended`
- Invalid transitions return `400` and leave game state unchanged (for example, ended games cannot be resumed).


## Host monitoring routes
- Monitoring endpoints are host-only and use the HTTP-only session cookie for server-side Supabase identity checks.
- Authorization is verified server-side from Supabase session identity; unauthenticated requests return `401`, non-host authenticated requests return `403`.
- Routes:
  - `GET /api/game/monitoring/suspicious?gameId=...&limit=...` returns recent `suspicious_events`.
  - `GET /api/game/monitoring/capture-audits?gameId=...&limit=...` returns recent `capture_audit_logs` including denied reasons.
  - `GET /api/game/monitoring/captures?gameId=...&limit=...` returns recent successful captures.
  - `GET /api/game/monitoring/player-activity?gameId=...&limit=...` returns player last-location/last-chat/last-activity freshness summary.


## Zone editing and map authoring flow
- Host can edit existing safe zones and mission zones from the game page zone management cards.
- Safe zone edits support `name`, `metadata`, and geometry updates.
- Mission zone edits support `title`, `description`, `reward_metadata`, optional `expires_at`, and geometry updates.
- Map-based authoring supports:
  - click-to-create Point zones,
  - incremental Polygon drawing by tapping vertices,
  - selecting existing polygon vertices and dragging them to reshape geometry,
  - deleting the currently selected polygon vertex,
  - explicit polygon completion/re-open controls so hosts can clearly finish or continue draw mode,
  - geometry save through existing authenticated create/update endpoints.
- Supported geometry types remain `Point` and `Polygon`.


## Session auth model
- Login/signup keep `userId` in local storage for client UX helpers and set HTTP-only cookies for auth tokens: `hs-access-token` and `hs-refresh-token`.
- Protected route auth is server-side: request handlers read cookie tokens and resolve identity through Supabase Auth.
- If access token is expired and refresh token is still valid, server auth attempts refresh-token renewal and issues rotated cookies on successful authenticated responses.
- If refresh fails or tokens are invalid, auth utilities clear both cookies and protected endpoints return `401`.
- Host-protected routes (`/api/zones/*`, `/api/game/* lifecycle`, `/api/game/monitoring/*`) still return `403` for authenticated non-host users.
- `POST /api/auth/logout` clears both auth cookies and client `userId` should be cleared by UI.


## PWA install and offline behavior
- A service worker is registered client-side (`/sw.js`) and powers basic app-shell caching and installability prompts.
- Installability improvements:
  - app listens for `beforeinstallprompt` and shows an `Install UrbanOps` button when available,
  - app includes Apple web app capability metadata,
  - manifest keeps standalone mode and includes app scope/id metadata.

### Cached for offline use
- Core shell pages: `/`, `/login`, `/signup`, `/dashboard`, `/join`, `/missions`, `/stats`, `/chat`.
- Static PWA assets: `/manifest.webmanifest`, `/icon-192.svg`, `/icon-512.svg`.
- Runtime navigation responses and static assets (styles/scripts/images/fonts) are cached when fetched.
- Offline fallback page: `/offline.html` is served when navigation fails and no cached page is available.

### Network-only or network-preferred
- All `/api/*` requests remain network-only.
- Live game routes under `/game/*` remain network-only to avoid stale realtime/host-control behavior.
- Supabase realtime flows are unchanged and require network connectivity.


## Push notifications
- Web push is supported through the app service worker and VAPID keys.
- Client flow:
  - user taps **Enable Game Notifications** in-app,
  - browser permission prompt is shown,
  - push subscription is registered to `/api/push/subscription` for the authenticated user/device.
- Server flow:
  - subscriptions are stored in `push_subscriptions`,
  - push sends are triggered for key events: `game_started`, `game_paused`, `game_resumed`, `mission_available`, `capture_alert`, `game_ended`.
  - stale subscriptions are cleaned up when providers return `404/410`.

### Push notification limitations
- Push delivery requires valid VAPID keys configured in environment.
- Notifications are best-effort; browser/device settings and OS battery policies can delay or suppress delivery.
- Live map/realtime gameplay remains network-dependent; push does not replace realtime state sync.


## Closed-beta test flow
1. Testers sign up/login on mobile, then open **Join Game**.
2. Host creates a game and shares invite code.
3. Testers join by code and open game page.
4. On first game load, testers enable location permission and notification opt-in.
5. Host completes the preflight checklist (invite shared, roles checked, location ready, notification prompt done).
6. Host starts match and monitors suspicious/capture/player-activity panels.
7. Use missions/chat/map during play; game lifecycle controls manage pauses/resume/end.

### Beta readiness UX additions
- Join page includes a guided onboarding checklist for new testers.
- Game page includes playtest onboarding tips and host preflight checklist gating the start action.
- Dashboard includes a quick tester checklist and clearer empty-state guidance.


## Tactical mission rewards (MVP)
- Missions now expose structured `reward_definition` data with:
  - `reward_type` (`radar_ping`, `ghost_mode`, `speed_boost`, `false_signal`),
  - `role_suitability` (`hider` | `seeker` | `both`),
  - `duration_seconds`, optional `usable_until`,
  - effect `metadata`, and optional `label`/`description`.
- Backward compatibility: older missions with only `reward_type`/`reward_value` are normalized to safe defaults server-side.

### Activation and active-state model
- Rewards now activate from inventory via `POST /api/rewards/activate` (mission completion only grants inventory items).
- Active effects are stored in `mission_reward_activations` with:
  - owner (`user_id`),
  - `started_at` and `expires_at`,
  - normalized effect metadata for runtime behavior.
- Current active effects are available at `GET /api/missions/active?gameId=...` and are used by map/runtime logic.

### Implemented runtime behavior
- `radar_ping` (seeker): temporarily improves hider clue precision (still approximate; no exact coordinate reveal).
- `ghost_mode` (hider): freezes seeker-visible hider position using stored frozen coordinates during active window.
- `speed_boost` (both): temporarily scales capture anti-cheat suspicious/impossible movement thresholds for active users.
- `false_signal` (primarily hider): spawns temporary decoy clue markers visible to seekers; decoys expire cleanly.

### Current limitations
- Rewards are duration-based with simple activation; no cooldown stack or advanced inventory/economy yet.
- Decoys/freeze are map-level tactical effects and intentionally approximate for fairness.
- Mission completion verification is still MVP-level and reward activation is currently explicit via mission UI action.


## Reward inventory and cooldown model
- Mission completion now grants rewards into persistent `player_rewards` inventory instead of auto-activating effects.
- New `player_rewards` fields: `game_id`, `user_id`, `reward_type`, `metadata_json`, `earned_at`, `used_at`, `expires_at`.
- Mission completion endpoint: `POST /api/missions/complete` grants one reward per mission completion and records completion.
- Inventory endpoint: `GET /api/rewards/inventory?gameId=...` returns earned rewards for authenticated player.
- Activation endpoint: `POST /api/rewards/activate` activates a reward from inventory (single-use) and creates active runtime effect.

### Abuse prevention and cooldown
- A player cannot activate the same reward type while one of that type is still active.
- Inventory rewards respect `expires_at`; expired rewards cannot be activated.
- Activation still uses bounded duration/metadata validation from centralized `lib/rewards.ts`.

### UI behavior
- Missions page now supports:
  - completing missions to earn rewards,
  - displaying earned rewards in inventory,
  - activating rewards from inventory.
- Existing tactical effects (`radar_ping`, `ghost_mode`, `speed_boost`, `false_signal`) remain unchanged at runtime.


### Cooldowns and inventory balancing
- After a reward is activated and its active duration ends, a cooldown timer is enforced per player + reward type via `player_reward_cooldowns`.
- During cooldown, the same reward type cannot be activated again even if another inventory item exists.
- Inventory balancing rules are resolved from centralized reward metadata defaults (`lib/rewards.ts`):
  - `max_inventory_size` (default 8)
  - `max_duplicates_per_type` (default 3)
  - `cooldown_seconds` (default 60)
- Mission completion checks these limits before granting a new inventory reward.
- Missions UI now shows active rewards, cooldowns, and per-item unavailable activation reason.
