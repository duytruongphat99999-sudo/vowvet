/**
 * Final cleanup pass:
 *   - Swap ALL bg-mmp-cream + text-white → bg-mmp-ink + text-white (legible)
 *   - Fix corruption like `bg-mmp-cream0 to-white`
 *   - Fix `hover:from-mmp-cream hover:to-orange-500` etc. — collapse to single hover
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = "/app/web/src";

// Strategy: find class attributes that contain BOTH bg-mmp-cream AND text-white,
// swap bg-mmp-cream → bg-mmp-ink + hover:bg-slate-800 (when text-white present).
function fixClass(classStr: string): string {
  const hasCream = /\bbg-mmp-cream\b/.test(classStr);
  const hasWhite = /\btext-white\b/.test(classStr);
  if (hasCream && hasWhite) {
    // Replace bg-mmp-cream → bg-mmp-ink
    let next = classStr.replace(/\bbg-mmp-cream\b/g, "bg-mmp-ink");
    // If a `hover:opacity-95` exists, keep it. Otherwise add hover:bg-slate-800
    if (!/hover:bg-/.test(next) && !/hover:opacity/.test(next)) {
      next = next.replace(/\bbg-mmp-ink\b/, "bg-mmp-ink hover:bg-slate-800");
    }
    // Replace hover:from-mmp-cream and hover:to-* gradient remnants → keep single hover
    next = next.replace(/\bhover:from-mmp-cream\b\s*hover:to-\w+-\d+/g, "hover:bg-slate-800");
    next = next.replace(/\bhover:from-mmp-cream\b\s*hover:to-white/g, "hover:bg-slate-800");
    return next;
  }
  return classStr;
}

const REPLACEMENTS: Array<[RegExp, string]> = [
  // ============ Corrupt token: bg-mmp-cream0 (impossible, leftover from regex) ============
  [/bg-mmp-cream0\s+to-white/g, "bg-mmp-cream"],
  [/bg-mmp-cream0\b/g, "bg-mmp-cream"],

  // ============ Hover state stuck on cream-cream (no visible effect) ============
  [/\bhover:from-mmp-cream\b\s+hover:to-orange-500/g, "hover:bg-slate-100"],
  [/\bhover:from-mmp-cream\b\s+hover:to-white/g, "hover:bg-slate-100"],
  [/\bhover:from-mmp-cream\b\s+hover:to-mmp-cream/g, "hover:bg-slate-100"],

  // ============ Borders that are cream-on-cream (invisible) ============
  // border-mmp-cream on bg-mmp-cream → use slate-200 instead
];

let totalChanges = 0;
let filesChanged = 0;

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
  const orig = readFileSync(file, "utf-8");
  let next = orig;
  let n = 0;

  // First apply simple regex replacements
  for (const [pat, rep] of REPLACEMENTS) {
    next = next.replace(pat, () => { n++; return rep; });
  }

  // Then apply context-aware class-attribute fix
  next = next.replace(/(class(?::list)?\s*=\s*)("[^"]+"|`[^`]+`|'[^']+')/g, (full, prefix, value) => {
    const quote = value[0];
    const inner = value.slice(1, -1);
    const fixed = fixClass(inner);
    if (fixed !== inner) { n++; return prefix + quote + fixed + quote; }
    return full;
  });

  if (n > 0) {
    writeFileSync(file, next);
    totalChanges += n;
    filesChanged++;
    console.log(`  ✏️  ${relative(ROOT, file).replace(/\\/g, "/")}  (${n})`);
  }
}

console.log(`\n✅ Final cleanup: ${totalChanges} fixes across ${filesChanged} files.`);
