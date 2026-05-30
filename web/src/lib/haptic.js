/**
 * Haptic feedback utility (mobile only — desktop browsers silently no-op).
 *
 * Usage:
 *   import { vibrate, areHapticsEnabled, toggleHaptics } from "../lib/haptic.js";
 *   vibrate("light");    // single short tick — button tap
 *   vibrate("medium");   // short-medium-short — selection change
 *   vibrate("heavy");    // long buzz — important action
 *   vibrate("success");  // 5-pulse pattern — tier-up / quest complete
 *   vibrate("error");    // 3-pulse heavy — validation error
 *
 * Defaults: enabled (opt-out via localStorage). Web Vibration API is silent on
 * iOS Safari, but no-ops cleanly. User can disable via toggleHaptics().
 */

const STORAGE_KEY = "vowvet_haptics_enabled";

const PATTERNS = {
  light:   10,
  medium:  [10, 50, 10],
  heavy:   [30, 100, 30],
  success: [10, 50, 10, 50, 10],
  error:   [50, 100, 50],
};

/** Default: ENABLED (opt-out). Returns boolean. */
export function areHapticsEnabled() {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === "true";
}

export function toggleHaptics() {
  if (typeof localStorage === "undefined") return true;
  const current = areHapticsEnabled();
  localStorage.setItem(STORAGE_KEY, current ? "false" : "true");
  return !current;
}

export function setHapticsEnabled(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

/**
 * Trigger haptic feedback. Falls back to no-op on:
 *   - Desktop browsers (no navigator.vibrate)
 *   - iOS Safari (vibration API not implemented — calls return undefined cleanly)
 *   - When haptics disabled via toggle
 */
export function vibrate(pattern = "light") {
  if (!areHapticsEnabled()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const p = PATTERNS[pattern] || PATTERNS.light;
  try {
    navigator.vibrate(p);
  } catch (_) {
    // any error → silent
  }
}
