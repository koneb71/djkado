import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/store/ui';
import { DeckView } from '../deck/DeckView';
import { Mixer } from '../mixer/Mixer';
import { spring } from '@/ui/motion';

/** Full-size decks need ~430 px; below that (short window, sampler open) switch to the tight layout. */
const COMPACT_BELOW = 430;

export function DeckArea() {
  const layout = useUi((s) => s.layout);
  const four = layout === 4;
  const ref = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // measure the space the decks actually get rather than guessing from the window height:
    // opening the sampler or the library is what really squeezes them
    const ro = new ResizeObserver(([entry]) => setTight(entry.contentRect.height < COMPACT_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = four || tight;
  return (
    <LayoutGroup>
      <div ref={ref} className="relative flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <motion.div layout transition={spring} className="min-h-0 flex-1">
            <DeckView id="A" compact={compact} />
          </motion.div>
          <AnimatePresence initial={false}>
            {four && (
              <motion.div key="C" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', flex: 1 }} exit={{ opacity: 0, height: 0 }} transition={spring} className="min-h-0 overflow-hidden">
                <DeckView id="C" compact />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <motion.div layout transition={spring} className="shrink-0">
          <Mixer />
        </motion.div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <motion.div layout transition={spring} className="min-h-0 flex-1">
            <DeckView id="B" compact={compact} />
          </motion.div>
          <AnimatePresence initial={false}>
            {four && (
              <motion.div key="D" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', flex: 1 }} exit={{ opacity: 0, height: 0 }} transition={spring} className="min-h-0 overflow-hidden">
                <DeckView id="D" compact />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LayoutGroup>
  );
}
