import { preloadEmbeddingModel } from '@/lib/rag/embed';
import { analyzeLeaseClientSide, analyzeLeaseFast } from '@/lib/rag/analyze';

// Listen to messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, id, text, fileName } = event.data ?? {};

  if (type === 'INIT') {
    try {
      await preloadEmbeddingModel((data) => {
        self.postMessage({
          type: 'PROGRESS',
          progress: data.progress ?? 0,
          status: data.status,
          file: data.file,
        });
      });
      self.postMessage({ type: 'READY' });
    } catch (error) {
      console.warn('Worker: failed to preload embedding model, fallback will be used', error);
      self.postMessage({
        type: 'INIT_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (type === 'ANALYZE') {
    try {
      // Attempt full semantic RAG analysis
      const result = await analyzeLeaseClientSide({ text, fileName });
      self.postMessage({ type: 'RESULT', id, result });
    } catch (error) {
      console.warn('Worker: semantic analysis failed, attempting fast fallback', error);
      try {
        const fallbackResult = analyzeLeaseFast({ text, fileName });
        self.postMessage({ type: 'RESULT', id, result: fallbackResult });
      } catch (fallbackError) {
        self.postMessage({
          type: 'ERROR',
          id,
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : 'Analysis failed in background worker.',
        });
      }
    }
  }
});
