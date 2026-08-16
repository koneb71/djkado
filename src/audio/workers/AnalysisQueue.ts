import * as Comlink from 'comlink';
import type { AnalysisApi } from './analysis.worker';
import type { AnalysisResult } from '../engine/types';
import { getCachedAnalysis, putCachedAnalysis } from '@/services/localLibrary/db';

type Priority = 'high' | 'low';

interface Job {
  id: string;
  mono: Float32Array;
  sampleRate: number;
  priority: Priority;
  onProgress?: (p: number, stage: string) => void;
  resolve: (r: AnalysisResult) => void;
  reject: (e: unknown) => void;
}

interface WorkerSlot {
  worker: Worker;
  api: Comlink.Remote<AnalysisApi>;
  busy: boolean;
}

/**
 * Pool of analysis workers with priority queue + IndexedDB cache.
 * Deck loads use 'high' priority; background library scans use 'low'.
 */
class AnalysisQueueImpl {
  private slots: WorkerSlot[] = [];
  private queue: Job[] = [];
  private inflight = new Map<string, Promise<AnalysisResult>>();

  private ensureWorkers() {
    if (this.slots.length) return;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.slots.push({ worker, api: Comlink.wrap<AnalysisApi>(worker), busy: false });
    }
  }

  async analyze(
    id: string,
    mono: Float32Array,
    sampleRate: number,
    priority: Priority = 'high',
    onProgress?: (p: number, stage: string) => void,
  ): Promise<AnalysisResult> {
    const cached = await getCachedAnalysis(id);
    if (cached) {
      onProgress?.(1, 'cached');
      return cached;
    }
    const existing = this.inflight.get(id);
    if (existing) return existing;
    const p = new Promise<AnalysisResult>((resolve, reject) => {
      const job: Job = { id, mono, sampleRate, priority, onProgress, resolve, reject };
      if (priority === 'high') {
        const idx = this.queue.findIndex((j) => j.priority === 'low');
        if (idx === -1) this.queue.push(job);
        else this.queue.splice(idx, 0, job);
      } else this.queue.push(job);
      this.pump();
    });
    this.inflight.set(id, p);
    p.finally(() => this.inflight.delete(id)).catch(() => {});
    return p;
  }

  private pump() {
    this.ensureWorkers();
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.busy = true;
      const progress = job.onProgress ? Comlink.proxy(job.onProgress) : undefined;
      slot.api
        .analyze(Comlink.transfer({ mono: job.mono, sampleRate: job.sampleRate }, [job.mono.buffer]), progress)
        .then(async (res) => {
          await putCachedAnalysis(job.id, res);
          job.resolve(res);
        })
        .catch(job.reject)
        .finally(() => {
          slot.busy = false;
          this.pump();
        });
    }
  }

  cancelLowPriority() {
    this.queue = this.queue.filter((j) => j.priority !== 'low');
  }
}

export const AnalysisQueue = new AnalysisQueueImpl();
