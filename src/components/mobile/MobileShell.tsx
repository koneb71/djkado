import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Toaster } from 'sonner';
import { Disc3, Library, Settings, SlidersHorizontal, Music2, Layers, Sparkles, Circle, Square } from 'lucide-react';
import { useAudioUnlocked, useEngineTick } from '@/hooks/useEngine';
import { AudioUnlockOverlay } from '../overlays/AudioUnlockOverlay';
import { SettingsDialog } from '../settings/SettingsDialog';
import { KeyboardHelp } from '../settings/KeyboardHelp';
import { LibraryBrowser } from '../browser/LibraryBrowser';
import { SamplerPanel } from '../sampler/SamplerPanel';
import { StemsPanel } from '../deck/StemsPanel';
import { FxPanel } from '../fx/FxPanel';
import { MobileDeck } from './MobileDeck';
import { MobileMiniMixer } from './MobileMixer';
import { MobileMixerFull } from './MobileMixerFull';
import { useMobileUi, type MobileTab } from '@/mobile/store';
import { usePortrait } from '@/mobile/useIsMobile';
import { useNativeApp, tap } from '@/mobile/native';
import { useUi } from '@/store/ui';
import { useRecorder } from '@/audio/engine/Recorder';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { masterMeter } from '@/store/runtime';
import { VuMeter } from '../mixer/VuMeter';
import { StemsQueue } from '@/audio/stems/StemsQueue';
import { deckColor } from '../deck/deckTheme';
import { formatTime } from '@/audio/dsp/math';
import { cn } from '@/ui/cn';
import type { DeckId } from '@/audio/engine/types';

const TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'decks', label: 'Decks', icon: <Disc3 size={20} /> },
  { id: 'library', label: 'Library', icon: <Library size={20} /> },
  { id: 'mix', label: 'Mix · FX', icon: <SlidersHorizontal size={20} /> },
  { id: 'sampler', label: 'Sampler', icon: <Music2 size={20} /> },
];

/** Phone / small-tablet shell: touch-first, portrait-first, bottom tab navigation. */
export function MobileShell() {
  const unlocked = useAudioUnlocked();
  useEngineTick(unlocked);
  useNativeApp();
  const tab = useMobileUi((s) => s.tab);
  const setTab = useMobileUi((s) => s.setTab);
  const portrait = usePortrait();
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const recording = useRecorder((s) => s.recording);
  const elapsed = useRecorder((s) => s.elapsed);

  useEffect(() => {
    document.title = 'DJKado';
    document.documentElement.classList.add('mobile');
    void StemsQueue.probe();
    return () => document.documentElement.classList.remove('mobile');
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-bg text-text" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
        <Disc3 size={18} className="text-accent" />
        <span className="text-sm font-black tracking-tight">
          DJ<span className="text-accent">Kado</span>
        </span>
        <div className="flex-1" />
        <VuMeter channel={masterMeter} stereo horizontal width={8} height={70} />
        <button
          type="button"
          onClick={() => {
            tap();
            AudioEngine.recorder.toggle();
          }}
          className={cn('flex h-8 items-center gap-1 rounded-md border px-2 font-mono text-[10px] font-bold', recording ? 'border-rec/60 bg-rec/15 text-rec' : 'border-border bg-panel-3 text-text-dim')}
          aria-label="Record"
        >
          {recording ? <Square size={10} fill="currentColor" /> : <Circle size={10} fill="currentColor" className="text-rec" />}
          {recording ? formatTime(elapsed) : 'REC'}
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-text-dim" aria-label="Settings">
          <Settings size={18} />
        </button>
      </header>

      {/* content */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <motion.div key={tab} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="absolute inset-0 flex flex-col">
            {tab === 'decks' &&
              (portrait ? (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
                  <MobileDeck id="A" />
                  <MobileMiniMixer />
                  <MobileDeck id="B" />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 gap-1.5 p-1.5">
                  <MobileDeck id="A" landscape />
                  <MobileMiniMixer vertical />
                  <MobileDeck id="B" landscape />
                </div>
              ))}
            {tab === 'library' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <LibraryBrowser />
              </div>
            )}
            {tab === 'mix' && <MixTab />}
            {tab === 'sampler' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-auto p-1.5">
                <SamplerPanel mobile />
              </div>
            )}
          </motion.div>
      </main>

      {/* tab bar */}
      <nav className="flex shrink-0 items-stretch border-t border-border bg-panel" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              tap();
              setTab(t.id);
            }}
            className={cn('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold', tab === t.id ? 'text-accent' : 'text-text-faint')}
            aria-current={tab === t.id}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {!unlocked && <AudioUnlockOverlay />}
      <SettingsDialog />
      <KeyboardHelp />
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: 'var(--color-panel-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } }} />
    </div>
  );
}

function MixTab() {
  const deck = useMobileUi((s) => s.mixDeck);
  const setDeck = useMobileUi((s) => s.setMixDeck);
  const section = useMobileUi((s) => s.mixSection);
  const setSection = useMobileUi((s) => s.setMixSection);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md bg-bg-elev p-0.5">
          {(['A', 'B'] as DeckId[]).map((d) => (
            <button key={d} type="button" onClick={() => setDeck(d)} className={cn('h-8 rounded px-4 text-xs font-black', deck === d ? 'bg-panel-3' : 'text-text-faint')} style={deck === d ? { color: deckColor(d) } : undefined}>
              Deck {d}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-md bg-bg-elev p-0.5">
          {(
            [
              ['mixer', 'EQ', <SlidersHorizontal key="m" size={12} />],
              ['stems', 'Stems', <Layers key="s" size={12} />],
              ['fx', 'FX', <Sparkles key="f" size={12} />],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} type="button" onClick={() => setSection(id)} className={cn('flex h-8 items-center gap-1 rounded px-3 text-[11px] font-semibold', section === id ? 'bg-panel-3 text-text' : 'text-text-faint')}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {section === 'mixer' && <MobileMixerFull />}
        {section === 'stems' && (
          <div className="panel p-2">
            <StemsPanel id={deck} mobile />
          </div>
        )}
        {section === 'fx' && (
          <div className="panel p-2">
            <FxPanel id={deck} mobile />
          </div>
        )}
      </div>
    </div>
  );
}
