import type { Transition, Variants } from 'motion/react';

export const spring: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 };
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 32 };
export const springSoft: Transition = { type: 'spring', stiffness: 180, damping: 24 };
export const easeOut: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: 24, transition: { duration: 0.18 } },
};

export const stagger = (delay = 0.04): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: delay } },
});
