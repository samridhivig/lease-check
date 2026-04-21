import path from 'path';

const DEFAULT_EMBEDDING_MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const LOCAL_CACHE_DIR = path.join(process.cwd(), '.cache', 'transformers');
const DEFAULT_POOLING: RagEmbeddingModelMetadata['pooling'] = 'mean';
const DEFAULT_PREFIX_STRATEGY: RagEmbeddingModelMetadata['prefixStrategy'] = 'none';

export interface RagEmbeddingModelMetadata {
  modelId: string;
  dimensions: number;
  pooling: 'mean' | 'cls';
  normalized: boolean;
  prefixStrategy: 'none' | 'query_document';
}

type FeatureExtractor = (
  texts: string | string[],
  options?: Record<string, unknown>,
) => Promise<unknown>;

const globalForEmbeddings = globalThis as typeof globalThis & {
  leaseCheckEmbeddingModelId?: string;
  leaseCheckEmbeddingExtractorPromise?: Promise<FeatureExtractor>;
};

function getTransformersCacheDir(): string {
  if (process.env.TRANSFORMERS_CACHE) {
    return process.env.TRANSFORMERS_CACHE;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return '/tmp/transformers-cache';
  }

  return LOCAL_CACHE_DIR;
}

function getEmbeddingModelId(): string {
  return (
    process.env.RAG_EMBEDDING_MODEL_ID ||
    process.env.RAG_EMBED_MODEL_ID ||
    DEFAULT_EMBEDDING_MODEL_ID
  );
}

async function getExtractor(): Promise<FeatureExtractor> {
  const modelId = getEmbeddingModelId();
  if (
    !globalForEmbeddings.leaseCheckEmbeddingExtractorPromise ||
    globalForEmbeddings.leaseCheckEmbeddingModelId !== modelId
  ) {
    globalForEmbeddings.leaseCheckEmbeddingModelId = modelId;
    globalForEmbeddings.leaseCheckEmbeddingExtractorPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.cacheDir = getTransformersCacheDir();
      return (await pipeline('feature-extraction', modelId)) as FeatureExtractor;
    })();
  }

  try {
    return await globalForEmbeddings.leaseCheckEmbeddingExtractorPromise;
  } catch (error) {
    globalForEmbeddings.leaseCheckEmbeddingExtractorPromise = undefined;
    throw error;
  }
}

function isNumberMatrix(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((entry) => typeof entry === 'number'),
    )
  );
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

function tensorLikeToVectors(output: unknown): number[][] {
  if (output && typeof output === 'object') {
    const maybeTensor = output as {
      tolist?: () => unknown;
      data?: ArrayLike<number>;
      dims?: number[];
    };

    if (typeof maybeTensor.tolist === 'function') {
      const list = maybeTensor.tolist();
      if (isNumberMatrix(list)) {
        return list;
      }
      if (isNumberVector(list)) {
        return [list];
      }
    }

    if (maybeTensor.data && Array.isArray(maybeTensor.dims) && maybeTensor.dims.length > 0) {
      const flat = Array.from(maybeTensor.data);
      const [batchSize, width] =
        maybeTensor.dims.length === 1
          ? [1, maybeTensor.dims[0]]
          : [maybeTensor.dims[0] ?? 1, maybeTensor.dims[1] ?? 0];

      if (batchSize > 0 && width > 0 && flat.length >= batchSize * width) {
        const vectors: number[][] = [];
        for (let index = 0; index < batchSize; index += 1) {
          vectors.push(flat.slice(index * width, (index + 1) * width));
        }
        return vectors;
      }
    }
  }

  throw new Error('Unsupported embedding output shape returned by @huggingface/transformers.');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const extractor = await getExtractor();
  const output = await extractor(texts, {
    pooling: DEFAULT_POOLING,
    normalize: true,
  });

  return tensorLikeToVectors(output);
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector ?? [];
}

export function getActiveEmbeddingModelId(): string {
  return getEmbeddingModelId();
}

export function prepareDocumentEmbeddingInput(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (DEFAULT_PREFIX_STRATEGY === 'query_document') {
    return `passage: ${normalized}`;
  }

  return normalized;
}

export function prepareQueryEmbeddingInput(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (DEFAULT_PREFIX_STRATEGY === 'query_document') {
    return `query: ${normalized}`;
  }

  return normalized;
}

export async function embedDocumentTexts(texts: string[]): Promise<number[][]> {
  return embedTexts(texts.map((text) => prepareDocumentEmbeddingInput(text)));
}

export async function embedQueryTexts(texts: string[]): Promise<number[][]> {
  return embedTexts(texts.map((text) => prepareQueryEmbeddingInput(text)));
}

export async function getEmbeddingModelMetadata(sampleText = 'sample'): Promise<RagEmbeddingModelMetadata> {
  const [vector] = await embedTexts([sampleText]);
  return {
    modelId: getEmbeddingModelId(),
    dimensions: vector?.length ?? 0,
    pooling: DEFAULT_POOLING,
    normalized: true,
    prefixStrategy: DEFAULT_PREFIX_STRATEGY,
  };
}
