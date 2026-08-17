import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const MOBILE_QUERY = '(max-width: 900px), ((pointer: coarse) and (max-width: 1100px))';

/** True on phones/small tablets (or any Capacitor-native runtime below ~1000 px). */
export function isMobileNow(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform() && window.innerWidth < 1000) return true;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [m, setM] = useState(isMobileNow);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setM(isMobileNow());
    mq.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => {
      mq.removeEventListener('change', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return m;
}

export function usePortrait(): boolean {
  const [p, setP] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia('(orientation: portrait)').matches));
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => setP(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return p;
}

export const isNative = () => Capacitor.isNativePlatform();

/** True on short desktop windows (< 980 px tall) — used to shrink fixed-height controls like the mixer. */
export function useShortViewport(): boolean {
  const [s, setS] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia('(max-height: 979px)').matches));
  useEffect(() => {
    const mq = window.matchMedia('(max-height: 979px)');
    const on = () => setS(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return s;
}
