import { motion } from 'motion/react';
import { useSource } from '@/services/sources';
import { useLibrary } from '@/store/library';
import { useUi } from '@/store/ui';
import { cn } from '@/ui/cn';
import { Tooltip } from '@/ui/Tooltip';

const SpotifyIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0a12 12 0 100 24 12 12 0 000-24zm5.5 17.3a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 01-.33-1.46c4.57-1.05 8.5-.6 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 01-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 01-.54-1.79c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.31 1.28zm.13-3.4C15.24 8.33 8.83 8.12 5.13 9.24a1.12 1.12 0 01-.65-2.15c4.25-1.29 11.3-1.04 15.75 1.6a1.12 1.12 0 01-1.13 1.94z" />
  </svg>
);
const AppleIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.81-1.42-.14-2.77.84-3.49.84-.72 0-1.83-.82-3.01-.8-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.73c1.24-.02 2.03-1.13 2.79-2.24.88-1.29 1.24-2.53 1.26-2.6-.03-.01-2.42-.93-2.46-3.72zM14.1 5.83c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.78-.97 2.83 1.03.08 2.07-.52 2.71-1.29z" />
  </svg>
);

function Chip({ id }: { id: 'spotify' | 'apple' }) {
  const { src, status } = useSource(id);
  const setSource = useLibrary((s) => s.setSource);
  const setLibraryOpen = useUi((s) => s.setLibraryOpen);
  const color = id === 'spotify' ? '#1DB954' : '#fa2d48';
  const ready = status === 'ready';
  return (
    <Tooltip label={ready ? `${src.name}: ${src.account()?.displayName ?? 'connected'}${src.mock ? ' (mock)' : ''}` : `${src.name}: not connected — click to open`}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          setSource(id);
          setLibraryOpen(true);
        }}
        className={cn('flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors', ready ? 'border-transparent' : 'border-border text-text-faint hover:text-text-dim')}
        style={ready ? { color, background: color + '1f', borderColor: color + '66' } : undefined}
      >
        {id === 'spotify' ? <SpotifyIcon /> : <AppleIcon />}
        {src.name}
        <span className={cn('h-1.5 w-1.5 rounded-full', status === 'connecting' && 'animate-pulse')} style={{ background: ready ? color : status === 'connecting' ? '#f59e0b' : '#3a4250' }} />
      </motion.button>
    </Tooltip>
  );
}

export function SourceChips() {
  return (
    <div className="flex items-center gap-1.5">
      <Chip id="spotify" />
      <Chip id="apple" />
    </div>
  );
}
