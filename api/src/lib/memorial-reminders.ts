/**
 * Memorial anniversary reminder job (M30, cron Job 11).
 *
 * Daily 9AM Asia/Ho_Chi_Minh — find memorials where passed_away_date MM-DD == today MM-DD
 * AND anniversary_reminder_year < current year, send a gentle web push.
 *
 * Vietnamese-first wording. Skips archived memorials.
 */
import { findAnniversariesDue, markAnniversaryReminded } from "./memorials.ts";
import { getRow } from "@shared/baserow.ts";
import { sendPush } from "./web-push.ts";

export async function runAnniversaryReminderJob(): Promise<void> {
  console.log("[scheduler] anniversary reminder scan start");
  const now = new Date();
  const year = now.getFullYear();
  let due: any[] = [];
  try {
    due = await findAnniversariesDue(now);
  } catch (err) {
    console.error("[scheduler] anniversary scan failed:", err);
    return;
  }
  if (due.length === 0) {
    console.log("[scheduler] anniversary reminder scan: 0 due");
    return;
  }
  console.log(`[scheduler] anniversary reminder: ${due.length} memorial(s) due today`);

  for (const memorial of due) {
    try {
      // Resolve pet name for the message
      let petName = "bé";
      try {
        const petRow = await getRow<any>("pets", memorial.pet_id);
        petName = petRow?.name || "bé";
      } catch (e) {
        // tolerate missing pet record
      }

      const passedDate = new Date(memorial.passed_away_date);
      const yearsAgo = year - passedDate.getFullYear();
      const titleYears = yearsAgo === 1 ? "1 năm" : `${yearsAgo} năm`;

      // Look up owner push subscription
      let userRow: any = null;
      try { userRow = await getRow<any>("users", memorial.user_id); } catch {}
      const sub = userRow?.push_subscription;

      if (sub) {
        await sendPush(
          memorial.user_id,
          sub,
          {
            title: `🕯️ Tưởng nhớ ${petName}`,
            body: `Hôm nay đã ${titleYears} kể từ ngày ${petName} ra đi. Mon Min nhớ bé. Bạn có thể thắp một ngọn nến hôm nay.`,
            data: { url: `/memorial/${memorial.public_slug}`, anniversary: true },
          },
          { type: "vaccine_reminder" }
        );
        console.log(`[scheduler] anniversary push → user=${memorial.user_id} memorial=${memorial.id}`);
      } else {
        console.log(`[scheduler] anniversary user=${memorial.user_id} no push subscription, marking reminded only`);
      }

      // Mark anniversary done for current year so we don't double-fire
      await markAnniversaryReminded(memorial.id, year);
    } catch (err) {
      console.error(`[scheduler] anniversary reminder fail memorial=${memorial.id}:`, err);
    }
  }
}
