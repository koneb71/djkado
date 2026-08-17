import { useEffect, useState } from 'react';
import { Cpu, Download, Layers, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useStems } from '@/store/stems';
import { StemsQueue } from '@/audio/stems/StemsQueue';
import { ModelCache } from '@/audio/stems/ModelCache';
import { DEFAULT_STEM_MODEL } from '@/audio/stems/models';
import { clearStemsCache, stemsCacheStats } from '@/services/localLibrary/db';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { SectionLabel } from '@/ui/Panel';

const fmtMB = (b: number) => `${(b / 1048576).toFixed(0)} MB`;
const fmtGB = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : fmtMB(b));

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[11px] text-text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function StemsSettings() {
  const webgpu = useStems((s) => s.webgpu);
  const modelCached = useStems((s) => s.modelCached);
  const modelJob = useStems((s) => s.jobs.__model__);
  const autoPrepare = useStems((s) => s.autoPrepare);
  const setAutoPrepare = useStems((s) => s.setAutoPrepare);
  const [cache, setCache] = useState<{ tracks: number; bytes: number }>({ tracks: 0, bytes: 0 });
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void StemsQueue.probe();
    stemsCacheStats().then(setCache);
    navigator.storage?.estimate?.().then((e) => setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {});
  }, [modelCached]);

  const downloading = modelJob?.state === 'downloading';

  return (
    <section className="md:col-span-2">
      <SectionLabel className="mb-1">Stems (on-device separation)</SectionLabel>
      <Row label="Engine" hint={webgpu === null ? 'Probing…' : webgpu ? 'WebGPU available — ~30 s per 4-min track' : 'No WebGPU — CPU (WASM) fallback, ~5 min per track. Chrome/Edge/Electron on macOS/Windows have WebGPU.'}>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${webgpu ? 'bg-success/15 text-success' : 'bg-panel-3 text-text-dim'}`}>{webgpu ? <Zap size={11} /> : <Cpu size={11} />} {webgpu ? 'WebGPU' : 'CPU'}</span>
      </Row>
      <Row label={`Model · ${DEFAULT_STEM_MODEL.name}`} hint={`${fmtMB(DEFAULT_STEM_MODEL.bytes)} · ${DEFAULT_STEM_MODEL.license} · downloaded from Hugging Face on first use and cached${downloading ? ` — ${Math.round((modelJob?.progress ?? 0) * 100)}%` : ''}`}>
        <div className="flex gap-1">
          {!modelCached && (
            <Button size="xs" onClick={() => StemsQueue.prefetchModel().then(() => toast.success('Stem model downloaded')).catch((e) => toast.error(e.message))} disabled={downloading}>
              <Download size={12} /> {downloading ? 'Downloading…' : 'Download now'}
            </Button>
          )}
          {modelCached && (
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                await ModelCache.delete(DEFAULT_STEM_MODEL);
                useStems.getState().setCaps({ modelCached: false });
                toast.success('Model removed from cache');
              }}
            >
              <Trash2 size={12} /> Remove model
            </Button>
          )}
        </div>
      </Row>
      <Row label="Auto-prepare stems" hint="Start separation automatically when a track is loaded (uses GPU/CPU in the background)">
        <Toggle checked={autoPrepare} onChange={setAutoPrepare} />
      </Row>
      <Row label="Stems cache" hint={`${cache.tracks} track${cache.tracks === 1 ? '' : 's'} · ${fmtGB(cache.bytes)}${quota ? ` · storage used ${fmtGB(quota.usage)} of ${fmtGB(quota.quota)}` : ''} · oldest are evicted automatically`}>
        <Button
          size="xs"
          variant="danger"
          disabled={!cache.tracks}
          onClick={async () => {
            await clearStemsCache();
            useStems.setState({ ready: {} });
            setCache({ tracks: 0, bytes: 0 });
            toast.success('Stems cache cleared');
          }}
        >
          <Layers size={12} /> Clear
        </Button>
      </Row>
    </section>
  );
}
