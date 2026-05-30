# VowVet sound effects

`web/src/lib/sounds.js` looks up MP3s from `/sounds/<name>.mp3`. **All 5 are optional** — missing files silently no-op.

Expected file names (drop in this folder when ready):

- `ding.mp3` — achievement unlock (~0.5s clean bell)
- `tada.mp3` — tier-up celebration (~1s celebratory)
- `whoosh.mp3` — voucher claim (~0.3s swoosh)
- `pop.mp3` — button tap (~0.1s subtle pop)
- `success.mp3` — quest complete (~0.5s positive chime)

**File requirements:**
- Format: MP3 (most compatible across iOS Safari + Chrome + Firefox)
- Size: ≤ 50KB each (these play often, keep payload tiny)
- Volume: leave headroom — `sounds.js` plays at 0.3 volume already
- Length: ≤ 1 second (avoid jarring on rapid taps)

**Sources for free assets** (CC0/Public Domain):
- https://freesound.org (CC0 filter)
- https://mixkit.co/free-sound-effects/
- https://www.zapsplat.com/ (free with attribution)

**Without files:**
- `playSound("ding")` returns immediately, no console errors
- User toggle in Settings still works (just enables silent no-ops)
- App runs silent — no UX broken

Sounds are **opt-in** by default (`localStorage.vowvet_sounds_enabled = "false"`) so users only hear them if they explicitly turn it on.
