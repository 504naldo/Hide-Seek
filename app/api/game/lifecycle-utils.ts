import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { restSelect, restUpdate } from "@/lib/supabase";
import { canTransitionGameStatus, GameLifecycleAction, getNextGameStatus } from "@/lib/game-lifecycle";
import { GameRecord } from "@/lib/types";
import { sendPushToGamePlayers } from "@/lib/push";

export async function handleLifecycleAction(request: Request, action: GameLifecycleAction) {
  const auth = await resolveAuthenticatedUser(request);
  const authenticatedUserId = auth.userId;
  if (!authenticatedUserId) {
    const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    applySessionCookies(unauthorized, auth);
    return unauthorized;
  }

  const body = await request.json();
  const gameId = String(body.gameId ?? "").trim();
  if (!gameId) {
    const badRequest = NextResponse.json({ error: "gameId is required" }, { status: 400 });
    applySessionCookies(badRequest, auth);
    return badRequest;
  }

  const games = await restSelect<GameRecord>("games", {
    select: "id,host_user_id,status,starts_at,ends_at",
    eq: { id: gameId },
    limit: 1
  });

  const game = games[0];
  if (!game) {
    const notFound = NextResponse.json({ error: "Game not found" }, { status: 404 });
    applySessionCookies(notFound, auth);
    return notFound;
  }

  if (game.host_user_id !== authenticatedUserId) {
    const forbidden = NextResponse.json({ error: "Host-only action" }, { status: 403 });
    applySessionCookies(forbidden, auth);
    return forbidden;
  }

  if (!canTransitionGameStatus(game.status, action)) {
    const invalid = NextResponse.json({
      error: `Invalid transition from ${game.status} using ${action}`,
      game
    }, { status: 400 });
    applySessionCookies(invalid, auth);
    return invalid;
  }

  const nextStatus = getNextGameStatus(action);
  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = { status: nextStatus };

  if (action === "start" && !game.starts_at) updates.starts_at = nowIso;
  if (action === "end") updates.ends_at = nowIso;

  const updated = await restUpdate<GameRecord>("games", updates, { id: gameId });

  const actionMessage: Record<GameLifecycleAction, { title: string; body: string; eventType: string }> = {
    start: { title: "Game Started", body: "The host has started the game.", eventType: "game_started" },
    pause: { title: "Game Paused", body: "The host has paused the game.", eventType: "game_paused" },
    resume: { title: "Game Resumed", body: "The host resumed the game.", eventType: "game_resumed" },
    end: { title: "Game Ended", body: "The game has ended.", eventType: "game_ended" }
  };
  void sendPushToGamePlayers({ gameId, ...actionMessage[action] });

  const response = NextResponse.json({ game: updated ?? { ...game, ...updates } });
  applySessionCookies(response, auth);
  return response;
}
