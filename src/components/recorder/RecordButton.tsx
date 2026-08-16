import { motion } from 'motion/react';
import { Circle, Square } from 'lucide-react';
import { toast } from 'sonner';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { useRecorder } from '@/audio/engine/Recorder';
import { Tooltip } from '@/ui/Tooltip';
import { formatTime } from '@/audio/dsp/math';
import { cn } from '@/ui/cn';

export function RecordButton() {
  const recording = useRecorder((s) => s.recording);
  const elapsed = useRecorder((s) => s.elapsed);
  const toggle = () => {
    if (!AudioEngine.recorder.supported) return toast.error('Recording is not supported in this browser');
    if (recording) {
      AudioEngine.recorder.stop();
      toast.success('Recording saved — download started');
    } else {
      AudioEngine.recorder.start();
      toast('Recording master output', { icon: '⏺' });
    }
  };
  return (
    <Tooltip label={recording ? 'Stop recording' : 'Record master mix'}>
      <motion.button
        type="button"
        onClick={toggle}
        whileTap={{ scale: 0.95 }}
        className={cn('flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-accent', recording ? 'border-rec/60 bg-rec/15 text-rec' : 'border-border bg-panel-3 text-text-dim hover:text-text')}
        style={recording ? { boxShadow: '0 0 14px rgba(239,68,68,0.45)' } : undefined}
        aria-pressed={recording}
        aria-label="Record"
      >
        {recording ? <Square size={11} fill="currentColor" /> : <Circle size={11} fill="currentColor" className="text-rec" />}
        <span className={cn('font-mono tabular', recording && 'rec-blink')}>{recording ? formatTime(elapsed) : 'REC'}</span>
      </motion.button>
    </Tooltip>
  );
}
