import type {
  ExtractFieldsResult,
  ExtractedValue,
  LeaseFieldId,
  SupportedDocumentLanguage,
} from '@/types';
import { buildClauseAwareChunks } from '@/lib/rag/chunk';
import {
  extractRagClauseFields,
  type RagClauseFieldExtractionResult,
} from '@/lib/rag/deterministic-extractor';
import { embedDocumentTexts } from '@/lib/rag/embed';
import type {
  ClauseTopicId,
  EmbeddedClauseRecord,
  RetrievedReferenceBundle,
} from '@/lib/rag/retrieve';
import { getRegisteredLawClauseIndex, retrieveReferenceBundle } from '@/lib/rag/retrieve';

export interface LeaseClauseBundleResult {
  clause: EmbeddedClauseRecord;
  referenceBundle: RetrievedReferenceBundle;
  fieldExtraction: RagClauseFieldExtractionResult;
}

export interface RagClauseExtractionResult {
  extraction: ExtractFieldsResult;
  clauseBundles: LeaseClauseBundleResult[];
  leaseClauses: EmbeddedClauseRecord[];
}

interface ExtractRagClausesInput {
  text: string;
  fileName?: string;
  scalarHints?: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>;
}

const MAX_LEASE_CLAUSES_PER_TOPIC = 1;

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/\t/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function detectLanguage(text: string): SupportedDocumentLanguage {
  const lower = text.toLowerCase();
  const dutchSignals = ['huurder', 'verhuurder', 'huur', 'woning', 'opzeg'];
  const frenchSignals = ['locataire', 'bailleur', 'loyer', 'resiliation', 'assurance'];
  const englishSignals = ['tenant', 'landlord', 'lease', 'rent', 'termination'];

  const score = (signals: string[]) =>
    signals.reduce((count, signal) => count + (lower.includes(signal) ? 1 : 0), 0);

  const dutch = score(dutchSignals);
  const french = score(frenchSignals);
  const english = score(englishSignals);

  if (dutch >= french && dutch >= english && dutch > 0) {
    return 'nl';
  }

  if (french >= dutch && french >= english && french > 0) {
    return 'fr';
  }

  if (english > 0) {
    return 'en';
  }

  return 'unknown';
}

function inferLeaseDocumentKind(text: string): string | null {
  const lower = text.toLowerCase();
  if (
    /studentenhuur|huurovereenkomst voor studenten|studentenkamer|studentenwoning|student lease|student residence|academic year/.test(
      lower,
    )
  ) {
    return 'student_lease';
  }

  const positiveSignals = [
    'huurder',
    'verhuurder',
    'huurcontract',
    'woning',
    'residential lease',
    'tenant',
    'landlord',
    'locataire',
    'bailleur',
  ];

  return positiveSignals.filter((signal) => lower.includes(signal)).length >= 2
    ? 'residential_lease'
    : null;
}

function mapChunkTopicToClauseTopic(topic: string): ClauseTopicId | null {
  switch (topic) {
    case 'registration':
      return 'registration';
    case 'inventory':
      return 'inventory';
    case 'insurance':
      return 'fire_insurance';
    case 'charges':
      return 'property_tax';
    case 'breach':
      return 'non_payment_termination';
    case 'rent':
      return 'rent_indexation';
    case 'deposit':
      return 'deposit_handling';
    case 'tenant_termination':
      return 'tenant_termination';
    case 'landlord_termination':
      return 'landlord_termination';
    case 'renewal':
      return 'renewal';
    default:
      return null;
  }
}

function buildLeaseClauses(text: string): EmbeddedClauseRecord[] {
  const chunks = buildClauseAwareChunks(text, { documentId: 'lease-upload' });
  const documentKeywords = /studenten|studentenhuur|studentenkamer|studentenwoning|students?|student lease|student residence|academic year/i.test(
    text,
  )
    ? ['student', 'studentenhuur', 'student lease']
    : [];

  return chunks
    .map((chunk) => {
      const clauseTopic = mapChunkTopicToClauseTopic(chunk.topic);

      return {
        id: chunk.id,
        source: 'lease' as const,
        topic: clauseTopic ?? undefined,
        heading: chunk.heading || undefined,
        text: chunk.text,
        keywords: Array.from(new Set([...(chunk.heading ? [chunk.heading] : []), ...documentKeywords])),
        metadata: {
          articleNumber: chunk.articleNumber,
          topic: chunk.topic,
          kind: chunk.kind,
          partIndex: chunk.partIndex,
          partCount: chunk.partCount,
        },
      };
    })
    .filter((chunk) => Boolean(chunk.topic))
    .filter((chunk) => chunk.text.trim().length >= 80);
}

function getMetadataNumber(
  clause: EmbeddedClauseRecord,
  key: 'partIndex' | 'partCount' | 'articleNumber',
): number | null {
  const value = clause.metadata?.[key];
  return typeof value === 'number' ? value : null;
}

function consolidateLeaseClauses(clauses: EmbeddedClauseRecord[]): EmbeddedClauseRecord[] {
  const groups = new Map<string, EmbeddedClauseRecord[]>();

  for (const clause of clauses) {
    const key = `${clause.topic ?? 'unknown'}::${clause.heading ?? clause.id}`;
    const existing = groups.get(key) ?? [];
    existing.push(clause);
    groups.set(key, existing);
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort(
      (left, right) => (getMetadataNumber(left, 'partIndex') ?? 1) - (getMetadataNumber(right, 'partIndex') ?? 1),
    );
    const base = sorted[0];
    const mergedText = sorted.map((entry) => entry.text.trim()).join('\n\n');

    return {
      ...base,
      text: mergedText,
      keywords: Array.from(
        new Set(sorted.flatMap((entry) => entry.keywords ?? [])),
      ),
      metadata: {
        ...base.metadata,
        partIndex: 1,
        partCount: 1,
      },
    };
  });
}

