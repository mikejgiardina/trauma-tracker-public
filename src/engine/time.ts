/** Relative-time helpers. "T+MM:SS" (or "T+H:MM:SS") ⇄ seconds. */

export function parseTRel(t: string): number {
  const m = /T\+(?:(\d+):)?(\d+):(\d+)/.exec(t.trim());
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3], 10);
  return h * 3600 + mm * 60 + ss;
}

export function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `T+${mm}:${String(ss).padStart(2, '0')}`;
}
