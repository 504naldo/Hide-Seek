import { NextResponse } from "next/server";
import { handleLifecycleAction } from "../lifecycle-utils";

export async function POST(request: Request) {
  try {
    return await handleLifecycleAction(request, "pause");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to pause game" }, { status: 500 });
  }
}
