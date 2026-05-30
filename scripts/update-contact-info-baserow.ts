/**
 * Update Baserow contact info to canonical VowVet hotline + Zalo OA.
 *
 * Targets:
 *   - vet_partners: Mon Min Pet Clinic row → phone/email
 *   - places (category=vet): rows where name contains "Mon Min" → contact_phone/contact_website
 *
 * Idempotent: safe to re-run. Reports each row touched.
 */
import { listRows, updateRow } from "../shared/baserow.ts";
import { getHotlineE164, getZaloLink, getSupportEmail } from "../shared/contact-info.ts";

const HOTLINE = getHotlineE164();          // +84779029133
const ZALO_URL = getZaloLink();            // https://zalo.me/...
const EMAIL = getSupportEmail();           // vowvet@monminpet.com

let touched = 0;

// ============================================================
// vet_partners — only the Mon Min row(s)
// ============================================================
console.log("\n=== vet_partners ===");
try {
  const res = await listRows<any>("vet_partners", { size: 200 });
  for (const row of res.results) {
    const name = String(row.name || "");
    if (!name.toLowerCase().includes("mon min") && !name.toLowerCase().includes("vowvet")) continue;
    const needsPhone = row.phone !== HOTLINE;
    const needsEmail = row.email !== EMAIL;
    if (!needsPhone && !needsEmail) {
      console.log(`  · #${row.id} ${name} — already canonical, skip`);
      continue;
    }
    await updateRow("vet_partners", row.id, {
      phone: HOTLINE,
      email: EMAIL,
    });
    touched++;
    console.log(`  ✓ #${row.id} ${name} → ${HOTLINE}`);
  }
} catch (err: any) {
  console.warn(`  ⚠ vet_partners scan skipped: ${String(err?.message || err).slice(0, 120)}`);
}

// ============================================================
// places — rows where category=vet AND name has "Mon Min" or "VowVet"
// ============================================================
console.log("\n=== places (Mon Min/VowVet vet entries) ===");
try {
  const res = await listRows<any>("places", { size: 200, filter: { active__boolean: "true" } });
  for (const row of res.results) {
    const name = String(row.name || "");
    const cat = typeof row.category === "object" && row.category ? row.category.value : row.category;
    if (cat !== "vet") continue;
    if (!name.toLowerCase().includes("mon min") && !name.toLowerCase().includes("vowvet")) continue;
    const needsPhone = row.contact_phone !== HOTLINE;
    const needsSite = row.contact_website !== ZALO_URL;
    if (!needsPhone && !needsSite) {
      console.log(`  · #${row.id} ${name} — already canonical, skip`);
      continue;
    }
    await updateRow("places", row.id, {
      contact_phone: HOTLINE,
      contact_website: ZALO_URL,
    });
    touched++;
    console.log(`  ✓ #${row.id} ${name} → phone=${HOTLINE} website=Zalo OA`);
  }
} catch (err: any) {
  console.warn(`  ⚠ places scan skipped: ${String(err?.message || err).slice(0, 120)}`);
}

console.log(`\n✅ Done. ${touched} row(s) updated.`);
console.log(`   Canonical hotline: ${HOTLINE}`);
console.log(`   Canonical Zalo OA: ${ZALO_URL}`);
