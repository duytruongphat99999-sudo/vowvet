/**
 * Sound effects with graceful fallback.
 *
 * Usage:
 *   import { playSound, areSoundsEnabled, toggleSounds } from "../lib/sounds.js";
 *   playSound("ding");  // achievement
 *   playSound("tada");  // tier-up
 *   playSound("whoosh"); // voucher claim
 *   playSound("pop");   // button tap
 *   playSound("success"); // quest complete
 *
 * Files expected at /sounds/<name>.mp3. If file missing (404), silently no-op.
 * User can disable via localStorage `vowvet_sounds_enabled` (default false — opt-in).
 *
 * IMPORTANT: actual MP3 files are NOT shipped — drop in /web/public/sounds/<name>.mp3
 * for sounds to play. Without files, all calls are silent no-ops (no errors).
 */

const STORAGE_KEY = "vowvet_sounds_enabled";

// In-memory cache of Audio objects so we don't re-fetch on every play.
const audioCache = new Map();

/** @returns boolean — defaults to false (opt-in) */
export function areSoundsEnabled() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

/** Toggle on/off. Returns the new state. */
export function toggleSounds() {
  if (typeof localStorage === "undefined") return false;
  const current = areSoundsEnabled();
  localStorage.setItem(STORAGE_KEY, current ? "false" : "true");
  return !current;
}

/** Force-set state. */
export function setSoundsEnabled(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

/**
 * Play a named sound. Safe to call even if disabled or file missing.
 * Allowed names: ding | tada | whoosh | pop | success
 * Unknown names are ignored.
 */
export function playSound(name) {
  if (!areSoundsEnabled()) return;
  if (typeof Audio === "undefined") return;
  const allowed = ["ding", "tada", "whoosh", "pop", "success"];
  if (!allowed.includes(name)) return;

  try {
    let audio = audioCache.get(name);
    if (!audio) {
      audio = new Audio(`/sounds/${name}.mp3`);
      audio.preload = "auto";
      audio.volume = 0.3;
      audioCache.set(name, audio);
    }
    // Reset to start (in case it's still playing)
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      // Modern browsers return a Promise; swallow autoplay-blocked + 404 errors
      playPromise.catch(() => {});
    }
  } catch (_) {
    // any error → silent no-op
  }
}
