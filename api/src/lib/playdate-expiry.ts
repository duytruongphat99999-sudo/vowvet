/**
 * Playdate match expiry sweep (M27, cron Job 10).
 *
 * Every 6 hours — expires pending matches that have no chat after 7 days.
 * Active matches (any message sent) are never expired.
 */
import { expirePendingMatches } from "./playdate.ts";

export async function runPlaydateExpiryJob(): Promise<void> {
  console.log("[scheduler] playdate expiry sweep start");
  try {
    const r = await expirePendingMatches();
    console.log(`[scheduler] playdate expiry: scanned=${r.scanned} expired=${r.expired}`);
  } catch (err) {
    console.error("[scheduler] playdate expiry failed:", err);
  }
}
