import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { CaptureAuditLogRecord } from "@/lib/types";
import { assertHostMonitoringAccess } from "../utils";
import { applySessionCookies } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const auth = await assertHostMonitoringAccess(request);
    if ("errorResponse" in auth) return auth.errorResponse;

    const audits = await restSelect<CaptureAuditLogRecord>("capture_audit_logs", {
      select: "id,game_id,seeker_user_id,hider_user_id,decision,denied_reasons,metrics,evaluated_at",
      eq: { game_id: auth.gameId },
      order: "evaluated_at",
      ascending: false,
      limit: auth.limit
    });

    const response = NextResponse.json({ gameStatus: auth.gameStatus, audits });
    applySessionCookies(response, auth.auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch capture audits" }, { status: 500 });
  }
}
