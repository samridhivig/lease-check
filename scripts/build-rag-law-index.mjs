import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DEFAULT_MODEL_ID =
  process.env.RAG_EMBEDDING_MODEL_ID ??
  process.env.RAG_EMBED_MODEL_ID ??
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const DEFAULT_SOURCE_PATH = path.join(process.cwd(), 'data', 'rag', 'law-clauses.seed.json');
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), 'data', 'rag', 'law-index.json');
const DEFAULT_POOLING = 'mean';
const DEFAULT_NORMALIZE = true;
const DEFAULT_PREFIX_STRATEGY = 'none';

function getTransformersCacheDir() {
  if (process.env.TRANSFORMERS_CACHE) {
    return process.env.TRANSFORMERS_CACHE;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return '/tmp/transformers-cache';
  }

  return path.join(process.cwd(), '.cache', 'transformers');
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE_PATH,
    out: DEFAULT_OUTPUT_PATH,
    model: DEFAULT_MODEL_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--source' && argv[index + 1]) {
      options.source = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value === '--out' && argv[index + 1]) {
      options.out = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value === '--model' && argv[index + 1]) {
      options.model = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return options;
}

function assertRecord(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${fieldName} to be an object.`);
  }

  return value;
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`);
  }

  return value;
}

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`Expected ${fieldName} to be an array of non-empty strings.`);
  }

  return value;
}

function parseSeedCorpus(raw) {
  const parsed = JSON.parse(raw);
  const record = assertRecord(parsed, 'seed corpus');

  if (!Array.isArray(record.references)) {
    throw new Error('Expected seed corpus to have a references array.');
  }

  return {
    version: assertString(record.version, 'version'),
    scope: assertString(record.scope, 'scope'),
    references: record.references.map((entry, index) => {
      const reference = assertRecord(entry, `references[${index}]`);
      return {
        id: assertString(reference.id, `references[${index}].id`),
        kind: assertString(reference.kind, `references[${index}].kind`),
        topic: assertString(reference.topic, `references[${index}].topic`),
        title: assertString(reference.title, `references[${index}].title`),
        language: assertString(reference.language, `references[${index}].language`),
        ruleIds: assertStringArray(reference.ruleIds, `references[${index}].ruleIds`),
        text: assertString(reference.text, `references[${index}].text`),
        keywords:
          reference.keywords === undefined
            ? []
            : assertStringArray(reference.keywords, `references[${index}].keywords`),
        sources: Array.isArray(reference.sources)
          ? reference.sources.map((source, sourceIndex) => {
              const sourceRecord = assertRecord(source, `references[${index}].sources[${sourceIndex}]`);
              return {
                label: assertString(
                  sourceRecord.label,
                  `references[${index}].sources[${sourceIndex}].label`,
                ),
                url: assertString(
                  sourceRecord.url,
                  `references[${index}].sources[${sourceIndex}].url`,
                ),
              };
            })
          : (() => {
              throw new Error(`Expected references[${index}].sources to be an array.`);
            })(),
      };
    }),
  };
}

function normalizeText(text) {
  return text.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+/g, ' ').trim();
}

function buildEmbeddingInput(reference) {
  const parts = [
    `Kind: ${reference.kind}`,
    `Topic: ${reference.topic}`,
    reference.title,
    reference.text,
    reference.keywords.length > 0 ? `Keywords: ${reference.keywords.join(', ')}` : '',
  ].filter(Boolean);

  return normalizeText(parts.join('\n\n'));
}

function tensorToVectors(tensor) {
  const dims = tensor.dims;
  const data = Array.from(tensor.data, Number);

  if (dims.length === 1) {
    return [data];
  }

  if (dims.length !== 2) {
    throw new Error(`Expected pooled embeddings with 1 or 2 dimensions, received [${dims.join(', ')}].`);
  }

  const [rowCount, columnCount] = dims;
  const vectors = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const start = rowIndex * columnCount;
    vectors.push(data.slice(start, start + columnCount));
  }

  return vectors;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const seedRaw = await readFile(options.source, 'utf8');
  const seedCorpus = parseSeedCorpus(seedRaw);

  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = getTransformersCacheDir();

  const extractor = await pipeline('feature-extraction', options.model);
  const embeddingInputs = seedCorpus.references.map((reference) => buildEmbeddingInput(reference));
  const tensor = await extractor(embeddingInputs, {
    pooling: DEFAULT_POOLING,
    normalize: DEFAULT_NORMALIZE,
  });

  const vectors = tensorToVectors(tensor);
  if (vectors.length !== seedCorpus.references.length) {
    throw new Error(`Expected ${seedCorpus.references.length} embeddings, received ${vectors.length}.`);
  }

  const output = {
    version: seedCorpus.version,
    scope: seedCorpus.scope,
    generatedAt: new Date().toISOString(),
    embeddingModel: {
      modelId: options.model,
      dimensions: vectors[0]?.length ?? 0,
      pooling: DEFAULT_POOLING,
      normalized: DEFAULT_NORMALIZE,
      prefixStrategy: DEFAULT_PREFIX_STRATEGY,
      count: vectors.length,
    },
    references: seedCorpus.references.map((reference, index) => ({
      ...reference,
      embeddingInput: embeddingInputs[index],
      embedding: vectors[index],
    })),
  };

  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify({
      ok: true,
      references: output.references.length,
      modelId: output.embeddingModel.modelId,
      dimensions: output.embeddingModel.dimensions,
      out: options.out,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
