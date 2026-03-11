import webpush from "web-push";
import { restDelete, restInsert, restSelect } from "@/lib/supabase";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface StoredPushSubscription {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}

export async function upsertPushSubscription(sub: StoredPushSubscription): Promise<void> {
  const existing = await restSelect<{ id: string }>("push_subscriptions", {
    select: "id",
    eq: { endpoint: sub.endpoint },
    limit: 1
  });

  if (existing[0]) {
    await restDelete("push_subscriptions", { endpoint: sub.endpoint });
  }

  await restInsert("push_subscriptions", {
    user_id: sub.user_id,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    user_agent: sub.user_agent ?? null
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await restDelete("push_subscriptions", { endpoint });
}

export async function sendPushToUsers(params: {
  userIds: string[];
  title: string;
  body: string;
  eventType: string;
  gameId?: string;
}) {
  if (!ensureConfigured()) return;

  const uniqueUsers = [...new Set(params.userIds)].filter(Boolean);
  for (const userId of uniqueUsers) {
    const subscriptions = await restSelect<StoredPushSubscription>("push_subscriptions", {
      select: "user_id,endpoint,p256dh,auth,user_agent",
      eq: { user_id: userId }
    });

    for (const sub of subscriptions) {
      const payload = JSON.stringify({
        title: params.title,
        body: params.body,
        eventType: params.eventType,
        gameId: params.gameId
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(sub.endpoint);
        }
      }
    }
  }
}

export async function sendPushToGamePlayers(params: {
  gameId: string;
  title: string;
  body: string;
  eventType: string;
}) {
  const players = await restSelect<{ user_id: string }>("game_players", {
    select: "user_id",
    eq: { game_id: params.gameId }
  });

  await sendPushToUsers({
    userIds: players.map((p) => p.user_id),
    title: params.title,
    body: params.body,
    eventType: params.eventType,
    gameId: params.gameId
  });
}
