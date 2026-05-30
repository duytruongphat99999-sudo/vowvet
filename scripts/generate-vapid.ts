/**
 * Generate VAPID keypair cho Web Push (M5).
 * Run 1 lần, paste 2 keys vào .env, restart api.
 *
 * Usage:
 *   cd C:\docker\vowvet
 *   bun run scripts/generate-vapid.ts
 *
 * Output: 2 dòng để paste vào .env:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:duy@monminpet.com
 *
 * KHÔNG commit keys vào git. .env đã trong .gitignore.
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("\n=== VAPID Keypair generated ===\n");
console.log("Paste these vào file .env tại C:\\docker\\vowvet\\.env :\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:duy@monminpet.com`);
console.log("\nSau khi paste:");
console.log("  1. Restart vowvet-api container:");
console.log("     docker restart vowvet-api");
console.log("  2. Verify env loaded:");
console.log('     docker exec vowvet-api sh -c "echo VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY"');
console.log("\n⚠️ KHÔNG commit keys vào git. Đổi key sẽ invalidate mọi subscription cũ.");
console.log("");
