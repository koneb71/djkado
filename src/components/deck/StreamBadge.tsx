import { Radio } from 'lucide-react';
import { Tooltip } from '@/ui/Tooltip';

export function StreamBadge() {
  return (
    <Tooltip label="Streaming track — DRM playback: play/pause/seek/volume only (no scratch, EQ, tempo or sync)">
      <span className="inline-flex items-center gap-1 rounded-sm border border-warn/50 bg-warn/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-warn">
        <Radio size={9} /> Stream · limited
      </span>
    </Tooltip>
  );
}
