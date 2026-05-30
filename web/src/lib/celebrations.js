/**
 * Visual celebrations — pure CSS/JS, zero dependencies.
 *
 * 4 functions:
 *   celebrateConfetti(opts?)              — 30 colored particles fall from top
 *   celebrateHearts(buttonElement)        — 6 hearts float up from a clicked element
 *   celebrateSparkles(element)            — 8 stars twinkle around an element
 *   celebrateBadgeCollect(emoji, targetEl) — slide badge to target with arc
 *
 * Pattern: append throwaway DOM nodes that animate via CSS keyframes (injected once),
 * then auto-remove after animation completes. No state, no globals, no leaks.
 */

// Inject keyframes once on module load
function ensureStyles() {
  if (document.getElementById("vowvet-celebrations-style")) return;
  const style = document.createElement("style");
  style.id = "vowvet-celebrations-style";
  style.textContent = `
    @keyframes vv-confetti-fall {
      0%   { opacity: 1; transform: translate(0, 0) rotate(0deg); }
      100% { opacity: 0; transform: translate(var(--dx, 0), 105vh) rotate(720deg); }
    }
    .vv-confetti {
      position: fixed; top: -10px; width: 10px; height: 18px; border-radius: 2px;
      pointer-events: none; z-index: 99999;
      animation: vv-confetti-fall 3s ease-in forwards;
    }

    @keyframes vv-heart-float {
      0%   { opacity: 1; transform: translate(-50%, 0) scale(0.5); }
      50%  { opacity: 1; transform: translate(calc(-50% + var(--dx, 0)), -80px) scale(1.4); }
      100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0)), -160px) scale(0.8); }
    }
    .vv-heart {
      position: fixed; pointer-events: none; z-index: 99999;
      font-size: 32px; line-height: 1;
      animation: vv-heart-float 1.8s ease-out forwards;
      will-change: transform, opacity;
    }

    @keyframes vv-sparkle-twinkle {
      0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(0deg); }
      50%      { opacity: 1; transform: translate(-50%, -50%) scale(1.2) rotate(180deg); }
    }
    .vv-sparkle {
      position: absolute; pointer-events: none; z-index: 99999;
      font-size: 20px; line-height: 1;
      animation: vv-sparkle-twinkle 1.4s ease-in-out forwards;
    }

    @keyframes vv-badge-slide {
      0%   { opacity: 1; transform: translate(-50%, -50%) scale(2); }
      80%  { opacity: 1; }
      100% { opacity: 0; transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(0.4); }
    }
    .vv-badge {
      position: fixed; top: 50%; left: 50%; pointer-events: none; z-index: 99999;
      font-size: 48px; line-height: 1;
      animation: vv-badge-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      will-change: transform, opacity;
    }
  `;
  document.head.appendChild(style);
}

const CONFETTI_COLORS = ["#fbbf24", "#ec4899", "#8b5cf6", "#06b6d4", "#10b981", "#f97316"];

/** Drop N confetti particles from top. opts: { count, durationMs, colors }. */
export function celebrateConfetti(opts = {}) {
  ensureStyles();
  const count = opts.count || 30;
  const colors = opts.colors || CONFETTI_COLORS;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "vv-confetti";
    el.style.left = `${5 + Math.random() * 90}%`;
    el.style.background = colors[i % colors.length];
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 400}px`);
    el.style.animationDelay = `${Math.random() * 0.5}s`;
    frag.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  document.body.appendChild(frag);
}

/** Float hearts up from a clicked element (e.g., a "like" button). */
export function celebrateHearts(target) {
  ensureStyles();
  if (!(target instanceof Element)) return;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hearts = ["❤️", "💕", "💜", "💖", "💗", "💞"];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement("div");
    el.className = "vv-heart";
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 100}px`);
    el.style.animationDelay = `${i * 0.08}s`;
    el.textContent = hearts[i % hearts.length];
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

/** Sparkle stars around an element. */
export function celebrateSparkles(target) {
  ensureStyles();
  if (!(target instanceof Element)) return;
  // Need a positioned parent for absolute sparkles. Add a temporary container.
  const rect = target.getBoundingClientRect();
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:99999;`;
  const stars = ["✨", "⭐", "🌟", "💫"];
  for (let i = 0; i < 8; i++) {
    const el = document.createElement("span");
    el.className = "vv-sparkle";
    el.style.left = `${Math.random() * 100}%`;
    el.style.top = `${Math.random() * 100}%`;
    el.style.animationDelay = `${i * 0.1}s`;
    el.textContent = stars[i % stars.length];
    container.appendChild(el);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1800);
}

/** Slide a badge emoji from center to a target element with arc + shrink. */
export function celebrateBadgeCollect(emoji, target) {
  ensureStyles();
  const el = document.createElement("div");
  el.className = "vv-badge";
  el.textContent = emoji || "🏆";
  if (target instanceof Element) {
    const rect = target.getBoundingClientRect();
    const tx = rect.left + rect.width / 2 - window.innerWidth / 2;
    const ty = rect.top + rect.height / 2 - window.innerHeight / 2;
    el.style.setProperty("--tx", `${tx}px`);
    el.style.setProperty("--ty", `${ty}px`);
  } else {
    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "200px");
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
