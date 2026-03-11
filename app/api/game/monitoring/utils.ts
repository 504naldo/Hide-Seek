import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { restSelect } from "@/lib/supabase";

export async function assertHostMonitoringAccess(request: Request) {
  const auth = await resolveAuthenticatedUser(request);
  const authenticatedUserId = auth.userId;
  if (!authenticatedUserId) {
    const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    applySessionCookies(unauthorized, auth);
    return { errorResponse: unauthorized };
  }

  const url = new URL(request.url);
  const gameId = String(url.searchParams.get("gameId") ?? "").trim();
  if (!gameId) {
    const badRequest = NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    applySessionCookies(badRequest, auth);
    return { errorResponse: badRequest };
  }

  const games = await restSelect<{ id: string; host_user_id: string | null; status: string }>("games", {
    select: "id,host_user_id,status",
    eq: { id: gameId },
    limit: 1
  });
  const game = games[0];
  if (!game) {
    const notFound = NextResponse.json({ error: "Game not found" }, { status: 404 });
    applySessionCookies(notFound, auth);
    return { errorResponse: notFound };
  }

  if (game.host_user_id !== authenticatedUserId) {
    const forbidden = NextResponse.json({ error: "Host-only action" }, { status: 403 });
    applySessionCookies(forbidden, auth);
    return { errorResponse: forbidden };
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 20;

  return { gameId, limit, gameStatus: game.status, authenticatedUserId, auth };
}
