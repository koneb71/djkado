import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, width = 640 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[80] flex items-center justify-center bg-bg/70 backdrop-blur-sm" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="panel noise flex max-h-[85vh] flex-col overflow-hidden"
            style={{ width, maxWidth: '92vw' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-label={title}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-bold">{title}</div>
              <button type="button" onClick={onClose} className="rounded p-1 text-text-dim hover:bg-panel-3 hover:text-text" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
