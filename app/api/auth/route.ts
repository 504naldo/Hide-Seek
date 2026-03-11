import { NextResponse } from "next/server";
import { authSignIn, authSignUp } from "@/lib/supabase";

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string };
  session?: {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string };
  };
}

function tokensFromAuthResponse(data: AuthResponse): { accessToken: string | null; refreshToken: string | null } {
  return {
    accessToken: data.access_token ?? data.session?.access_token ?? null,
    refreshToken: data.refresh_token ?? data.session?.refresh_token ?? null
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { mode, email, password } = payload as { mode: "signup" | "login"; email: string; password: string };

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const data = (mode === "signup" ? await authSignUp(email, password) : await authSignIn(email, password)) as AuthResponse;

    const response = NextResponse.json({ mode, data });
    const { accessToken, refreshToken } = tokensFromAuthResponse(data);

    if (accessToken) {
      response.cookies.set({
        name: "hs-access-token",
        value: accessToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
      });
    }

    if (refreshToken) {
      response.cookies.set({
        name: "hs-refresh-token",
        value: refreshToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication failed." }, { status: 500 });
  }
}
