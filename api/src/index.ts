/**
 * VowVet API — Hono + Bun
 * Phase 0 M2: auth + onboarding.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health.ts";
import { authRoute } from "./routes/auth.ts";
import { onboardingRoute } from "./routes/onboarding.ts";
import { petsRoute } from "./routes/pets.ts";
import { publicRoute } from "./routes/public.ts";
import { weatherRoute } from "./routes/weather.ts";
import { alertsRoute } from "./routes/alerts.ts";
import { usersRoute, pushRoute } from "./routes/users.ts";
import {
  vaccineSchedulesRoute,
  petVaccinesRoute,
  userVaccineSummaryRoute,
} from "./routes/vaccines.ts";
import {
  petNutritionRoute,
  foodBrandsRoute,
  forbiddenFoodsRoute,
} from "./routes/nutrition.ts";
import { authGoogleRoute, googleLinkRoute } from "./routes/auth-google.ts";
import { authEmailRoute } from "./routes/auth-email.ts";
import { adminRoute } from "./routes/admin.ts";
import { devRoute } from "./routes/dev.ts";
import { invalidateMeCache } from "./lib/me-cache.ts";
import {
  triageSymptomsRoute,
  petTriageRoute,
  triageSessionRoute,
} from "./routes/triage.ts";
import { chatRoutes } from "./routes/chat.ts";
import { vetRoutes } from "./routes/vet.ts";
import { firstAidRoutes } from "./routes/first-aid.ts";
import { faqRoutes } from "./routes/faq.ts";
import { personalityRoutes, petPersonalityRoutes } from "./routes/personality.ts";
import { petBillsRoute } from "./routes/bills.ts";
import { birthdayRoute } from "./routes/birthday.ts";
import { birthdayWallRoute } from "./routes/birthday-wall.ts";
import { birthdayCardRoute } from "./routes/birthday-card.ts";
import { voiceDiaryRoute } from "./routes/voice-diary.ts";
import { routinesGlobalRoute, petRoutinesRoute } from "./routes/routines.ts";
import { lostPetsRoute, lostPetsPublicRoute, vetScanRoute } from "./routes/lost-pets.ts";
import { cognitiveRoute } from "./routes/cognitive.ts";
import { painMobilityRoute } from "./routes/pain-mobility.ts";
import { waterRoute } from "./routes/water.ts";
import { placesRoute } from "./routes/places.ts";
import { petScoreRoute } from "./routes/pet-score.ts";
import { bcsRoute } from "./routes/bcs.ts";
import { petMemorialRoute, memorialAuthRoute, memorialPublicRoute } from "./routes/memorials.ts";
import { playdateRoute } from "./routes/playdate.ts";
import { triageTreeRoute } from "./routes/triage-tree.ts";
import { faqsRoute } from "./routes/faqs.ts";
import { heroesRoute } from "./routes/heroes.ts";
import { marketingRoute } from "./routes/marketing.ts";
import { achievementsRoute } from "./routes/achievements.ts";
import { rewardsRoute } from "./routes/rewards.ts";
import { nudgesRoute } from "./routes/nudges.ts";
import { petLeaderboardRoute } from "./routes/pet-leaderboard.ts";
import { insuranceRoute } from "./routes/insurance.ts";
import { questsRoute } from "./routes/quests.ts";
import { moodRoute } from "./routes/mood.ts";
import { communityRoute } from "./routes/community.ts";
import { initScheduler } from "./scheduler.ts";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    // Allow vowvet.monminpet.com (prod), debug ports, và proxy chain qua Vite
    origin: (origin) => {
      if (!origin) return origin;
      const allowed = [
        "https://vowvet.monminpet.com",
        "http://localhost:4321",
        "http://localhost:4322",
        "http://127.0.0.1:4321",
        "http://127.0.0.1:4322",
      ];
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true, // cần cho cookie HTTP-only
  })
);

// v275: bust cache /auth/me khi user GHI (non-GET) → không trả pet/user cũ sau khi sửa.
app.use("*", async (c, next) => {
  await next();
  try {
    const m = c.req.method;
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      const u = c.get("user") as any;
      if (u?.sub) invalidateMeCache(u.sub);
    }
  } catch {}
});

app.get("/", (c) => c.json({ name: "vowvet-api", version: "0.36.0" }));

app.route("/api/v1/health", healthRoute);
app.route("/api/v1/auth", authRoute);
// M8: Google OAuth (login + create) mounted at /api/v1/auth/google
app.route("/api/v1/auth/google", authGoogleRoute);
// M20-auth: Email + Password
app.route("/api/v1/auth/email", authEmailRoute);
app.route("/api/v1/onboarding", onboardingRoute);
app.route("/api/v1/pets", petsRoute);
// M6: pet vaccine endpoints mounted at same prefix; Hono merges by path
app.route("/api/v1/pets", petVaccinesRoute);
// M7: pet nutrition + weight-log endpoints share same prefix
app.route("/api/v1/pets", petNutritionRoute);
app.route("/api/v1/public", publicRoute);
app.route("/api/v1/weather", weatherRoute);
app.route("/api/v1/alerts", alertsRoute);
app.route("/api/v1/users", usersRoute);
app.route("/api/v1/users", userVaccineSummaryRoute);
// M8: Google account linking flow (auth required)
app.route("/api/v1/users", googleLinkRoute);
app.route("/api/v1/push", pushRoute);
app.route("/api/v1/vaccine-schedules", vaccineSchedulesRoute);
// M7: nutrition reference endpoints
app.route("/api/v1/food-brands", foodBrandsRoute);
app.route("/api/v1/forbidden-foods", forbiddenFoodsRoute);
// M8: admin (protected by ADMIN_PHONES env whitelist)
app.route("/api/v1/admin", adminRoute);
app.route("/api/v1/dev", devRoute); // v269: dev-only (self reset-onboarding) — 404 ở production
// M9.1: Symptom triage routes
app.route("/api/v1/triage", triageSymptomsRoute);     // GET /symptoms
app.route("/api/v1/pets", petTriageRoute);            // /pets/:id/triage[/history]
app.route("/api/v1/triage", triageSessionRoute);      // /sessions/:id[/feedback|/escalate-to-chat]
// M9.2: Telehealth chat (owner + vet routes)
app.route("/api/v1/chat", chatRoutes);                // /threads[/:id][/messages|/close]
app.route("/api/v1/vet", vetRoutes);                  // /threads/queue|/:id/claim|/mine|/:id/messages
// M9.3: First aid hotline + library
app.route("/api/v1/first-aid", firstAidRoutes);       // /articles[/:slug] | /clinic-info
// M9.4: FAQ / Knowledge base
app.route("/api/v1/faq", faqRoutes);                  // /articles[/:slug] | /categories
// M13: Personality quiz
app.route("/api/v1/personality", personalityRoutes);  // /types | /questions
app.route("/api/v1/pets", petPersonalityRoutes);      // /pets/:id/personality[/submit|/reset]
// M14.1: Birthday + auto card SVG
app.route("/api/v1/pets", birthdayRoute);             // /pets/:id/birthday[/slideshow|/wall-data]
app.route("/api/v1/pets", birthdayCardRoute);         // /pets/:id/birthday-card.svg
// M11: Public birthday wall (no auth)
app.route("/api/v1/public", birthdayWallRoute);       // /public/birthday-wall/:petId[/wish]
// M14.2: Pet Score
app.route("/api/v1/pets", petScoreRoute);             // /pets/:id/pet-score[/refresh] + /score-levels
// M16: Vet Bill Tracker
app.route("/api/v1/pets", petBillsRoute);             // /pets/:id/bills[/upload|/summary|/:bid]
// M14: Voice Diary
app.route("/api/v1/pets", voiceDiaryRoute);           // /pets/:id/diary[/today|/yearbook/:year|/upload-audio|/:eid]
// M19: Pet Routine Builder
app.route("/api/v1/routines", routinesGlobalRoute);   // /routines/templates|/badges
app.route("/api/v1/pets", petRoutinesRoute);          // /pets/:id/routines[/today|/calendar|/streak|/:rid[/complete]]
// M23: Pain (Glasgow CMPS-SF) + Mobility
app.route("/api/v1/pets", painMobilityRoute);         // /pets/:id/pain|/mobility
// M24: Cognitive CCDS
app.route("/api/v1/pets", cognitiveRoute);            // /pets/:id/cognitive
// M25: Water intake logs
app.route("/api/v1/pets", waterRoute);                // /pets/:id/water
// M26: Pet-friendly Places + Map
app.route("/api/v1/places", placesRoute);             // /places[/:id|/categories|/:id/checkins|/:id/checkin|/checkin-history/:petId]
// M22: BCS AI Vision
app.route("/api/v1/pets", bcsRoute);                  // /pets/:id/bcs[/assess|/history|/latest|/:assessId|/:assessId/vet-review]
// M30: Memorial Hall (placeholder - legal safe)
app.route("/api/v1/pets", petMemorialRoute);          // /pets/:id/memorial (POST/GET)
app.route("/api/v1/memorials", memorialAuthRoute);    // /memorials/my|/:mid|/:mid/interest|/my-interest
app.route("/api/v1/public", memorialPublicRoute);     // /public/memorial/:slug[/visits|/candle|/message]
// M27: Pet Playdate (Tinder matching)
app.route("/api/v1/playdate", playdateRoute);         // /playdate/[can-create|profile|discover|swipe|matches|report|safety-tips]
// M31: Decision-tree Triage (no AI) + Baserow CMS FAQs
app.route("/api/v1/triage-tree", triageTreeRoute);    // /triage-tree/[tree|node/:id|session|pets/:petId/history]
app.route("/api/v1/faqs", faqsRoute);                 // /faqs[/categories|/:faqId|/:faqId/helpful]  PUBLIC
// Lost Pet upgrade: Pet Heroes leaderboard + profile (PUBLIC + AUTH)
app.route("/api/v1/heroes", heroesRoute);             // /heroes/[leaderboard|profile/:userId|profile/slug/:slug|my-stats|toggle-public]
// Marketing landing content (PUBLIC)
app.route("/api/v1/marketing", marketingRoute);       // /marketing/why-vowvet
// Gamification Session A: Achievements + Rewards + Feature gates
app.route("/api/v1/achievements", achievementsRoute); // /achievements/pets/:petId[/unviewed|/:code/mark-viewed]
app.route("/api/v1/rewards", rewardsRoute);           // /rewards/pets/:petId/[unlockable|claimed|:code/claim] + /claims/:id + admin redeem + feature-access
// Gamification Session B: Nudges + Pet Score Leaderboard + Daily Quests + Pet Mood
app.route("/api/v1/nudges", nudgesRoute);             // /nudges/pets/:petId + dismiss/clicked
app.route("/api/v1/leaderboard", petLeaderboardRoute); // PUBLIC list + auth opt-in/out
app.route("/api/v1/insurance", insuranceRoute);       // PUBLIC waitlist + count
app.route("/api/v1/quests", questsRoute);             // /quests/pets/:petId/[today|:code/complete|history]
app.route("/api/v1/mood", moodRoute);                 // /mood/pets/:petId
// Gamification Session C: Community feed
app.route("/api/v1/community", communityRoute);       // /community/feed (PUBLIC)
// M20: Lost Pet Network
app.route("/api/v1/lost-pets", lostPetsRoute);        // /:petId/report, /:reportId/resolve|cancel, /my, /nearby, /:rid/sightings
app.route("/api/v1/public", lostPetsPublicRoute);     // /public/lost/:slug[/sighting]
app.route("/api/v1/vet", vetScanRoute);               // /vet/partners, /vet/scan-qr

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy endpoint" } }, 404));

app.onError((err, c) => {
  console.error("[api] uncaught:", err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Lỗi hệ thống" } }, 500);
});

const port = Number(process.env.PORT || 3000);
console.log(`[vowvet-api] đang lắng nghe trên port ${port}`);

// M5: Init background scheduler (3 cron jobs)
initScheduler();

export default {
  port,
  fetch: app.fetch,
};
