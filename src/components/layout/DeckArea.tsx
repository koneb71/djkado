import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useUi } from '@/store/ui';
import { DeckView } from '../deck/DeckView';
import { Mixer } from '../mixer/Mixer';
import { spring } from '@/ui/motion';

export function DeckArea() {
  const layout = useUi((s) => s.layout);
  const four = layout === 4;
  return (
    <LayoutGroup>
      <div className="relative flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <motion.div layout transition={spring} className="min-h-0 flex-1">
            <DeckView id="A" compact={four} />
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
            <DeckView id="B" compact={four} />
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
