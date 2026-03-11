"use client";

import { useEffect, useState } from "react";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function PwaBootstrap() {
  const [installEvent, setInstallEvent] = useState<DeferredPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as DeferredPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if (Notification.permission === "granted") {
      setNotifyEnabled(true);
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  async function installApp() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  async function enableNotifications() {
    try {
      setNotifyError(null);
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push notifications are not supported on this device.");
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("Push is not configured. Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied.");
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        }));

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to enable notifications");

      setNotifyEnabled(true);
    } catch (error) {
      setNotifyError(error instanceof Error ? error.message : "Failed to enable notifications");
    }
  }

  return (
    <>
      {!online ? <div className="offline-banner">Offline mode: live game features are limited.</div> : null}
      {installEvent ? (
        <button className="install-button" onClick={() => void installApp()}>
          Install UrbanOps
        </button>
      ) : null}
      {!notifyEnabled ? (
        <button className="notify-button" onClick={() => void enableNotifications()}>
          Enable Game Notifications
        </button>
      ) : null}
      {notifyError ? <div className="offline-banner" style={{ background: "#ff8d8d" }}>{notifyError}</div> : null}
    </>
  );
}
