import { NextResponse } from "next/server";
import { handleLifecycleAction } from "../lifecycle-utils";

export async function POST(request: Request) {
  try {
    return await handleLifecycleAction(request, "end");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to end game" }, { status: 500 });
  }
}
