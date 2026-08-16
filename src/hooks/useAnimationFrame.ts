import { useEffect, useRef } from 'react';

type FrameCb = (now: number, dt: number) => void;
const callbacks = new Set<FrameCb>();
let running = false;
let last = 0;

function loop(now: number) {
  const dt = last ? now - last : 16;
  last = now;
  callbacks.forEach((cb) => {
    try {
      cb(now, dt);
    } catch (e) {
      console.error(e);
    }
  });
  if (callbacks.size) requestAnimationFrame(loop);
  else running = false;
}

/** Register a callback on the single shared requestAnimationFrame loop. */
export function addFrameCallback(cb: FrameCb): () => void {
  callbacks.add(cb);
  if (!running) {
    running = true;
    last = 0;
    requestAnimationFrame(loop);
  }
  return () => callbacks.delete(cb);
}

export function useAnimationFrame(cb: FrameCb, enabled = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!enabled) return;
    return addFrameCallback((now, dt) => ref.current(now, dt));
  }, [enabled]);
}
