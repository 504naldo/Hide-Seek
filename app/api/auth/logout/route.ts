import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({ name: "hs-access-token", value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  response.cookies.set({ name: "hs-refresh-token", value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });

  return response;
}
