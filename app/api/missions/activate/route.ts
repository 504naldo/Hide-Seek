import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Direct mission activation is deprecated. Complete mission to earn reward, then activate via /api/rewards/activate."
    },
    { status: 410 }
  );
}
