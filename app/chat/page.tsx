"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChatMessage } from "@/lib/types";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    setGameId(localStorage.getItem("activeGameId"));
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!gameId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/chat?gameId=${gameId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load chat");
        setMessages(data.messages);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load chat");
      } finally {
        setLoading(false);
      }
    }

    void loadMessages();
  }, [gameId]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!gameId) {
      setError("Join a game first.");
      return;
    }

    try {
      const senderUserId = localStorage.getItem("userId");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, senderUserId, message: text, channel: "global" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send message");

      setMessages((current) => [...current, data.message]);
      setText("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message");
    }
  }

  return (
    <main>
      <h1>Game Chat</h1>
      <div className="card">
        {loading ? <p>Loading messages…</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {!loading && messages.length === 0 ? <p>No messages yet.</p> : null}
        {messages.map((msg) => (
          <p key={msg.id}>
            [{msg.channel}] {msg.message}
          </p>
        ))}
      </div>
      <form className="card" onSubmit={handleSend}>
        <input type="text" value={text} onChange={(event) => setText(event.target.value)} placeholder="Type message" />
        <br />
        <br />
        <button className="button" disabled={!text.trim()}>Send</button>
      </form>
    </main>
  );
}
