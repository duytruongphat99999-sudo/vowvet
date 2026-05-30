/**
 * E2E for /places photo upload feature.
 *
 * Steps:
 *   1. POST /api/v1/places/upload-image with a tiny PNG → returns URL
 *   2. POST /api/v1/places with photo_urls → place created with photos persisted
 *   3. GET /api/v1/places/:id → photo_urls echoed back as string[]
 *   4. POST /api/v1/places/:id/checkin with 2 photos → checkin created
 *   5. GET /api/v1/places/:id/checkins → returns photo_urls in checkin
 *   6. Frontend pages render OK (new + checkin + detail)
 *   7. Submit without photos → returns place but UI would reject (verified separately)
 *   8. Upload >5MB → 413 reject
 *   9. Upload non-image → 415 reject
 *   10. Detail page HTML contains photo gallery markup when photo_urls exist
 */
import { signSession } from "../shared/jwt.ts";

const WEB = "http://127.0.0.1:4322";
const API = "http://127.0.0.1:3010";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession({ sub: USER_ID, phone: "+84900000010", email: "e2e@local", is_onboarded: true } as any, 3600);
const cookie = `vowvet_session=${token}`;
const hdr = { cookie, "Content-Type": "application/json" };
const hdrCookieOnly = { cookie };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 200)); fail++; }
}

// Tiny 1×1 transparent PNG (smallest valid PNG file, 67 bytes)
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function makePngBlob() {
  return new Blob([TINY_PNG_BYTES], { type: "image/png" });
}

async function uploadPhoto(): Promise<string> {
  const fd = new FormData();
  fd.append("file", makePngBlob(), "test.png");
  const res = await fetch(`${API}/api/v1/places/upload-image`, {
    method: "POST",
    headers: hdrCookieOnly,
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`upload failed ${res.status}: ${txt}`);
  }
  const j = await res.json();
  return j.url;
}

// ============================================================
// T1: Upload image
// ============================================================
console.log("\n=== T1: Upload image ===");
let url1: string;
try {
  url1 = await uploadPhoto();
  ok("T1 upload returns url", typeof url1 === "string" && url1.length > 10, url1);
  ok("T1b url under places/ key prefix", url1.includes("/places/"), url1);
} catch (e: any) {
  ok("T1 upload", false, e.message);
  process.exit(1);
}

// ============================================================
// T2: Upload too large (mock 6MB) → 413
// ============================================================
console.log("\n=== T2: Upload validation ===");
{
  const big = new Uint8Array(6 * 1024 * 1024).fill(0x42);
  const fd = new FormData();
  fd.append("file", new Blob([big], { type: "image/png" }), "big.png");
  const res = await fetch(`${API}/api/v1/places/upload-image`, {
    method: "POST", headers: hdrCookieOnly, body: fd,
  });
  ok("T2a >5MB → 413", res.status === 413, `got ${res.status}`);
}
{
  const fd = new FormData();
  fd.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  const res = await fetch(`${API}/api/v1/places/upload-image`, {
    method: "POST", headers: hdrCookieOnly, body: fd,
  });
  ok("T2b text/plain → 415", res.status === 415, `got ${res.status}`);
}
{
  const res = await fetch(`${API}/api/v1/places/upload-image`, {
    method: "POST", headers: hdrCookieOnly, body: new FormData(),
  });
  ok("T2c missing file → 400", res.status === 400, `got ${res.status}`);
}
{
  const fd = new FormData();
  fd.append("file", makePngBlob(), "x.png");
  const res = await fetch(`${API}/api/v1/places/upload-image`, {
    method: "POST", body: fd, // no cookie
  });
  ok("T2d no auth → 401", res.status === 401, `got ${res.status}`);
}

// ============================================================
// T3: Upload 2 more for place + checkin
// ============================================================
console.log("\n=== T3: Upload 2 more for full flow ===");
const url2 = await uploadPhoto();
const url3 = await uploadPhoto();
ok("T3 2 more uploads returned URLs", !!url2 && !!url3);

