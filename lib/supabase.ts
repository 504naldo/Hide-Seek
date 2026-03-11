const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${label}`);
  }
  return value;
}

interface QueryOptions {
  select?: string;
  order?: string;
  ascending?: boolean;
  limit?: number;
  eq?: Record<string, string | number | boolean>;
}

function buildRestUrl(path: string, query: QueryOptions = {}): string {
  const url = new URL(path, `${requireValue(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/`);

  if (query.select) url.searchParams.set("select", query.select);
  if (query.limit) url.searchParams.set("limit", String(query.limit));
  if (query.order) {
    const direction = query.ascending ? "asc" : "desc";
    url.searchParams.set("order", `${query.order}.${direction}`);
  }

  if (query.eq) {
    Object.entries(query.eq).forEach(([key, value]) => {
      url.searchParams.set(key, `eq.${value}`);
    });
  }

  return url.toString();
}

function serviceHeaders(extra: HeadersInit = {}): HeadersInit {
  const key = requireValue(supabaseServiceRole, "SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export async function restSelect<T>(table: string, query?: QueryOptions): Promise<T[]> {
  const response = await fetch(buildRestUrl(table, query), {
    headers: serviceHeaders()
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T[]>;
}

export async function restInsert<T>(table: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(buildRestUrl(table), {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = (await response.json()) as T[];
  return rows[0];
}

export async function restUpdate<T>(
  table: string,
  payload: Record<string, unknown>,
  filters: Record<string, string | number | boolean>
): Promise<T | null> {
  const response = await fetch(buildRestUrl(table, { eq: filters }), {
    method: "PATCH",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

export async function restDelete(
  table: string,
  filters: Record<string, string | number | boolean>
): Promise<void> {
  const response = await fetch(buildRestUrl(table, { eq: filters }), {
    method: "DELETE",
    headers: serviceHeaders()
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function authSignUp(email: string, password: string) {
  const response = await fetch(`${requireValue(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function authSignIn(email: string, password: string) {
  const response = await fetch(`${requireValue(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${requireValue(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
