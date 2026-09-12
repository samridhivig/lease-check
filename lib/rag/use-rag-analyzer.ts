'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AnalysisResult } from '@/types';
import { extractTextFromPdf } from '@/lib/client-pdf';
import { analyzeLeaseFast } from '@/lib/rag/analyze';

export type ModelStatus = 'uninitialized' | 'downloading' | 'ready' | 'fallback_ready';

export interface UseRagAnalyzerResult {
  modelStatus: ModelStatus;
  downloadProgress: number;
  analyze: (file: File) => Promise<AnalysisResult>;
}

export function useRagAnalyzer(): UseRagAnalyzerResult {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('uninitialized');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<
    Map<string, { resolve: (res: AnalysisResult) => void; reject: (err: Error) => void }>
  >(new Map());

  useEffect(() => {
    // Initialize Web Worker in the background
    if (typeof window === 'undefined') return;

    try {
      const worker = new Worker(new URL('./rag-worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      setModelStatus('downloading');

      worker.onmessage = (event: MessageEvent) => {
        const { type, progress, result, error, id } = event.data ?? {};

        if (type === 'PROGRESS') {
          if (typeof progress === 'number') {
            setDownloadProgress(Math.round(progress));
          }
        } else if (type === 'READY') {
          setModelStatus('ready');
          setDownloadProgress(100);
        } else if (type === 'INIT_ERROR') {
          console.warn('RAG Worker model init failed, switching to fast fallback mode:', error);
          setModelStatus('fallback_ready');
        } else if (type === 'RESULT' && id) {
          const callbacks = pendingRequests.current.get(id);
          if (callbacks) {
            pendingRequests.current.delete(id);
            callbacks.resolve(result);
          }
        } else if (type === 'ERROR' && id) {
          const callbacks = pendingRequests.current.get(id);
          if (callbacks) {
            pendingRequests.current.delete(id);
            callbacks.reject(new Error(error || 'Analysis failed'));
          }
        }
      };

      worker.onerror = (err) => {
        console.warn('Worker error, will use direct execution fallback:', err);
        setModelStatus('fallback_ready');
      };

      // Trigger background download and caching
      worker.postMessage({ type: 'INIT' });

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (err) {
      console.warn('Could not spawn Web Worker, fallback to direct execution:', err);
      setModelStatus('fallback_ready');
    }
  }, []);

  const analyze = useCallback(
    async (file: File): Promise<AnalysisResult> => {
      // Step 1: Extract text 100% client-side from the PDF
      const text = await extractTextFromPdf(file);

      if (!text || !text.trim()) {
        throw new Error('The PDF did not contain any readable text. Please try another contract.');
      }

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Step 2: Run analysis
      // If the worker is available and ready, use it to keep the main thread smooth
      if (workerRef.current && (modelStatus === 'ready' || modelStatus === 'downloading')) {
        return new Promise<AnalysisResult>((resolve, reject) => {
          pendingRequests.current.set(requestId, { resolve, reject });
          workerRef.current?.postMessage({
            type: 'ANALYZE',
            id: requestId,
            text,
            fileName: file.name,
          });

          // Safety timeout in case worker hangs
          setTimeout(() => {
            if (pendingRequests.current.has(requestId)) {
              pendingRequests.current.delete(requestId);
              // Fallback to instant synchronous analysis
              try {
                const fastResult = analyzeLeaseFast({ text, fileName: file.name });
                resolve(fastResult);
              } catch (fallbackErr) {
                reject(fallbackErr instanceof Error ? fallbackErr : new Error('Analysis timed out'));
              }
            }
          }, 30000);
        });
      }

      // Step 3: Direct fallback on main thread
      return analyzeLeaseFast({ text, fileName: file.name });
    },
    [modelStatus],
  );

  return {
    modelStatus,
    downloadProgress,
    analyze,
  };
}
