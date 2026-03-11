import Link from "next/link";

const links = [
  ["/login", "1) Login"],
  ["/signup", "Create tester account"],
  ["/join", "2) Join game by code"],
  ["/dashboard", "Dashboard"],
  ["/game/demo", "Live game map"],
  ["/missions", "Mission list"],
  ["/stats", "Player stats"],
  ["/chat", "Game chat"],
  ["/admin", "Host admin"]
] as const;

export default function Home() {
  return (
    <main>
      <h1>Hide & Seek: Urban Ops</h1>
      <p>Urban spy chase PWA inspired by travel strategy games.</p>

      <div className="card">
        <h2>Beta quick start</h2>
        <ol>
          <li>Login or sign up.</li>
          <li>Join a match with an invite code (or host creates one).</li>
          <li>Allow location permissions when asked.</li>
          <li>Enable notifications to get mission/capture/game-state alerts.</li>
          <li>Host uses the preflight checklist before pressing start.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Quick Navigation</h2>
        <div className="grid">
          {links.map(([href, label]) => (
            <Link className="button" key={href} href={href}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
