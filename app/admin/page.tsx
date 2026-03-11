export default function AdminPage() {
  return (
    <main>
      <h1>Host Admin Dashboard</h1>
      <div className="card grid">
        <button className="button">Start Game</button>
        <button className="button">Pause Game</button>
        <button className="button">Reveal Hider Location</button>
        <button className="button">Push New Mission</button>
        <button className="button" style={{ background: "var(--danger)", color: "white" }}>
          End Game
        </button>
      </div>
    </main>
  );
}
