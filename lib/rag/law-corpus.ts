import { readFile } from 'fs/promises';
import path from 'path';

import type { RagEmbeddingModelMetadata } from '@/lib/rag/embed';
import { registerLawClauseIndex } from '@/lib/rag/retrieve';
import type { ClauseTopicId, EmbeddedClauseRecord, ReferenceKind } from '@/lib/rag/retrieve';

export interface RagLawSource {
  label: string;
  url: string;
}

export interface RagReferenceSeedEntry {
  id: string;
  kind: ReferenceKind;
  topic: ClauseTopicId;
  title: string;
  language: string;
  ruleIds: string[];
  text: string;
  keywords?: string[];
  sources: RagLawSource[];
}

export interface RagLawSeedFile {
  version: string;
  scope: string;
  references: RagReferenceSeedEntry[];
}

export interface RagIndexedReferenceEntry extends RagReferenceSeedEntry {
  embeddingInput: string;
  embedding: number[];
}

export interface RagLawIndexFile {
  version: string;
  scope: string;
  generatedAt: string;
  embeddingModel: RagEmbeddingModelMetadata & {
    count: number;
  };
  references: RagIndexedReferenceEntry[];
}

export interface RagLawCorpus {
  loadedAt: string;
  indexPath: string;
  index: RagLawIndexFile;
  byId: Map<string, RagIndexedReferenceEntry>;
  byTopic: Map<ClauseTopicId, RagIndexedReferenceEntry[]>;
}

interface RagLawCorpusOptions {
  indexPath?: string;
  forceReload?: boolean;
}

type GlobalLawCorpusState = typeof globalThis & {
  ragLawCorpusCache?: Map<string, Promise<RagLawCorpus>>;
};

const globalForLawCorpus = globalThis as GlobalLawCorpusState;

function getLawCorpusCache(): Map<string, Promise<RagLawCorpus>> {
  if (!globalForLawCorpus.ragLawCorpusCache) {
    globalForLawCorpus.ragLawCorpusCache = new Map<string, Promise<RagLawCorpus>>();
  }

  return globalForLawCorpus.ragLawCorpusCache;
}

export function getDefaultLawSeedPath(): string {
  return path.join(process.cwd(), 'data', 'rag', 'law-clauses.seed.json');
}

export function getDefaultLawIndexPath(): string {
  return path.join(process.cwd(), 'data', 'rag', 'law-index.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`);
  }

  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`Expected ${fieldName} to be a string array.`);
  }

  return value;
}

function assertReferenceKind(value: unknown, fieldName: string): ReferenceKind {
  const normalized = assertString(value, fieldName);
  if (
    normalized !== 'law_article' &&
    normalized !== 'guidance_page' &&
    normalized !== 'supporting_explanation'
  ) {
    throw new Error(`Expected ${fieldName} to be a supported reference kind.`);
  }

  return normalized;
}

function assertClauseTopic(value: unknown, fieldName: string): ClauseTopicId {
  const normalized = assertString(value, fieldName);
  const supported: ClauseTopicId[] = [
    'tenant_termination',
    'landlord_termination',
    'registration',
    'inventory',
    'fire_insurance',
    'property_tax',
    'non_payment_termination',
    'rent_indexation',
    'deposit_handling',
    'renewal',
  ];

  if (!supported.includes(normalized as ClauseTopicId)) {
    throw new Error(`Expected ${fieldName} to be a supported clause topic.`);
  }

  return normalized as ClauseTopicId;
}

function parseSources(value: unknown, fieldName: string): RagLawSource[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${fieldName} to be an array.`);
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${fieldName}[${index}] to be an object.`);
    }

    return {
      label: assertString(entry.label, `${fieldName}[${index}].label`),
      url: assertString(entry.url, `${fieldName}[${index}].url`),
    };
  });
}

function parseSeedEntry(value: unknown, index: number): RagReferenceSeedEntry {
  if (!isRecord(value)) {
    throw new Error(`Expected references[${index}] to be an object.`);
  }

  return {
    id: assertString(value.id, `references[${index}].id`),
    kind: assertReferenceKind(value.kind, `references[${index}].kind`),
    topic: assertClauseTopic(value.topic, `references[${index}].topic`),
    title: assertString(value.title, `references[${index}].title`),
    language: assertString(value.language, `references[${index}].language`),
    ruleIds: assertStringArray(value.ruleIds, `references[${index}].ruleIds`),
    text: assertString(value.text, `references[${index}].text`),
    keywords:
      value.keywords === undefined
        ? undefined
        : assertStringArray(value.keywords, `references[${index}].keywords`),
    sources: parseSources(value.sources, `references[${index}].sources`),
  };
}

