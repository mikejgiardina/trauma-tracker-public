/** Small presentational helpers shared across the board + report. */

export const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function tRel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `T+${mm}:${String(ss).padStart(2, '0')}`;
}

/** tailwind text color for a charge/measure/obligation status. */
export function statusColor(status: string): string {
  switch (status) {
    case 'billed':
    case 'met':
    case 'satisfied': return 'text-ok';
    case 'held':
    case 'open':
    case 'ambiguous':
    case 'missing': return 'text-warn';
    case 'unresolved':
    case 'missed':
    case 'declined': return 'text-crit';
    default: return 'text-text-dim';
  }
}

export function statusDot(status: string): string {
  switch (status) {
    case 'billed':
    case 'met':
    case 'satisfied': return 'bg-ok';
    case 'held':
    case 'open':
    case 'ambiguous':
    case 'missing': return 'bg-warn';
    case 'unresolved':
    case 'missed':
    case 'declined': return 'bg-crit';
    default: return 'bg-text-dim';
  }
}
