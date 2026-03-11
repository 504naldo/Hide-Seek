import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { CaptureRecord } from "@/lib/types";
import { assertHostMonitoringAccess } from "../utils";
import { applySessionCookies } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const auth = await assertHostMonitoringAccess(request);
    if ("errorResponse" in auth) return auth.errorResponse;

    const captures = await restSelect<CaptureRecord>("captures", {
      select: "id,game_id,seeker_user_id,hider_user_id,capture_distance_meters,hold_time_seconds,captured_at",
      eq: { game_id: auth.gameId },
      order: "captured_at",
      ascending: false,
      limit: auth.limit
    });

    const response = NextResponse.json({ gameStatus: auth.gameStatus, captures });
    applySessionCookies(response, auth.auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch captures" }, { status: 500 });
  }
}
