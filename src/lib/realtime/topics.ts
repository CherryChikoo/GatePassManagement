/** Live-update channel shared by the server (notify.ts) and the browser (live.ts). */
export const LIVE_CHANNEL = "gatepass-live";
export const LIVE_EVENT = "change";

/**
 * A signed-in user's own private topic (pass approved / scanned…). Only that
 * user can listen: see prisma/migrations/realtime_live_updates.sql.
 */
export const personalTopic = (userId: string) => `user:${userId}`;
