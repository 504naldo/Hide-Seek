"use client";

import { FormEvent, useState } from "react";

export default function SignupPage() {
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
        body: JSON.stringify({ mode: "signup", email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Signup failed");
      }

      const userId = data.data?.user?.id;
      if (userId) {
        localStorage.setItem("userId", userId);
      }
      window.location.href = "/dashboard";
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Create Account</h1>
      <div className="card">
        <p>Create your tester account, then proceed to Join Game using host invite code.</p>
      </div>
      <form className="card grid" onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="urban@fox.app" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a secure password" />
        </label>
        <label>
          Minimum age confirmation (13+)
          <select defaultValue="Yes, I confirm">
            <option>Yes, I confirm</option>
            <option>No</option>
          </select>
        </label>
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        <button className="button" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
    </main>
  );
}
