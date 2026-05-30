/**
 * Second-pass touchup: fix illegible combos + sky/orange residue.
 *
 * Illegible: `bg-mmp-cream text-white` (cream is too light for white text)
 *            → use `bg-mmp-ink text-white` for hero/CTA situations
 *
 * Sky/orange dashboard gradient (login + dashboard background) → cream/paper
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = "/app/web/src";

const REPLACEMENTS: Array<[RegExp, string]> = [
  // ============ Fix illegible "bg-mmp-cream + white text" combos ============
  // Hero summary card patterns that originated as violet→pink gradient with white text
  [/bg-mmp-cream\s+text-white\s+rounded-3xl/g, "bg-mmp-ink text-white rounded-3xl"],
  [/bg-mmp-cream\s+text-white\s+rounded-2xl/g, "bg-mmp-ink text-white rounded-2xl"],

  // Buttons that were `bg-gradient violet-pink hover:opacity-95 text-white` → after pass
  // became `bg-mmp-cream hover:opacity-95 ... text-white`. Make ink solid.
  [/(class[^"']*?)bg-mmp-cream(\s[^"']*?)text-white/g, "$1bg-mmp-ink$2text-white"],

  // ============ Sky/orange/sky-50→orange-50 leftover backgrounds ============
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-sky-\d+\s+(via-\w+-\d+\s+)?to-orange-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-orange-\d+\s+to-sky-\d+/g, "bg-mmp-cream"],
  [/bg-gradient-to-(br|r|b|tr|t)\s+from-sky-\d+\s+to-orange-\d+\s+bg-clip-text\s+text-transparent/g, "text-mmp-ink"],

  // ============ Hover state that didn't change after collapse ============
  // `bg-mmp-ink hover:bg-mmp-ink` produces no hover effect → use slate-800
  [/bg-mmp-ink\s+hover:bg-mmp-ink\b/g, "bg-mmp-ink hover:bg-slate-800"],
  [/hover:bg-mmp-ink\s+hover:from-mmp-cream/g, "hover:bg-slate-800"],

  // ============ Sky-* primary brand color refs replaced with mmp-ink ============
  // (only where used as accent / not for vaccine-style trust blue widgets)
  // Conservative: only swap text-sky-600 -> text-mmp-ink in hover contexts.
  // Skip bg-sky-* (vaccines + chat widgets legitimately use sky).
  [/text-sky-(50|100|200|300|400)\b/g, "text-slate-500"],

  // ============ Disabled / opacity buttons that collapsed badly ============
  // disabled:opacity-50 still works; OK
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
  for (const [pat, rep] of REPLACEMENTS) {
    next = next.replace(pat, (m) => { n++; return rep; });
  }
  if (n > 0) {
    writeFileSync(file, next);
    totalChanges += n;
    filesChanged++;
    console.log(`  ✏️  ${relative(ROOT, file).replace(/\\/g, "/")}  (${n})`);
  }
}

console.log(`\n✅ Touchup: ${totalChanges} replacements across ${filesChanged} files.`);
