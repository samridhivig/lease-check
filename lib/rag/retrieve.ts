import type { ExtractionEvidence } from '@/types';

export type ClauseTopicId =
  | 'tenant_termination'
  | 'landlord_termination'
  | 'registration'
  | 'inventory'
  | 'fire_insurance'
  | 'property_tax'
  | 'non_payment_termination'
  | 'rent_indexation'
  | 'deposit_handling'
  | 'renewal';

export type ReferenceKind = 'law_article' | 'guidance_page' | 'supporting_explanation';

export interface EmbeddedClauseRecord {
  id: string;
  topic?: ClauseTopicId;
  source: 'lease' | 'reference';
  heading?: string;
  text: string;
  embedding?: number[];
  keywords?: string[];
  referenceKind?: ReferenceKind;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface RetrievedClause {
  id: string;
  topic?: ClauseTopicId;
  source: 'lease' | 'reference';
  heading?: string;
  text: string;
  score: number;
  referenceKind?: ReferenceKind;
  evidence: ExtractionEvidence;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface RetrievedReferenceBundle {
  lawArticles: RetrievedClause[];
  guidancePages: RetrievedClause[];
  supportingExplanations: RetrievedClause[];
}

interface RetrieveReferenceBundleOptions {
  leaseClause: EmbeddedClauseRecord;
  referenceIndex?: EmbeddedClauseRecord[];
  limitPerKind?: number;
}

const LAW_INDEX_KEY = Symbol.for('lease-check.rag.law-index');

type RagGlobal = typeof globalThis & {
  [LAW_INDEX_KEY]?: EmbeddedClauseRecord[];
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function toKeywordSet(record: { text: string; heading?: string; keywords?: string[] }): Set<string> {
  return new Set([
    ...tokenize(record.heading ?? ''),
    ...tokenize(record.text),
    ...(record.keywords ?? []).map((keyword) => keyword.toLowerCase()),
  ]);
}

function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return null;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return null;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function lexicalScore(query: EmbeddedClauseRecord, record: EmbeddedClauseRecord): number {
  const queryTokens = toKeywordSet(query);
  const recordTokens = toKeywordSet(record);

  if (queryTokens.size === 0 || recordTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (recordTokens.has(token)) {
      overlap += 1;
    }
  }

  const topicBoost = query.topic && record.topic === query.topic ? 0.2 : 0;

  return overlap / queryTokens.size + topicBoost;
}

function scoreRecord(query: EmbeddedClauseRecord, record: EmbeddedClauseRecord): number {
  const vectorScore =
    query.embedding && record.embedding
      ? cosineSimilarity(query.embedding, record.embedding)
      : null;

  const lexical = lexicalScore(query, record);
  if (vectorScore !== null) {
    return vectorScore + lexical * 0.15;
  }

  return lexical;
}

function toRetrievedClause(record: EmbeddedClauseRecord, score: number): RetrievedClause {
  const snippet = record.heading ? `${record.heading}\n${record.text}` : record.text;

  return {
    id: record.id,
    topic: record.topic,
    source: record.source,
    heading: record.heading,
    text: record.text,
    score,
    referenceKind: record.referenceKind,
    evidence: {
      snippet: snippet.slice(0, 800),
    },
    metadata: record.metadata,
  };
}

function rankReferenceKind(
  leaseClause: EmbeddedClauseRecord,
  references: EmbeddedClauseRecord[],
  limit: number,
): RetrievedClause[] {
  return references
    .map((record) => ({
      record,
      score: scoreRecord(leaseClause, record),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => toRetrievedClause(entry.record, entry.score));
}

export function registerLawClauseIndex(index: EmbeddedClauseRecord[]): void {
  (globalThis as RagGlobal)[LAW_INDEX_KEY] = index;
}

export function getRegisteredLawClauseIndex(): EmbeddedClauseRecord[] {
  return (globalThis as RagGlobal)[LAW_INDEX_KEY] ?? [];
}

export function retrieveReferenceBundle({
  leaseClause,
  referenceIndex,
  limitPerKind = 1,
}: RetrieveReferenceBundleOptions): RetrievedReferenceBundle {
  const resolvedReferenceIndex =
    referenceIndex?.filter((record) => record.source === 'reference') ??
    getRegisteredLawClauseIndex().filter((record) => record.source === 'reference');
  const scopedReferences = leaseClause.topic
    ? resolvedReferenceIndex.filter((record) => !record.topic || record.topic === leaseClause.topic)
    : resolvedReferenceIndex;

  const isStudentQuery =
    /\bstudent(?:enhuur|enkamer|enwoning)?\b|student lease/i.test(
      `${leaseClause.heading ?? ''} ${leaseClause.text} ${(leaseClause.keywords ?? []).join(' ')}`,
    );
  const isStudentReference = (record: EmbeddedClauseRecord) =>
    /\bstudent/.test(
      `${record.heading ?? ''} ${record.text} ${(record.keywords ?? []).join(' ')} ${
        record.metadata?.ruleIds ?? ''
      }`.toLowerCase(),
    );

  const byKind = (kind: ReferenceKind) => {
    const records = scopedReferences.filter((record) => record.referenceKind === kind);
    if (!isStudentQuery) {
      return records;
    }

    const studentRecords = records.filter(isStudentReference);
    return studentRecords.length > 0 ? studentRecords : records;
  };

  return {
    lawArticles: rankReferenceKind(leaseClause, byKind('law_article'), limitPerKind),
    guidancePages: rankReferenceKind(leaseClause, byKind('guidance_page'), limitPerKind),
    supportingExplanations: rankReferenceKind(
      leaseClause,
      byKind('supporting_explanation'),
      limitPerKind,
    ),
  };
}
