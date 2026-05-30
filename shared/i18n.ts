/**
 * VowVet i18n — Vietnamese (default) + English.
 *
 * Usage in Astro pages:
 *   const locale = Astro.locals.locale ?? "vi";
 *   const tt = (key, vars) => t(locale, key, vars);
 *   <h1>{tt("home.hero.title")}</h1>
 *
 * Locale precedence (middleware sets Astro.locals.locale):
 *   1. ?lang=en query param (sets cookie)
 *   2. vv_locale cookie
 *   3. Accept-Language: en* header
 *   4. Default: vi
 *
 * Key syntax: dot-notation. Variables: {{name}}. Fallback: vi.
 */
import vi from "./locales/vi.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };

export type Locale = "vi" | "en";
export const DEFAULT_LOCALE: Locale = "vi";
export const SUPPORTED_LOCALES: Locale[] = ["vi", "en"];
export const LOCALE_COOKIE = "vv_locale";

const messages: Record<Locale, Record<string, unknown>> = {
  vi: vi as any,
  en: en as any,
};

/** Resolve nested key like "home.hero.title" → walks the JSON tree. */
function lookup(tree: Record<string, unknown>, key: string): string | null {
  const parts = key.split(".");
  let cur: any = tree;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : null;
}

/** Interpolate {{var}} placeholders. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
}

/**
 * Translate a key. Falls back to Vietnamese, then to the key itself, never throws.
 */
export function t(locale: Locale | undefined, key: string, vars?: Record<string, string | number>): string {
  const loc: Locale = locale && SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const primary = lookup(messages[loc], key);
  if (primary) return interpolate(primary, vars);
  if (loc !== DEFAULT_LOCALE) {
    const fallback = lookup(messages[DEFAULT_LOCALE], key);
    if (fallback) return interpolate(fallback, vars);
  }
  // Last resort: return the key so developers spot it
  return key;
}

/** Parse `Accept-Language` like "en-US,en;q=0.9,vi;q=0.8" → first supported. */
export function pickLocaleFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const langs = header
    .split(",")
    .map((s) => s.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const lang of langs) {
    const base = lang.split("-")[0];
    if (SUPPORTED_LOCALES.includes(base as Locale)) return base as Locale;
  }
  return null;
}

/** Helper: bind locale into a single-arg `tt(key, vars?)` for cleaner template usage. */
export function makeTranslator(locale: Locale | undefined): (key: string, vars?: Record<string, string | number>) => string {
  return (key, vars) => t(locale, key, vars);
}
