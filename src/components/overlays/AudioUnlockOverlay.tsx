import { motion } from 'motion/react';
import { Headphones } from 'lucide-react';
import { AudioEngine } from '@/audio/engine/AudioEngine';

export function AudioUnlockOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-bg/80 backdrop-blur-md"
      onClick={() => AudioEngine.ensureRunning()}
    >
      <motion.div initial={{ scale: 0.9, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="panel noise flex flex-col items-center gap-4 px-10 py-8 text-center">
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent" style={{ boxShadow: '0 0 40px rgba(34,211,238,0.35)' }}>
          <Headphones size={30} />
        </motion.div>
        <div>
          <div className="text-lg font-bold tracking-tight">Welcome to DJKado</div>
          <div className="mt-1 text-sm text-text-dim">Click anywhere to power on the audio engine</div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">Browsers require a gesture before playing sound</div>
      </motion.div>
    </motion.div>
  );
}
