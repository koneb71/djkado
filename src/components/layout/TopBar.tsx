import { motion } from 'motion/react';
import { Disc3, Grid2x2, Keyboard, LayoutPanelLeft, Settings, Music2 } from 'lucide-react';
import { useUi } from '@/store/ui';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { Knob } from '@/ui/Knob';
import { useMixer } from '@/store/mixer';
import { VuMeter } from '../mixer/VuMeter';
import { masterMeter } from '@/store/runtime';
import { RecordButton } from '../recorder/RecordButton';
import { SourceChips } from '../browser/SourceChips';
import { isMacDesktop } from '@/desktop/bridge';

export function TopBar() {
  const layout = useUi((s) => s.layout);
  const setLayout = useUi((s) => s.setLayout);
  const samplerOpen = useUi((s) => s.samplerOpen);
  const setSamplerOpen = useUi((s) => s.setSamplerOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setKeyboardHelpOpen = useUi((s) => s.setKeyboardHelpOpen);
  const master = useMixer((s) => s.master);
  const setMaster = useMixer((s) => s.setMaster);

  return (
    <header className="app-drag relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-gradient-to-b from-panel-2 to-panel px-3" style={isMacDesktop() ? { paddingLeft: 84 } : undefined}>
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 pr-2">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }} className="text-accent">
          <Disc3 size={22} />
        </motion.div>
        <div className="leading-none">
          <div className="text-[15px] font-black tracking-tight">
            DJ<span className="text-accent">Kado</span>
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-text-faint">Browser DJ</div>
        </div>
      </motion.div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <Tooltip label="2 decks">
          <Button size="sm" variant="ghost" active={layout === 2} onClick={() => setLayout(2)} aria-label="2 decks">
            <LayoutPanelLeft size={14} /> 2
          </Button>
        </Tooltip>
        <Tooltip label="4 decks">
          <Button size="sm" variant="ghost" active={layout === 4} onClick={() => setLayout(4)} aria-label="4 decks">
            <Grid2x2 size={14} /> 4
          </Button>
        </Tooltip>
        <Tooltip label="Sampler (S)">
          <Button size="sm" variant="ghost" active={samplerOpen} activeColor="var(--color-deck-c)" onClick={() => setSamplerOpen(!samplerOpen)} aria-label="Sampler">
            <Music2 size={14} /> Sampler
          </Button>
        </Tooltip>
      </div>

      <div className="flex-1" />

      <SourceChips />

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-text-faint">Master</span>
          <VuMeter channel={masterMeter} stereo horizontal width={10} height={110} />
          <Knob value={master} min={0} max={1} defaultValue={0.85} onChange={setMaster} size={34} color="var(--color-text)" format={(v) => `${Math.round(v * 100)}%`} />
        </div>
        <RecordButton />
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <Tooltip label="Keyboard shortcuts (?)">
          <Button size="sm" variant="ghost" square onClick={() => setKeyboardHelpOpen(true)} aria-label="Keyboard shortcuts">
            <Keyboard size={15} />
          </Button>
        </Tooltip>
        <Tooltip label="Settings">
          <Button size="sm" variant="ghost" square onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings size={15} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
