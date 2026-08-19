import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';

/**
 * localStorage adapter that coalesces writes.
 * Zustand's persist writes synchronously on every state change; for stores driven by knob drags
 * (FX params, sampler pads) that is a JSON.stringify + localStorage write per animation frame,
 * which stutters on phones. Reads stay synchronous so rehydration is unchanged.
 */
export function throttledStorage<T>(ms = 400): PersistStorage<T> | undefined {
  const base = createJSONStorage<T>(() => localStorage);
  if (!base) return undefined;
  const pending = new Map<string, StorageValue<T>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    for (const [name, value] of pending) base.setItem(name, value);
    pending.clear();
  };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  return {
    getItem: base.getItem,
    removeItem: (name) => {
      pending.delete(name);
      return base.removeItem(name);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer === null) timer = setTimeout(flush, ms);
    },
  };
}
