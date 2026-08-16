import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useUi } from '@/store/ui';
import { LibraryBrowser } from '../browser/LibraryBrowser';

export function BottomPanel() {
  const height = useUi((s) => s.libraryHeight);
  const setHeight = useUi((s) => s.setLibraryHeight);
  const open = useUi((s) => s.libraryOpen);
  const setOpen = useUi((s) => s.setLibraryOpen);
  const drag = useRef<{ y: number; h: number } | null>(null);

  return (
    <div className="relative shrink-0 border-t border-border bg-panel">
      {/* resize handle */}
      <div
        className="group absolute -top-1.5 left-0 right-0 z-10 flex h-3 cursor-row-resize items-center justify-center"
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, h: height };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && setHeight(drag.current.h + (drag.current.y - e.clientY))}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setOpen(!open)}
      >
        <div className="h-1 w-16 rounded-full bg-border-2 transition-colors group-hover:bg-accent" />
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="absolute right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-panel-2 text-text-dim hover:text-text" aria-label={open ? 'Collapse library' : 'Expand library'}>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="lib" initial={{ height: 0, opacity: 0 }} animate={{ height, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="overflow-hidden">
            <div style={{ height }} className="flex flex-col">
              <LibraryBrowser />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && <div className="h-3" />}
    </div>
  );
}