function selectCandidateLeaseClauses(clauses: EmbeddedClauseRecord[]): EmbeddedClauseRecord[] {
  const byTopic = new Map<ClauseTopicId, EmbeddedClauseRecord[]>();

  for (const clause of clauses) {
    if (!clause.topic) {
      continue;
    }

    const existing = byTopic.get(clause.topic) ?? [];
    existing.push(clause);
    byTopic.set(clause.topic, existing);
  }

  return Array.from(byTopic.values()).flatMap((group) =>
    [...group]
      .sort((left, right) => {
        const leftHasHeading = left.heading ? 1 : 0;
        const rightHasHeading = right.heading ? 1 : 0;
        if (leftHasHeading !== rightHasHeading) {
          return rightHasHeading - leftHasHeading;
        }

        return right.text.length - left.text.length;
      })
      .slice(0, MAX_LEASE_CLAUSES_PER_TOPIC),
  );
}

function mergeFieldMaps(
  base: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  incoming: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
): Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> {
  const next = { ...base };

  for (const [fieldId, value] of Object.entries(incoming) as Array<
    [LeaseFieldId, ExtractedValue<unknown>]
  >) {
    const existing = next[fieldId];
    if (!existing || value.confidence >= existing.confidence) {
      next[fieldId] = value;
    }
  }

  return next;
}

function buildInitialFields(
  normalizedText: string,
  scalarHints?: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
): Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> {
  const hintedKind = scalarHints?.['document.kind'];
  const hintedLanguage = scalarHints?.['document.language'];
  const inferredKind = inferLeaseDocumentKind(normalizedText);

  return {
    'document.language':
      hintedLanguage ??
      ({
        value: detectLanguage(normalizedText),
        confidence: 0.7,
        status: 'derived',
      } satisfies ExtractedValue<SupportedDocumentLanguage>),
    'document.kind':
      hintedKind ??
      (inferredKind
        ? ({
            value: inferredKind,
            confidence: 0.7,
            status: 'derived',
          } satisfies ExtractedValue<string>)
        : ({
            value: null,
            confidence: 0.3,
            status: 'missing',
            notes: ['RAG clause extractor could not confidently scope the document.'],
          } satisfies ExtractedValue<string | null>)),
  };
}

export async function extractRagClauses({
  text,
  fileName,
  scalarHints,
}: ExtractRagClausesInput): Promise<RagClauseExtractionResult> {
  const normalizedText = normalizeWhitespace(text);
  const baseLeaseClauses = selectCandidateLeaseClauses(
    consolidateLeaseClauses(buildLeaseClauses(normalizedText)),
  );
  const referenceIndex = getRegisteredLawClauseIndex();
  const warnings: string[] = [];
  const clauseBundles: LeaseClauseBundleResult[] = [];

  let leaseClauses = baseLeaseClauses;
  let fields = buildInitialFields(normalizedText, scalarHints);

  try {
    const vectors = await embedDocumentTexts(
      baseLeaseClauses.map((clause) => `${clause.heading ?? ''}\n${clause.text}`.trim()),
    );
    leaseClauses = baseLeaseClauses.map((clause, index) => ({
      ...clause,
      embedding: vectors[index],
    }));
  } catch (error) {
    warnings.push(
      `Embedding-based clause retrieval is unavailable, so reference matching fell back to lexical scoring only: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (referenceIndex.length === 0) {
    warnings.push(
      'No precomputed legal reference index is registered yet. RAG clause extraction has no law/guidance/explanation context to attach as evidence.',
    );
  }
  const clauseInputs = leaseClauses.flatMap((leaseClause) => {
    if (!leaseClause.topic) {
      return [];
    }

    return [
      {
        leaseClause,
        referenceBundle: retrieveReferenceBundle({
          leaseClause,
          referenceIndex,
          limitPerKind: 1,
        }),
      },
    ];
  });

  for (const clauseInput of clauseInputs) {
    const fieldExtraction = extractRagClauseFields({
      clause: clauseInput.leaseClause,
      referenceBundle: clauseInput.referenceBundle,
    });

    clauseBundles.push({
      clause: clauseInput.leaseClause,
      referenceBundle: clauseInput.referenceBundle,
      fieldExtraction,
    });

    fields = mergeFieldMaps(fields, fieldExtraction.fields);
  }

  if (fileName) {
    warnings.push(`Processed experimental RAG clause analysis for ${fileName}.`);
  }

  const missingFields = Object.entries(fields)
    .filter(([, field]) => field?.status === 'missing')
    .map(([fieldId]) => fieldId as LeaseFieldId);

  return {
    extraction: {
      schema: 'be-flanders-residential-v1',
      documentTypeConfidence: fields['document.kind']?.status === 'derived' ? 0.7 : 0.3,
      detectedLanguage:
        (fields['document.language']?.value as SupportedDocumentLanguage | null | undefined) ??
        'unknown',
      fields,
      missingFields,
      warnings,
    },
    clauseBundles,
    leaseClauses,
  };
}
