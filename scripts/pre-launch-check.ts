/**
 * Pre-launch checklist (M8) — verify production readiness.
 *
 * Run (PowerShell hoặc bash):
 *   bun run scripts/pre-launch-check.ts
 *
 * Exits với code 1 nếu có check fail.
 * Mỗi check trả về { ok: boolean, message: string, severity: "fail"|"warn"|"pass" }
 */
import existingConfig from "../baserow-config.json" with { type: "json" };

interface CheckResult {
  name: string;
  severity: "pass" | "warn" | "fail";
  message: string;
}

const results: CheckResult[] = [];

function pass(name: string, msg: string) {
  results.push({ name, severity: "pass", message: msg });
}
function warn(name: string, msg: string) {
  results.push({ name, severity: "warn", message: msg });
}
function fail(name: string, msg: string) {
  results.push({ name, severity: "fail", message: msg });
}

// ============================================================
// 1. ENV VARS
// ============================================================
const REQUIRED_ENV = [
  "BASEROW_URL",
  "BASEROW_TOKEN",
  "JWT_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "GEMINI_API_KEY",
  "OPENWEATHER_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "ADMIN_PHONES",
];
const OPTIONAL_ENV = [
  "ZALO_MODE",
  "ZALO_OA_ACCESS_TOKEN",
  "ZALO_OA_TEMPLATE_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
];

const envMissing: string[] = [];
for (const key of REQUIRED_ENV) {
  if (!Bun.env[key]) envMissing.push(key);
}
if (envMissing.length === 0) {
  pass("env:required", `All ${REQUIRED_ENV.length} required env vars present.`);
} else {
  fail("env:required", `Missing: ${envMissing.join(", ")}`);
}

const envOptMissing: string[] = [];
for (const key of OPTIONAL_ENV) {
  if (!Bun.env[key]) envOptMissing.push(key);
}
if (envOptMissing.length === 0) {
  pass("env:optional", `All optional env vars set.`);
} else {
  warn("env:optional", `Missing optional: ${envOptMissing.join(", ")} (defer / MOCK fallback works)`);
}

// ============================================================
// 2. BASEROW CONFIG INTEGRITY
// ============================================================
const REQUIRED_TABLES = [
  "users",
  "pets",
  "vaccines",
  "dewormers",
  "daily_check_ins",
  "care_plans",
  "allergies_diet",
  "health_events",
  "pet_photos",
  "climate_alerts",
  "notification_log",
  "vaccine_schedules",
  "weight_logs",
  "food_brands",
];
const cfg: any = existingConfig;
const missingTables = REQUIRED_TABLES.filter((t) => !cfg.tables[t]);
if (missingTables.length === 0) {
  pass(
    "baserow:tables",
    `All ${REQUIRED_TABLES.length} tables exist trong baserow-config.json (DB ${cfg.database_id}).`
  );
} else {
  fail("baserow:tables", `Missing tables: ${missingTables.join(", ")}. Chạy migration!`);
}

// Verify M8 fields trong users
const usersFields = cfg.tables.users?.fields || {};
const M8_USER_FIELDS = ["email", "google_oauth_id", "avatar_url", "auth_method", "deleted_at"];
const missingM8 = M8_USER_FIELDS.filter((f) => !usersFields[f]);
if (missingM8.length === 0) {
  pass("baserow:m8_fields", "M8 user fields đầy đủ (email, google_oauth_id, avatar_url, auth_method, deleted_at).");
} else {
  fail("baserow:m8_fields", `Missing M8 user fields: ${missingM8.join(", ")}. Chạy migrate-m8.ts!`);
}

