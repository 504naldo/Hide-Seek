"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "login", email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Login failed");
      }

      const userId = data.data?.user?.id;
      if (userId) {
        localStorage.setItem("userId", userId);
      }
      window.location.href = "/dashboard";
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Login</h1>
      <div className="card">
        <p>Beta tester tip: use the same account and browser during one playtest to keep session + location permissions stable.</p>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="agent@urbanops.app" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
        </label>
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        <button className="button" disabled={loading}>
          {loading ? "Signing in..." : "Continue with Email"}
        </button>
      </form>
      <div className="card">
        <p>Google and Apple login can be enabled from Supabase Auth provider settings.</p>
      </div>
    </main>
  );
}
