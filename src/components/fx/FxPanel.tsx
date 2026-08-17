import { motion } from 'motion/react';
import { Power } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { FX_KINDS, type FxKind, type FxParamSpec } from '@/audio/fx/FxUnit';
import { useFx } from '@/store/fx';
import { Knob } from '@/ui/Knob';
import { deckColor } from '../deck/deckTheme';
import { cn } from '@/ui/cn';

function fmtParam(spec: FxParamSpec, v: number) {
  if (spec.steps) {
    const s = spec.steps[Math.round(v)] ?? 1;
    return s < 1 ? `1/${Math.round(1 / s)}` : `${s}`;
  }
  if (spec.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  if (spec.unit === 's') return `${(v * 1000).toFixed(0)}ms`;
  return spec.max <= 1 ? `${Math.round(v * 100)}%` : v.toFixed(spec.max > 20 ? 0 : 1);
}

export function FxPanel({ id, mobile }: { id: DeckId; mobile?: boolean }) {
  const slots = useFx((s) => s.decks[id]);
  const setSlot = useFx((s) => s.setSlot);
  const color = deckColor(id);
  const chain = AudioEngine.deck(id).strip.fx;

  const choose = (i: number, kind: FxKind | null) => {
    const unit = chain.setSlot(i, kind);
    const params: Record<string, number> = {};
    unit?.params.forEach((p) => (params[p.name] = p.default));
    unit?.setMix(slots[i].mix);
    unit?.setEnabled(slots[i].enabled);
    setSlot(id, i, { kind, params });
  };

  return (
    <motion.div className="overflow-hidden">
      <div className={cn('grid gap-2', mobile ? 'grid-cols-1' : 'grid-cols-3')}>
        {slots.map((slot, i) => {
          const unit = chain.slots[i];
          return (
            <div key={i} className={cn('panel-inset flex items-center gap-2 px-2 py-1.5', mobile && 'flex-wrap gap-3 py-2')}>
              <div className="flex flex-col gap-1">
                <select
                  className="h-6 w-[74px] rounded border border-border bg-panel-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={slot.kind ?? ''}
                  onChange={(e) => choose(i, (e.target.value || null) as FxKind | null)}
                >
                  <option value="">— none —</option>
                  {FX_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!slot.kind}
                  onClick={() => {
                    unit?.setEnabled(!slot.enabled);
                    setSlot(id, i, { enabled: !slot.enabled });
                  }}
                  className={cn('flex h-6 items-center justify-center gap-1 rounded border text-[10px] font-bold uppercase disabled:opacity-40', slot.enabled ? 'border-transparent' : 'border-border bg-panel-2 text-text-dim')}
                  style={slot.enabled ? { background: color + '22', color, borderColor: color, boxShadow: `0 0 10px ${color}55` } : undefined}
                >
                  <Power size={10} /> {slot.enabled ? 'On' : 'Off'}
                </button>
              </div>
              <Knob
                size={36}
                label="Mix"
                value={slot.mix}
                min={0}
                max={1}
                defaultValue={0.5}
                color={color}
                disabled={!slot.kind}
                onChange={(v) => {
                  unit?.setMix(v);
                  setSlot(id, i, { mix: v });
                }}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              {unit?.params.map((p) => (
                <Knob
                  key={p.name}
                  size={36}
                  label={p.label}
                  value={slot.params[p.name] ?? p.default}
                  min={p.min}
                  max={p.max}
                  defaultValue={p.default}
                  color={color}
                  onChange={(v) => {
                    unit.setParam(p.name, v);
                    setSlot(id, i, { params: { ...slot.params, [p.name]: v } });
                  }}
                  format={(v) => fmtParam(p, v)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
