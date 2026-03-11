import { NextResponse } from "next/server";
import { restInsert, restSelect } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const updates = await restSelect<{
      user_id: string;
      latitude: number;
      longitude: number;
      created_at: string;
      accuracy_meters: number | null;
    }>("location_updates", {
      select: "user_id,latitude,longitude,created_at,accuracy_meters",
      eq: { game_id: gameId },
      order: "created_at",
      ascending: false,
      limit: 100
    });

    return NextResponse.json({ updates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch locations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const payload: Record<string, unknown> = {
      game_id: body.gameId,
      user_id: body.userId,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy_meters: body.accuracyMeters ?? null,
      encrypted_payload: body.encryptedPayload ?? null
    };

    if (body.timestamp) {
      payload.created_at = body.timestamp;
    }

    const update = await restInsert("location_updates", payload);

    return NextResponse.json({ update });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save location" }, { status: 500 });
  }
}