// ============================================================
// T4: POST /places with photo_urls
// ============================================================
console.log("\n=== T4: Submit place with photos ===");
const placeBody = {
  name: `E2E Photos Test ${Date.now()}`,
  address: "E2E address Q1, TP.HCM",
  lat: 10.7720,
  lng: 106.7000,
  category: "cafe",
  pet_policy: "allowed",
  amenities: ["indoor", "water_bowl"],
  photo_urls: [url1, url2],
};
const placeRes = await fetch(`${API}/api/v1/places`, {
  method: "POST", headers: hdr, body: JSON.stringify(placeBody),
});
const place = await placeRes.json();
ok("T4 POST /places → 201", placeRes.status === 201, place);
ok("T4b id returned", typeof place.id === "number");
ok("T4c photo_urls echoed back (array len 2)", Array.isArray(place.photo_urls) && place.photo_urls.length === 2);
ok("T4d photo URLs match what we uploaded", place.photo_urls[0] === url1 && place.photo_urls[1] === url2);

const placeId = place.id;

// ============================================================
// T5: GET /places/:id → photos persisted
// ============================================================
const getRes = await fetch(`${API}/api/v1/places/${placeId}`);
const getJ = await getRes.json();
ok("T5 GET /places/:id → 200", getRes.status === 200);
ok("T5b photo_urls returned as array", Array.isArray(getJ.photo_urls) && getJ.photo_urls.length === 2);

// ============================================================
// T6: POST /checkin with 2 photos
// ============================================================
console.log("\n=== T6: Submit checkin with photos ===");
const url4 = await uploadPhoto();
const ckRes = await fetch(`${API}/api/v1/places/${placeId}/checkin`, {
  method: "POST", headers: hdr,
  body: JSON.stringify({
    pet_id: PET_ID,
    rating: 5,
    review: "E2E test review",
    photo_urls: [url3, url4],
  }),
});
const ck = await ckRes.json();
ok("T6 POST /checkin → 201", ckRes.status === 201, ck);
ok("T6b checkin photo_urls len 2", Array.isArray(ck.photo_urls) && ck.photo_urls.length === 2);

// ============================================================
// T7: GET /checkins → returns photos
// ============================================================
const cksRes = await fetch(`${API}/api/v1/places/${placeId}/checkins`);
const cksJ = await cksRes.json();
ok("T7 GET /checkins → 200", cksRes.status === 200);
const ourCk = cksJ.checkins?.find?.((c: any) => c.id === ck.id);
ok("T7b our checkin in list", !!ourCk);
ok("T7c our checkin has photo_urls len 2", ourCk?.photo_urls?.length === 2);

// ============================================================
// T8: Frontend pages render
// ============================================================
console.log("\n=== T8: Frontend rendering ===");
async function fetchHtml(url: string, withAuth = true): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: withAuth ? hdrCookieOnly : {}, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

const newPage = await fetchHtml(`${WEB}/places/new`);
ok("T8a /places/new → 200", newPage.status === 200);
ok("T8b /places/new contains upload UI markers",
  newPage.html.includes("📸 Ảnh thực tế") && newPage.html.includes("handleFiles(") && newPage.html.includes("upload-image"));

const ckPage = await fetchHtml(`${WEB}/places/checkin?placeId=${placeId}`);
ok("T8c /places/checkin → 200", ckPage.status === 200);
ok("T8d /places/checkin contains upload UI markers",
  ckPage.html.includes("Ảnh check-in") && ckPage.html.includes("handleFiles("));

const detailPage = await fetchHtml(`${WEB}/places/${placeId}`, false);
ok("T8e /places/:id → 200 (public)", detailPage.status === 200);
ok("T8f detail HTML contains photo gallery section",
  detailPage.html.includes("📸 Ảnh thực tế") && detailPage.html.includes("place.photo_urls"));
ok("T8g detail HTML renders checkin review photos block", detailPage.html.includes("c.photo_urls"));

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
