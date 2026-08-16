import { motion } from 'motion/react';
import { Info, Link2, Loader2, LogOut } from 'lucide-react';
import { useSource } from '@/services/sources';
import { Button } from '@/ui/Button';
import { useEffect, useState } from 'react';
import { hasWidevine, isDesktop } from '@/desktop/bridge';

/** Shown in the Spotify/Apple tab when the source isn't connected; also as a small header when it is. */
export function ConnectCard({ id }: { id: 'spotify' | 'apple' }) {
  const { src, status } = useSource(id);
  const color = id === 'spotify' ? '#1DB954' : '#fa2d48';
  const notice = src.notice();
  const [drm, setDrm] = useState<boolean | null>(null);
  useEffect(() => {
    if (isDesktop()) hasWidevine().then((ok) => setDrm(ok));
  }, []);
  const drmNotice = isDesktop() && drm === false ? `${src.name} full-track playback needs the Widevine DRM module, which the desktop app doesn't include — browsing${id === 'apple' ? ' and 30 s previews (full engine)' : ''} still work; use the web app in Chrome for DRM streams.` : null;

  if (status === 'ready') {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-text-dim">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-text">{src.account()?.displayName}</span>
        {src.mock && <span className="rounded-sm border border-warn/40 bg-warn/10 px-1 text-[9px] font-bold uppercase text-warn">Mock data</span>}
        {notice && (
          <span className="flex items-center gap-1 truncate text-text-faint" title={notice}>
            <Info size={11} /> <span className="truncate">{notice}</span>
          </span>
        )}
        <div className="flex-1" />
        <Button size="xs" variant="ghost" onClick={() => src.disconnect()}>
          <LogOut size={11} /> Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel-inset max-w-md p-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: color + '22', color, boxShadow: `0 0 30px ${color}33` }}>
          <Link2 size={22} />
        </div>
        <div className="text-base font-bold">Connect {src.name}</div>
        <p className="mt-1 text-xs text-text-dim">
          Browse your playlists, library and search, then load tracks to a deck.
          {id === 'apple' ? ' Full tracks play in Stream mode (play/pause/seek/volume); 30 s catalog previews get the full DJ engine.' : ' Full tracks play in Stream mode (play/pause/seek/volume — DRM prevents scratching, EQ and sync). Premium required.'}
        </p>
        {notice && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-panel px-2.5 py-2 text-left text-[11px] text-text-dim">
            <Info size={13} className="mt-0.5 shrink-0 text-warn" />
            <span>{notice}</span>
          </div>
        )}
        {drmNotice && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-2 text-left text-[11px] text-text-dim">
            <Info size={13} className="mt-0.5 shrink-0 text-warn" />
            <span>{drmNotice}</span>
          </div>
        )}
        {status === 'error' && <div className="mt-2 text-xs text-danger">Connection failed. Check the setup notes above and try again.</div>}
        <Button className="mt-4 w-full" variant="primary" style={{ background: color, borderColor: color }} onClick={() => src.connect()} disabled={status === 'connecting'}>
          {status === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} {status === 'connecting' ? 'Connecting…' : `Connect ${src.name}`}
        </Button>
      </motion.div>
    </div>
  );
}
