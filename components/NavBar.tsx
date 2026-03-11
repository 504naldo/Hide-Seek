"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const nav = [
  ["/dashboard", "Dashboard"],
  ["/game/demo", "Map"],
  ["/missions", "Missions"],
  ["/chat", "Chat"],
  ["/stats", "Stats"]
] as const;

export function NavBar() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("userId");
    router.push("/login");
  }

  return (
    <nav className="card" style={{ position: "sticky", bottom: 8 }}>
      <div className="grid two">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="button">
            {label}
          </Link>
        ))}
      </div>
      <button className="button" style={{ marginTop: "0.8rem" }} onClick={() => void logout()}>Log out</button>
    </nav>
  );
}
