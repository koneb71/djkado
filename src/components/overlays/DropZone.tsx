import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FolderDown } from 'lucide-react';
import { toast } from 'sonner';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { useLibrary } from '@/store/library';

/** Whole-window drop target for audio files/folders. Deck-specific drops are handled by the decks. */
export function DropZone({ children }: { children: ReactNode }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    depth.current++;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = useCallback(async (e: DragEvent) => {
    depth.current = 0;
    setOver(false);
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items ?? []);
    const files: File[] = [];
    const walkEntry = async (entry: any): Promise<void> => {
      if (entry.isFile) {
        await new Promise<void>((res) => entry.file((f: File) => { files.push(f); res(); }, () => res()));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = async (): Promise<any[]> => {
          const out: any[] = [];
          for (;;) {
            const batch: any[] = await new Promise((res) => reader.readEntries(res, () => res([])));
            if (!batch.length) break;
            out.push(...batch);
          }
          return out;
        };
        for (const child of await readAll()) await walkEntry(child);
      }
    };
    const entries = items.map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) for (const en of entries) await walkEntry(en);
    else files.push(...Array.from(e.dataTransfer.files));
    const added = await LocalLibrary.addFiles(files);
    useLibrary.getState().setSource('local');
    if (added.length) toast.success(`Added ${added.length} track${added.length === 1 ? '' : 's'} to your library`);
    else toast.error('No audio files found in the drop');
  }, []);

  return (
    <div className="relative h-full" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      {children}
      <AnimatePresence>
        {over && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-accent/5 backdrop-blur-[2px]">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-bg/80 px-12 py-8 text-accent" style={{ boxShadow: '0 0 60px rgba(34,211,238,0.25)' }}>
              <FolderDown size={40} />
              <div className="text-sm font-semibold uppercase tracking-widest">Drop audio files or folders</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
