import type { DeckId } from './types';

export type CrossfaderCurve = 'linear' | 'power' | 'cut';
export type XfAssign = 'A' | 'B' | 'thru';

/** Compute per-side gains for crossfader position x ∈ [-1, 1] (-1 = full A/left). */
export function crossfaderGains(x: number, curve: CrossfaderCurve): { left: number; right: number } {
  const t = (Math.max(-1, Math.min(1, x)) + 1) / 2; // 0..1
  switch (curve) {
    case 'linear':
      return { left: 1 - t, right: t };
    case 'power':
      return { left: Math.cos((t * Math.PI) / 2), right: Math.sin((t * Math.PI) / 2) };
    case 'cut': {
      const edge = 0.06;
      const left = t <= 1 - edge ? 1 : Math.max(0, (1 - t) / edge);
      const right = t >= edge ? 1 : Math.max(0, t / edge);
      return { left, right };
    }
  }
}

export class Crossfader {
  position = 0; // -1..1
  curve: CrossfaderCurve = 'power';
  assign: Record<DeckId, XfAssign> = { A: 'A', B: 'B', C: 'A', D: 'B' };

  /** Gain multiplier for a given deck. */
  gainFor(deck: DeckId): number {
    const side = this.assign[deck];
    if (side === 'thru') return 1;
    const g = crossfaderGains(this.position, this.curve);
    return side === 'A' ? g.left : g.right;
  }
}
