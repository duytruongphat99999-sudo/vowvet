/**
 * Brand Sync Pass 3 — mass replace:
 *   1. "Mon Min PetCoach" → "Mon Min Pet"
 *   2. bg-blue-{500,600,700} → bg-mmp-ink
 *   3. bg-purple/violet/fuchsia-{500,600,700} → bg-mmp-ink (except birthday exceptions)
 *   4. cyan/teal gradients → flat ink
 *   5. orange-{50,100} alerts → amber (warmer tone)
 *
 * Idempotent. Skips birthday celebration pages where gradient is design intent.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = "/app/web/src";
const EXCEPTIONS = new Set([
  "pages/pets/[id]/birthday.astro",
  "pages/pets/[id]/birthday-party.astro",
  "pages/birthday/[id].astro",
]);

// All transforms apply line-by-line (no global state). [pattern, replacement, label]
type Rule = [RegExp, string, string];

const RULES: Rule[] = [
  // ─── 1. PetCoach lockup ───────────────────────────────
  [/Mon Min PetCoach/g, "Mon Min Pet", "petcoach"],

  // ─── 2. Blue → Ink (button primary, links) ────────────
  [/\bbg-blue-(500|600|700)\b/g, "bg-mmp-ink", "blue-bg"],
  [/\bhover:bg-blue-(700|800|900)\b/g, "hover:bg-slate-800", "blue-hover"],
  [/\btext-blue-(600|700|800|900)\b/g, "text-mmp-ink", "blue-text"],
  [/\bborder-blue-(300|400|500|600)\b/g, "border-mmp-ink", "blue-border"],
  [/\bbg-blue-(50|100)\b/g, "bg-mmp-cream", "blue-light-bg"],
  [/\btext-blue-(300|400|500)\b/g, "text-slate-500", "blue-light-text"],
  [/\bring-blue-\d+\b/g, "ring-mmp-ink", "blue-ring"],
  [/\bfrom-blue-\d+\b/g, "from-mmp-ink", "blue-from"],
  [/\bto-blue-\d+\b/g, "to-slate-800", "blue-to"],
  [/\bvia-blue-\d+\b/g, "via-slate-700", "blue-via"],
  [/\bhover:from-blue-\d+\b/g, "hover:from-slate-900", "blue-hover-from"],
  [/\bhover:to-blue-\d+\b/g, "hover:to-mmp-ink", "blue-hover-to"],
  [/\bhover:text-blue-\d+\b/g, "hover:text-mmp-ink", "blue-hover-text"],
  [/\bhover:border-blue-\d+\b/g, "hover:border-mmp-ink", "blue-hover-border"],
  [/\bfocus:border-blue-\d+\b/g, "focus:border-mmp-ink", "blue-focus-border"],
  [/\bfocus:ring-blue-\d+\b/g, "focus:ring-mmp-ink", "blue-focus-ring"],

  // ─── 3. Purple / Violet / Fuchsia → Ink ──────────────
  // (already mostly cleaned in earlier passes; catch any leftovers)
  [/\bbg-(purple|violet|fuchsia)-(50|100)\b/g, "bg-mmp-cream", "vio-light-bg"],
  [/\bbg-(purple|violet|fuchsia)-(500|600|700|800)\b/g, "bg-mmp-ink", "vio-bg"],
  [/\btext-(purple|violet|fuchsia)-(50|100|200|300|400)\b/g, "text-slate-500", "vio-light-text"],
  [/\btext-(purple|violet|fuchsia)-(500|600|700|800|900)\b/g, "text-mmp-ink", "vio-text"],
  [/\bborder-(purple|violet|fuchsia)-\d+\b/g, "border-mmp-cream", "vio-border"],
  [/\bring-(purple|violet|fuchsia)-\d+\b/g, "ring-mmp-ink", "vio-ring"],
  [/\bfrom-(purple|violet|fuchsia)-\d+\b/g, "from-mmp-ink", "vio-from"],
  [/\bto-(purple|violet|fuchsia)-\d+\b/g, "to-slate-800", "vio-to"],
  [/\bvia-(purple|violet|fuchsia)-\d+\b/g, "via-slate-700", "vio-via"],
  [/\bhover:bg-(purple|violet|fuchsia)-\d+\b/g, "hover:bg-slate-800", "vio-hover-bg"],
  [/\bhover:text-(purple|violet|fuchsia)-\d+\b/g, "hover:text-mmp-ink", "vio-hover-text"],
  [/\bhover:border-(purple|violet|fuchsia)-\d+\b/g, "hover:border-mmp-ink", "vio-hover-border"],

  // ─── 4. Cyan/Teal → Ink (banner gradients) ───────────
  [/\bbg-cyan-(50|100)\b/g, "bg-mmp-cream", "cyan-light-bg"],
  [/\bbg-cyan-(500|600|700)\b/g, "bg-mmp-ink", "cyan-bg"],
  [/\btext-cyan-\d+\b/g, "text-mmp-ink", "cyan-text"],
  [/\bborder-cyan-\d+\b/g, "border-mmp-ink", "cyan-border"],
  [/\bfrom-cyan-\d+\b/g, "from-mmp-ink", "cyan-from"],
  [/\bto-cyan-\d+\b/g, "to-slate-800", "cyan-to"],
  [/\bbg-teal-(50|100)\b/g, "bg-mmp-cream", "teal-light-bg"],
  [/\bbg-teal-(500|600|700)\b/g, "bg-mmp-ink", "teal-bg"],
  [/\btext-teal-\d+\b/g, "text-mmp-ink", "teal-text"],
  [/\bfrom-teal-\d+\b/g, "from-mmp-ink", "teal-from"],
  [/\bto-teal-\d+\b/g, "to-slate-800", "teal-to"],

  // ─── 5. Orange-50/100 alerts → amber (warmer match) ──
  // (avoid blanket orange replacement — only the soft tints commonly used for warnings)
  [/\bbg-orange-50\b/g, "bg-amber-50", "orange-light-bg"],
  [/\bborder-orange-(200|300)\b/g, "border-amber-200", "orange-light-border"],
  [/\btext-orange-(700|800)\b/g, "text-amber-700", "orange-text"],
];

let totalChanges = 0;
let filesChanged = 0;
const labelCounts: Record<string, number> = {};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if ([".astro", ".tsx", ".jsx", ".ts", ".js", ".css"].includes(extname(p))) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (EXCEPTIONS.has(rel)) continue;

  const orig = readFileSync(file, "utf-8");
  let next = orig;
  let fileChanges = 0;

  for (const [pat, rep, label] of RULES) {
    next = next.replace(pat, (m) => {
      fileChanges++;
      labelCounts[label] = (labelCounts[label] || 0) + 1;
      return rep;
    });
  }

  if (fileChanges > 0) {
    writeFileSync(file, next);
    totalChanges += fileChanges;
    filesChanged++;
    console.log(`  ✏️  ${rel}  (${fileChanges})`);
  }
}

console.log(`\n✅ Pass 3 mass-replace: ${totalChanges} edits across ${filesChanged} files`);
console.log("\nBy category:");
for (const [label, n] of Object.entries(labelCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(22)} ${n}`);
}