// ============================================================
// 3. BASEROW PING
// ============================================================
const BASEROW_URL = (Bun.env.BASEROW_URL || "").replace(/\/$/, "");
if (BASEROW_URL && Bun.env.BASEROW_TOKEN) {
  try {
    const res = await fetch(
      `${BASEROW_URL}/api/database/rows/table/${cfg.tables.users.id}/?size=1&user_field_names=true`,
      {
        headers: {
          Authorization: `Token ${Bun.env.BASEROW_TOKEN}`,
          Host: "localhost:8888",
        },
      }
    );
    if (res.ok) {
      const j = (await res.json()) as { count: number };
      pass("baserow:ping", `Baserow responds (users count=${j.count}).`);
    } else {
      fail("baserow:ping", `Baserow returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (err: any) {
    fail("baserow:ping", `Connection failed: ${err?.message || err}`);
  }
} else {
  warn("baserow:ping", "Skipped (BASEROW_URL/TOKEN missing).");
}

// ============================================================
// 4. GEMINI API
// ============================================================
if (Bun.env.GEMINI_API_KEY) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${Bun.env.GEMINI_API_KEY}`,
      { method: "GET" }
    );
    if (res.ok) {
      pass("gemini:ping", "Gemini API responds (key valid).");
    } else {
      fail("gemini:ping", `Gemini API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (err: any) {
    warn("gemini:ping", `Skipped (network): ${err?.message || err}`);
  }
} else {
  fail("gemini:ping", "GEMINI_API_KEY missing.");
}

// ============================================================
// 5. OPENWEATHER API
// ============================================================
if (Bun.env.OPENWEATHER_API_KEY) {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=10.762&lon=106.660&appid=${Bun.env.OPENWEATHER_API_KEY}&units=metric`
    );
    if (res.ok) {
      pass("openweather:ping", "OpenWeather API responds (key valid).");
    } else {
      fail(
        "openweather:ping",
        `OpenWeather returned ${res.status}: ${(await res.text()).slice(0, 200)}`
      );
    }
  } catch (err: any) {
    warn("openweather:ping", `Skipped (network): ${err?.message || err}`);
  }
} else {
  fail("openweather:ping", "OPENWEATHER_API_KEY missing.");
}

// ============================================================
// 6. VAPID KEY FORMAT
// ============================================================
const vapidPub = Bun.env.VAPID_PUBLIC_KEY || "";
const vapidPriv = Bun.env.VAPID_PRIVATE_KEY || "";
if (vapidPub && vapidPriv) {
  // Format: VAPID public key is base64url 65 bytes (88 chars approx)
  if (vapidPub.length >= 80 && vapidPub.length <= 100 && /^[A-Za-z0-9_-]+$/.test(vapidPub)) {
    pass("vapid:format", "VAPID keys present và format hợp lệ.");
  } else {
    warn("vapid:format", `VAPID_PUBLIC_KEY length ${vapidPub.length} bất thường (expect ~88 chars).`);
  }
} else {
  fail("vapid:keys", "VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY missing.");
}

// ============================================================
// 7. R2 BUCKET (basic config check)
// ============================================================
if (
  Bun.env.R2_ACCOUNT_ID &&
  Bun.env.R2_ACCESS_KEY_ID &&
  Bun.env.R2_SECRET_ACCESS_KEY &&
  Bun.env.R2_BUCKET_NAME &&
  Bun.env.R2_PUBLIC_URL
) {
  pass("r2:config", `R2 config present (bucket=${Bun.env.R2_BUCKET_NAME}).`);
} else {
  fail("r2:config", "R2 credentials chưa đủ.");
}

// ============================================================
// 8. ADMIN PHONES
// ============================================================
const adminPhones = (Bun.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);
if (adminPhones.length === 0) {
  fail("admin:phones", "ADMIN_PHONES empty — không ai access /admin được.");
} else if (adminPhones.every((p) => /^\+84\d{9,10}$/.test(p))) {
  pass("admin:phones", `${adminPhones.length} admin phone(s) format hợp lệ.`);
} else {
  warn("admin:phones", `${adminPhones.length} admin phone(s), một số format không chuẩn.`);
}

// ============================================================
// 9. ZALO OA STATUS
// ============================================================
const zaloMode = Bun.env.ZALO_MODE || "mock";
if (zaloMode === "production") {
  if (Bun.env.ZALO_OA_ACCESS_TOKEN && Bun.env.ZALO_OA_TEMPLATE_ID) {
    pass("zalo:mode", "Production mode + creds configured.");
  } else {
    warn("zalo:mode", "ZALO_MODE=production nhưng thiếu creds — sẽ graceful fallback console.log.");
  }
} else {
  pass("zalo:mode", "Mock mode (OTP console.log). Đủ cho pilot.");
}

// ============================================================
// 10. GOOGLE OAUTH STATUS (deferred to M9)
// ============================================================
if (Bun.env.GOOGLE_OAUTH_CLIENT_ID && Bun.env.GOOGLE_OAUTH_CLIENT_SECRET) {
  pass("google:oauth", "Google OAuth creds present (M9 enable).");
} else {
  warn("google:oauth", "Google OAuth creds chưa set — defer M9 (Phone OTP đủ cho pilot).");
}

// ============================================================
// PRINT REPORT
// ============================================================
console.log("\n" + "=".repeat(70));
console.log("VowVet — Pre-launch Checklist (M8)");
console.log("=".repeat(70) + "\n");

const ICON = { pass: "✅", warn: "⚠️ ", fail: "❌" };
for (const r of results) {
  console.log(`${ICON[r.severity]} [${r.name.padEnd(22)}] ${r.message}`);
}

const failCount = results.filter((r) => r.severity === "fail").length;
const warnCount = results.filter((r) => r.severity === "warn").length;
const passCount = results.filter((r) => r.severity === "pass").length;

console.log("\n" + "-".repeat(70));
console.log(`Summary: ${passCount} PASS · ${warnCount} WARN · ${failCount} FAIL`);
console.log("-".repeat(70));

if (failCount > 0) {
  console.log("\n❌ Pre-launch checklist FAILED. Fix errors trước khi pilot.\n");
  process.exit(1);
}
if (warnCount > 0) {
  console.log("\n⚠️  Warnings không block launch nhưng nên review.\n");
}
console.log("\n✅ Sẵn sàng pilot! 🚀\n");