function parseEmbeddingModel(value: unknown): RagLawIndexFile['embeddingModel'] {
  if (!isRecord(value)) {
    throw new Error('Expected embeddingModel to be an object.');
  }

  return {
    modelId: assertString(value.modelId, 'embeddingModel.modelId'),
    dimensions: Number(value.dimensions),
    pooling: assertString(value.pooling, 'embeddingModel.pooling') as RagEmbeddingModelMetadata['pooling'],
    normalized: Boolean(value.normalized),
    prefixStrategy: assertString(
      value.prefixStrategy,
      'embeddingModel.prefixStrategy',
    ) as RagEmbeddingModelMetadata['prefixStrategy'],
    count: Number(value.count),
  };
}

function parseIndexedEntry(value: unknown, index: number): RagIndexedReferenceEntry {
  const seedEntry = parseSeedEntry(value, index);

  if (!isRecord(value)) {
    throw new Error(`Expected references[${index}] to be an object.`);
  }

  if (!Array.isArray(value.embedding) || value.embedding.some((entry) => typeof entry !== 'number')) {
    throw new Error(`Expected references[${index}].embedding to be a number array.`);
  }

  return {
    ...seedEntry,
    embeddingInput: assertString(value.embeddingInput, `references[${index}].embeddingInput`),
    embedding: value.embedding,
  };
}

export async function loadLawSeedCorpusFromDisk(seedPath = getDefaultLawSeedPath()): Promise<RagLawSeedFile> {
  const raw = await readFile(seedPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Expected seed corpus at ${seedPath} to be an object.`);
  }

  if (!Array.isArray(parsed.references)) {
    throw new Error(`Expected seed corpus at ${seedPath} to contain a references array.`);
  }

  return {
    version: assertString(parsed.version, 'version'),
    scope: assertString(parsed.scope, 'scope'),
    references: parsed.references.map((entry, index) => parseSeedEntry(entry, index)),
  };
}

export async function loadLawCorpusIndexFromDisk(indexPath = getDefaultLawIndexPath()): Promise<RagLawIndexFile> {
  const raw = await readFile(indexPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Expected law corpus index at ${indexPath} to be an object.`);
  }

  if (!Array.isArray(parsed.references)) {
    throw new Error(`Expected law corpus index at ${indexPath} to contain a references array.`);
  }

  return {
    version: assertString(parsed.version, 'version'),
    scope: assertString(parsed.scope, 'scope'),
    generatedAt: assertString(parsed.generatedAt, 'generatedAt'),
    embeddingModel: parseEmbeddingModel(parsed.embeddingModel),
    references: parsed.references.map((entry, index) => parseIndexedEntry(entry, index)),
  };
}

function buildLawCorpus(index: RagLawIndexFile, indexPath: string): RagLawCorpus {
  const byId = new Map<string, RagIndexedReferenceEntry>();
  const byTopic = new Map<ClauseTopicId, RagIndexedReferenceEntry[]>();

  for (const entry of index.references) {
    byId.set(entry.id, entry);
    const existing = byTopic.get(entry.topic) ?? [];
    existing.push(entry);
    byTopic.set(entry.topic, existing);
  }

  return {
    loadedAt: new Date().toISOString(),
    indexPath,
    index,
    byId,
    byTopic,
  };
}

export function toEmbeddedReferenceRecords(corpus: RagLawCorpus): EmbeddedClauseRecord[] {
  return corpus.index.references.map((entry) => ({
    id: entry.id,
    source: 'reference',
    topic: entry.topic,
    heading: entry.title,
    text: entry.text,
    embedding: entry.embedding,
    keywords: entry.keywords,
    referenceKind: entry.kind,
    metadata: {
      language: entry.language,
      ruleIds: entry.ruleIds.join('|'),
      sourceUrls: entry.sources.map((source) => source.url).join('|'),
      sourceLabels: entry.sources.map((source) => source.label).join('|'),
    },
  }));
}

export async function ensureLawClauseIndexRegistered(
  options: RagLawCorpusOptions = {},
): Promise<RagLawCorpus> {
  const corpus = await getLawCorpus(options);
  registerLawClauseIndex(toEmbeddedReferenceRecords(corpus));
  return corpus;
}

export async function getLawCorpus(options: RagLawCorpusOptions = {}): Promise<RagLawCorpus> {
  const indexPath = options.indexPath ?? getDefaultLawIndexPath();
  const cache = getLawCorpusCache();

  if (options.forceReload) {
    cache.delete(indexPath);
  }

  if (!cache.has(indexPath)) {
    cache.set(
      indexPath,
      (async () => {
        const index = await loadLawCorpusIndexFromDisk(indexPath);
        return buildLawCorpus(index, indexPath);
      })(),
    );
  }

  try {
    return await cache.get(indexPath)!;
  } catch (error) {
    cache.delete(indexPath);
    throw error;
  }
}
