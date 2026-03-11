import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { SuspiciousEventRecord } from "@/lib/types";
import { assertHostMonitoringAccess } from "../utils";
import { applySessionCookies } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const auth = await assertHostMonitoringAccess(request);
    if ("errorResponse" in auth) return auth.errorResponse;

    const events = await restSelect<SuspiciousEventRecord>("suspicious_events", {
      select: "id,game_id,seeker_user_id,hider_user_id,event_type,reasons,metrics,created_at",
      eq: { game_id: auth.gameId },
      order: "created_at",
      ascending: false,
      limit: auth.limit
    });

    const response = NextResponse.json({ gameStatus: auth.gameStatus, events });
    applySessionCookies(response, auth.auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch suspicious events" }, { status: 500 });
  }
}
