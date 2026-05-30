/**
 * Bulk find/replace VowVet violet/pink-saturated palette → Mon Min Pet brand tokens.
 *
 * EXCEPTIONS — files that intentionally keep gradient/violet/pink:
 *   - /pets/[id]/birthday.astro          (birthday party celebration is OK)
 *   - /pets/[id]/birthday-party.astro
 *   - /birthday/[id].astro
 *   - Pet Score "Diamond" tier shimmer block (kept manually after this pass)
 *
 * Strategy: rewrite class strings. We target the most common combos.
 * Idempotent: re-running is safe.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = "/app/web/src";
const EXCEPTIONS = new Set([
  "pages/pets/[id]/birthday.astro",
  "pages/pets/[id]/birthday-party.astro",
  "pages/birthday/[id].astro",
]);

// Order matters: longest-most-specific first.
// Each entry is [pattern, replacement].
const REPLACEMENTS: Array<[RegExp, string]> = [
  // ---- gradient combos (violet/pink/fuchsia) ----
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-\d+\s+(via-\w+-\d+\s+)?to-pink-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-pink-\d+\s+(via-\w+-\d+\s+)?to-violet-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-\d+\s+(via-\w+-\d+\s+)?to-fuchsia-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-fuchsia-\d+\s+(via-\w+-\d+\s+)?to-pink-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-pink-\d+\s+(via-\w+-\d+\s+)?to-orange-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-\d+\s+to-purple-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-fuchsia-\d+\s+to-purple-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-\d+\s+(via-\w+-\d+\s+)?to-pink-\d+\s+(via-\w+-\d+\s+)?to-orange-\d+/g, "bg-mmp-cream"],

  // From-X-to-Y for SOFT pastel backgrounds (used a lot in pets pages)
  // from-pink-50 / from-violet-50 alone, to-pink-50, to-violet-50 — convert to cream
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-pink-50(\s+to-\w+-50)?/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-50(\s+to-\w+-50)?/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-fuchsia-50(\s+to-\w+-50)?/g, "bg-mmp-cream"],

  // ---- gradient text shimmer (replace with solid) ----
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-sky-\d+\s+to-orange-\d+\s+bg-clip-text\s+text-transparent/g, "text-mmp-ink"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-violet-\d+\s+to-pink-\d+\s+bg-clip-text\s+text-transparent/g, "text-mmp-ink"],

  // ---- solid violet/pink/fuchsia ----
  [/bg-violet-(50|100)\b/g, "bg-mmp-cream"],
  [/bg-violet-(200|300|400)\b/g, "bg-yellow-100"],
  [/bg-violet-(500|600|700|800|900)\b/g, "bg-mmp-ink"],
  [/text-violet-(50|100|200|300|400)\b/g, "text-yellow-700"],
  [/text-violet-(500|600|700|800|900)\b/g, "text-mmp-ink"],
  [/border-violet-(100|200|300)\b/g, "border-mmp-cream"],
  [/border-violet-(400|500|600|700)\b/g, "border-mmp-ink"],
  [/ring-violet-\d+\b/g, "ring-mmp-gold"],
  [/from-violet-\d+\b/g, "from-mmp-cream"],
  [/to-violet-\d+\b/g, "to-white"],
  [/via-violet-\d+\b/g, "via-mmp-cream"],
  [/hover:bg-violet-\d+\b/g, "hover:bg-slate-100"],
  [/hover:from-violet-\d+\b/g, "hover:from-mmp-cream"],
  [/hover:to-violet-\d+\b/g, "hover:to-mmp-cream"],
  [/hover:text-violet-\d+\b/g, "hover:text-mmp-ink"],
  [/hover:border-violet-\d+\b/g, "hover:border-mmp-ink"],
  [/focus:border-violet-\d+\b/g, "focus:border-mmp-ink"],
  [/focus:ring-violet-\d+\b/g, "focus:ring-mmp-gold"],

  // pink
  [/bg-pink-(50|100)\b/g, "bg-mmp-cream"],
  [/bg-pink-(200|300|400)\b/g, "bg-yellow-100"],
  [/bg-pink-(500|600|700|800|900)\b/g, "bg-mmp-ink"],
  [/text-pink-(50|100|200|300|400)\b/g, "text-yellow-700"],
  [/text-pink-(500|600|700|800|900)\b/g, "text-mmp-ink"],
  [/border-pink-(100|200|300)\b/g, "border-mmp-cream"],
  [/border-pink-(400|500|600|700)\b/g, "border-mmp-ink"],
  [/from-pink-\d+\b/g, "from-mmp-cream"],
  [/to-pink-\d+\b/g, "to-white"],
  [/via-pink-\d+\b/g, "via-mmp-cream"],
  [/hover:bg-pink-\d+\b/g, "hover:bg-slate-100"],
  [/hover:from-pink-\d+\b/g, "hover:from-mmp-cream"],
  [/hover:to-pink-\d+\b/g, "hover:to-white"],
  [/hover:text-pink-\d+\b/g, "hover:text-mmp-ink"],

  // fuchsia
  [/bg-fuchsia-\d+\b/g, "bg-mmp-cream"],
  [/text-fuchsia-\d+\b/g, "text-mmp-ink"],
  [/border-fuchsia-\d+\b/g, "border-mmp-ink"],
  [/from-fuchsia-\d+\b/g, "from-mmp-cream"],
  [/to-fuchsia-\d+\b/g, "to-white"],
  [/hover:from-fuchsia-\d+\b/g, "hover:from-mmp-cream"],

  // purple (rare but used)
  [/bg-purple-(50|100)\b/g, "bg-mmp-cream"],
  [/bg-purple-(500|600|700)\b/g, "bg-mmp-ink"],
  [/text-purple-(50|100|200|300|400)\b/g, "text-yellow-700"],
  [/text-purple-(500|600|700|800|900)\b/g, "text-mmp-ink"],
  [/border-purple-\d+\b/g, "border-mmp-cream"],
  [/from-purple-\d+\b/g, "from-mmp-cream"],
  [/to-purple-\d+\b/g, "to-white"],
  [/hover:from-purple-\d+\b/g, "hover:from-mmp-cream"],
  [/hover:to-purple-\d+\b/g, "hover:to-white"],
];

let totalChanges = 0;
let filesChanged = 0;
let filesSkipped = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (extname(p) === ".astro" || extname(p) === ".css") out.push(p);
  }
  return out;
}

const files = walk(ROOT);
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (EXCEPTIONS.has(rel)) {
    filesSkipped++;
    continue;
  }
  const orig = readFileSync(file, "utf-8");
  let next = orig;
  let n = 0;
  for (const [pat, rep] of REPLACEMENTS) {
    next = next.replace(pat, (m) => { n++; return rep; });
  }
  if (n > 0) {
    writeFileSync(file, next);
    totalChanges += n;
    filesChanged++;
    console.log(`  ✏️  ${rel}  (${n} replacements)`);
  }
}

console.log(`\n✅ Brand sync replace: ${totalChanges} total replacements across ${filesChanged} files (${filesSkipped} exceptions skipped).`);
