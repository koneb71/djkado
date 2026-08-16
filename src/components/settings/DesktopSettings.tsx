import { useEffect, useState } from 'react';
import { Download, FolderOpen, KeyRound, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { desktop } from '@/desktop/bridge';
import { Button } from '@/ui/Button';
import { SectionLabel } from '@/ui/Panel';

type UpdateStatus = { state: string; version?: string; percent?: number; message?: string; reason?: string; releasesUrl?: string };

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

/** Settings ▸ Desktop (Electron only): version, updates, Apple Music credentials, data folder. */
export function DesktopSettings() {
  const d = desktop();
  const [version, setVersion] = useState('');
  const [paths, setPaths] = useState<{ userData: string } | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [apple, setApple] = useState({ teamId: '', keyId: '', keyPath: '' });
  const [appleOk, setAppleOk] = useState(false);
  const [buffer, setBuffer] = useState<number | ''>('');

  useEffect(() => {
    if (!d) return;
    d.version().then(setVersion);
    d.paths().then(setPaths);
    d.updateStatus().then(setStatus);
    d.getConfig().then((c) => {
      setApple(c.apple ?? { teamId: '', keyId: '', keyPath: '' });
      setBuffer(c.audioBufferSize ?? '');
    });
    d.appleConfigured().then(setAppleOk);
    return d.onUpdateStatus(setStatus);
  }, [d]);

  if (!d) return null;

  const saveApple = async (patch: Partial<typeof apple>) => {
    const next = { ...apple, ...patch };
    setApple(next);
    await d.setConfig({ apple: next });
    setAppleOk(await d.appleConfigured());
  };

  const updateText = (() => {
    switch (status.state) {
      case 'checking': return 'Checking…';
      case 'available': return `Downloading v${status.version}…`;
      case 'downloading': return `Downloading… ${Math.round(status.percent ?? 0)}%`;
      case 'downloaded': return `v${status.version} ready — restart to install`;
      case 'not-available': return `Up to date (v${status.version})`;
      case 'error': return `Update error: ${status.message}`;
      case 'unsupported': return status.reason ?? 'Updates unavailable';
      default: return 'Not checked yet';
    }
  })();

  return (
    <section className="md:col-span-2">
      <SectionLabel className="mb-1">Desktop</SectionLabel>
      <Row label={`DJKado ${version} · ${d.platform === 'darwin' ? 'macOS' : d.platform === 'win32' ? 'Windows' : d.platform}`} hint={updateText}>
        <div className="flex gap-1">
          {status.state === 'downloaded' ? (
            <Button size="xs" variant="primary" onClick={() => d.installUpdate()}>
              <Download size={12} /> Restart & install
            </Button>
          ) : status.state === 'unsupported' ? (
            <Button size="xs" onClick={() => d.openExternal(status.releasesUrl ?? 'https://github.com/koneb71/djkado/releases')}>
              <ExternalLink size={12} /> Releases
            </Button>
          ) : (
            <Button size="xs" onClick={() => d.checkForUpdates().then(setStatus)} disabled={status.state === 'checking' || status.state === 'downloading'}>
              <RefreshCw size={12} /> Check for updates
            </Button>
          )}
        </div>
      </Row>
      <Row label="Data folder" hint={paths?.userData ?? ''}>
        <Button size="xs" onClick={() => d.openDataFolder()}>
          <FolderOpen size={12} /> Open
        </Button>
      </Row>
      <div className="mt-2 rounded-md border border-border bg-bg-elev p-3">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <KeyRound size={13} className={appleOk ? 'text-success' : 'text-text-faint'} />
          <span className="font-medium">Apple Music credentials</span>
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${appleOk ? 'bg-success/15 text-success' : 'bg-panel-3 text-text-faint'}`}>{appleOk ? 'Configured' : 'Not configured'}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="text-[11px] text-text-dim">
            Team ID
            <input value={apple.teamId} onChange={(e) => saveApple({ teamId: e.target.value.trim() })} placeholder="ABCDE12345" className="mt-1 h-7 w-full rounded border border-border bg-panel px-2 font-mono text-xs text-text outline-none focus:border-accent" onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <label className="text-[11px] text-text-dim">
            Key ID
            <input value={apple.keyId} onChange={(e) => saveApple({ keyId: e.target.value.trim() })} placeholder="XXXXXXXXXX" className="mt-1 h-7 w-full rounded border border-border bg-panel px-2 font-mono text-xs text-text outline-none focus:border-accent" onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <div className="text-[11px] text-text-dim">
            Private key (.p8)
            <div className="mt-1 flex items-center gap-1">
              <Button
                size="xs"
                className="h-7"
                onClick={async () => {
                  const r = await d.pickAppleKey();
                  if (r) {
                    await saveApple({ keyPath: r.path });
                    toast.success('MusicKit key imported');
                  }
                }}
              >
                Choose…
              </Button>
              <span className="truncate font-mono text-[10px] text-text-faint" title={apple.keyPath}>
                {apple.keyPath ? apple.keyPath.split(/[\\/]/).pop() : 'none'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-text-faint">Requires an Apple Developer Program membership. Note: full-track Apple Music playback needs DRM (Widevine), which the desktop app doesn't include — 30 s previews and browsing work. Restart the app after changing credentials.</div>
      </div>
      <Row label="Audio buffer size (advanced)" hint="Chromium --audio-buffer-size in frames; empty = default. Lower = less latency, more risk of dropouts. Restart required.">
        <input
          type="number"
          min={64}
          max={4096}
          step={64}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={() => d.setConfig({ audioBufferSize: buffer === '' ? undefined : buffer })}
          placeholder="default"
          className="h-7 w-24 rounded border border-border bg-bg-elev px-2 font-mono text-xs text-text outline-none focus:border-accent"
          onKeyDown={(e) => e.stopPropagation()}
        />
      </Row>
    </section>
  );
}
