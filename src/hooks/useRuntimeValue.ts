import { useEffect, useState } from 'react';
import type { Channel } from '@/store/runtime';

/** Subscribe a React component to a runtime channel at a throttled rate (default 10 Hz). */
export function useRuntimeValue<T>(ch: Channel<T>, hz = 10): T {
  const [v, setV] = useState(ch.get());
  useEffect(() => {
    let last = 0;
    let latest = ch.get();
    let raf = 0;
    const unsub = ch.subscribe((x) => {
      latest = x;
      const now = performance.now();
      if (now - last >= 1000 / hz) {
        last = now;
        setV(x);
      } else if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          last = performance.now();
          setV(latest);
        });
      }
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ch, hz]);
  return v;
}
