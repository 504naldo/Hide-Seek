import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${label}`);
  }
  return value;
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey || rest.length === 0) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

interface SupabaseUserResponse {
  id: string;
}

interface RefreshResponse {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string };
}

export interface SessionAuthResult {
  userId: string | null;
  accessToken?: string;
  refreshToken?: string;
  clearCookies?: boolean;
}

async function fetchSupabaseUser(accessToken: string): Promise<SupabaseUserResponse | null> {
  const response = await fetch(`${requireValue(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      apikey: requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) return null;
  return (await response.json()) as SupabaseUserResponse;
}

async function refreshSupabaseSession(refreshToken: string): Promise<RefreshResponse | null> {
  const response = await fetch(`${requireValue(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) return null;
  return (await response.json()) as RefreshResponse;
}

export async function resolveAuthenticatedUser(request: Request): Promise<SessionAuthResult> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const accessToken = cookies["hs-access-token"] ?? null;
  const refreshToken = cookies["hs-refresh-token"] ?? null;

  if (accessToken) {
    const user = await fetchSupabaseUser(accessToken);
    if (user?.id) {
      return { userId: user.id };
    }
  }

  if (!refreshToken) {
    return { userId: null, clearCookies: !!accessToken };
  }

  const refreshed = await refreshSupabaseSession(refreshToken);
  const nextAccess = refreshed?.access_token ?? null;
  const nextRefresh = refreshed?.refresh_token ?? null;

  if (!nextAccess || !nextRefresh) {
    return { userId: null, clearCookies: true };
  }

  const refreshedUser = await fetchSupabaseUser(nextAccess);
  if (!refreshedUser?.id) {
    return { userId: null, clearCookies: true };
  }

  return {
    userId: refreshedUser.id,
    accessToken: nextAccess,
    refreshToken: nextRefresh
  };
}

export function applySessionCookies(response: NextResponse, auth: SessionAuthResult) {
  const secure = process.env.NODE_ENV === "production";

  if (auth.clearCookies) {
    response.cookies.set({ name: "hs-access-token", value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    response.cookies.set({ name: "hs-refresh-token", value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    return;
  }

  if (auth.accessToken && auth.refreshToken) {
    response.cookies.set({
      name: "hs-access-token",
      value: auth.accessToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    response.cookies.set({
      name: "hs-refresh-token",
      value: auth.refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }
}
