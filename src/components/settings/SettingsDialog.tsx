import { useEffect, useState } from 'react';
import { Trash2, Radio, FolderSync } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { useUi } from '@/store/ui';
import { Toggle } from '@/ui/Toggle';
import { Button } from '@/ui/Button';
import { SectionLabel } from '@/ui/Panel';
import { useRecorder } from '@/audio/engine/Recorder';
import { useMidiStore, ACTION_LABELS_LIST } from './midiHelpers';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { cn } from '@/ui/cn';
import type { DeckId } from '@/audio/engine/types';
import { DesktopSettings } from './DesktopSettings';
import { StemsSettings } from './StemsSettings';
import { isDesktop } from '@/desktop/bridge';

function LatencyInfo() {
  const ctx = AudioEngine.ctx;
  return (
    <span className="font-mono text-xs text-text-dim">
      {Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000)} ms · {ctx.sampleRate} Hz
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[11px] text-text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const vinyl = useUi((s) => s.vinylMode);
  const setVinyl = useUi((s) => s.setVinylMode);
  const format = useRecorder((s) => s.format);
  const midi = useMidiStore();
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [outputId, setOutputId] = useState('default');
  const [learnDeck, setLearnDeck] = useState<DeckId>('A');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const canSink = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices?.enumerateDevices?.().then((d) => setOutputs(d.filter((x) => x.kind === 'audiooutput'))).catch(() => {});
    LocalLibrary.savedFolders().then((f) => setFolders(f.map((x) => ({ id: x.id, name: x.name }))));
  }, [open]);

  const chooseOutput = async (id: string) => {
    setOutputId(id);
    try {
      await (AudioEngine.ctx as any).setSinkId(id === 'default' ? '' : id);
      toast.success('Audio output changed');
    } catch (e: any) {
      toast.error(`Could not switch output: ${e?.message ?? e}`);
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Settings" width={680}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <SectionLabel className="mb-1">Audio</SectionLabel>
          <Row label="Output device" hint={canSink ? 'Master output (Chrome/Edge). Use a multi-output device for headphone cue.' : 'Output switching needs Chrome/Edge.'}>
            <select value={outputId} onChange={(e) => chooseOutput(e.target.value)} disabled={!canSink} className="h-7 max-w-[200px] rounded border border-border bg-bg-elev px-1 text-xs">
              <option value="default">System default</option>
              {outputs.map((o) => (
                <option key={o.deviceId} value={o.deviceId}>
                  {o.label || o.deviceId.slice(0, 8)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Latency" hint="Interactive AudioContext (lowest available)">
            <LatencyInfo />
          </Row>
          <Row label="Vinyl mode" hint="Platter top scratches; outer ring nudges">
            <Toggle checked={vinyl} onChange={setVinyl} />
          </Row>
          <Row label="Recording format">
            <div className="flex gap-1">
              {(['webm', 'wav'] as const).map((f) => (
                <Button key={f} size="xs" active={format === f} onClick={() => useRecorder.setState({ format: f })}>
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </Row>
        </section>

        <section>
          <SectionLabel className="mb-1">Library</SectionLabel>
          <Row label="Saved folders" hint="Re-scan folders you granted access to (Chrome/Edge)">
            <Button size="xs" onClick={() => LocalLibrary.restoreFolders().then((n) => toast.success(`Re-scanned ${n} folder${n === 1 ? '' : 's'}`))}>
              <FolderSync size={12} /> Re-scan
            </Button>
          </Row>
          <div className="flex flex-col gap-1">
            {folders.length === 0 && <div className="text-[11px] text-text-faint">No saved folders yet — use “Add folder” in the library.</div>}
            {folders.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded bg-bg-elev px-2 py-1 text-xs">
                <span className="truncate">{f.name}</span>
                <button type="button" className="text-text-faint hover:text-danger" onClick={() => LocalLibrary.forgetFolder(f.id).then(() => setFolders((x) => x.filter((y) => y.id !== f.id)))} aria-label="Forget folder">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <StemsSettings />

        {isDesktop() && <DesktopSettings />}

        <section className="md:col-span-2">
          <SectionLabel className="mb-1">MIDI controllers</SectionLabel>
          {!midi.supported && <div className="text-[11px] text-text-faint">Web MIDI is not available in this browser (Chrome/Edge/Opera support it).</div>}
          {midi.supported && (
            <>
              <Row label="Enable MIDI" hint={midi.inputs.length ? `${midi.inputs.length} input${midi.inputs.length === 1 ? '' : 's'}: ${midi.inputs.map((i) => i.name).join(', ')}` : 'Grant access, then plug in a controller'}>
                <Toggle checked={midi.enabled} onChange={midi.setEnabled} />
              </Row>
              {midi.enabled && (
                <div className="mt-2 rounded-md border border-border bg-bg-elev p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <Radio size={12} className={cn(midi.lastMessage && 'text-accent')} />
                    <span className="text-text-dim">Last message:</span>
                    <span className="font-mono">{midi.lastMessage ? `${midi.lastMessage.type} ch${midi.lastMessage.channel + 1} #${midi.lastMessage.number} = ${midi.lastMessage.value}` : '—'}</span>
                    <div className="flex-1" />
                    <span className="text-text-dim">Learn for deck</span>
                    {(['A', 'B', 'C', 'D'] as DeckId[]).map((d) => (
                      <Button key={d} size="xs" active={learnDeck === d} onClick={() => setLearnDeck(d)}>
                        {d}
                      </Button>
                    ))}
                  </div>
                  <div className="grid max-h-56 grid-cols-2 gap-1 overflow-auto md:grid-cols-3">
                    {ACTION_LABELS_LIST.map(([action, label]) => {
                      const learning = midi.learning?.action === action && midi.learning.deck === (action.startsWith('deck.') || action.startsWith('mixer.') ? learnDeck : undefined);
                      const mapped = midi.mappings.filter((m) => m.action === action && (m.deck ?? undefined) === (action.startsWith('deck.') || action.startsWith('mixer.') ? learnDeck : undefined));
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => (learning ? midi.cancelLearn() : midi.startLearn(action, action.startsWith('deck.') || action.startsWith('mixer.') ? learnDeck : undefined))}
                          className={cn('flex items-center justify-between rounded border px-2 py-1 text-left text-[11px]', learning ? 'animate-pulse border-accent bg-accent/10 text-accent' : mapped.length ? 'border-success/40 bg-success/10 text-text' : 'border-border text-text-dim hover:border-border-2')}
                        >
                          <span className="truncate">{label}</span>
                          <span className="ml-2 shrink-0 font-mono text-[9px] text-text-faint">{learning ? 'move a control…' : mapped.length ? `${mapped[0].type} ${mapped[0].number}` : 'learn'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button size="xs" variant="danger" onClick={() => midi.clearMappings()}>
                      <Trash2 size={11} /> Clear all mappings
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
