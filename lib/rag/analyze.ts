import { mapExplanations } from '@/lib/explanations';
import { extractRagClauses } from '@/lib/rag/clause-extract';
import { buildMergedExtractionResult, extractScalarRegexFields, mergeFieldMaps } from '@/lib/rag/scalar';
import { runRules } from '@/lib/rules';
import type { EmbeddedClauseRecord } from '@/lib/rag/retrieve';
import type {
  AnalysisResult,
  ExtractionMeta,
  ExtractedFieldSummary,
  ExtractedValue,
  FieldCoverageEntry,
  Flag,
  LeaseFieldId,
} from '@/types';

import rawLawIndex from '@/data/rag/law-index.json';

const FIELD_LABELS: Partial<Record<LeaseFieldId, string>> = {
  'document.kind': 'Document kind',
  'document.language': 'Detected language',
  'lease.duration': 'Lease duration',
  'lease.type': 'Lease type',
  'rent.baseAmount': 'Monthly rent',
  'charges.amount': 'Charges amount',
  'charges.mode': 'Charges mode',
  'deposit.amount': 'Security deposit',
  'deposit.months': 'Deposit (months)',
  'deposit.method': 'Deposit method',
  'deposit.heldByLandlord': 'Deposit held by landlord',
  'registration.mentioned': 'Registration mentioned',
  'registration.assignedToTenant': 'Registration assigned to tenant',
  'registration.deadlineMonths': 'Registration deadline',
  'inventory.mentioned': 'Entry inventory mentioned',
  'inventory.waived': 'Entry inventory waived',
  'insurance.fireMentioned': 'Fire insurance mentioned',
  'insurance.fireTenantMentioned': 'Tenant fire insurance',
  'insurance.fireLandlordMentioned': 'Landlord fire insurance',
  'notice.tenantMonths': 'Tenant notice period',
  'notice.landlordMonths': 'Landlord notice period',
  'notice.tenantFeeMonths': 'Tenant break fee',
  'notice.landlordFeeMonths': 'Landlord break fee',
  'termination.tenantPreStartFeeMonths': 'Student pre-start cancellation fee',
  'termination.landlordEarlyAllowed': 'Landlord early termination',
  'termination.tenantEarlyForbidden': 'Tenant early termination forbidden',
  'termination.autoForNonPayment': 'Auto-termination for non-payment',
  'charges.propertyTaxToTenant': 'Property tax to tenant',
  'renewal.auto': 'Automatic renewal',
};

function formatFieldValue(fieldId: LeaseFieldId, field: ExtractedValue<unknown>): string {
  const value = field.value;
  if (value === null || value === undefined) {
    return field.status === 'ambiguous' ? 'Ambiguous' : 'Not found';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (fieldId === 'rent.baseAmount' || fieldId === 'charges.amount' || fieldId === 'deposit.amount') {
    return `EUR ${value}`;
  }

  if (
    fieldId === 'deposit.months' ||
    fieldId === 'lease.duration' ||
    fieldId === 'registration.deadlineMonths' ||
    fieldId === 'notice.tenantMonths' ||
    fieldId === 'notice.landlordMonths' ||
    fieldId === 'notice.tenantFeeMonths' ||
    fieldId === 'notice.landlordFeeMonths' ||
    fieldId === 'termination.tenantPreStartFeeMonths'
  ) {
    return `${value} months`;
  }

  if (fieldId === 'lease.type') {
    const types: Record<string, string> = {
      short_term: 'Short-term',
      nine_year: '9-year',
      long_term: 'Long-term',
      student: 'Student',
    };
    return types[String(value)] ?? String(value);
  }

  if (fieldId === 'document.kind') {
    const kinds: Record<string, string> = {
      residential_lease: 'Residential lease',
      commercial_lease: 'Commercial lease',
      common_law_dwelling_lease: 'Common-law dwelling lease',
      student_lease: 'Student lease',
      sublease: 'Sublease',
      social_housing_lease: 'Social housing lease',
      social_housing_head_lease: 'Social housing head lease',
      regulated_residential_lease: 'Regulated residential lease',
      regulated_head_lease: 'Regulated head lease',
      regulated_sublease: 'Regulated sublease',
      unknown_lease: 'Unknown lease type',
    };
    return kinds[String(value)] ?? String(value);
  }

  if (fieldId === 'charges.mode') {
    const modes: Record<string, string> = {
      included_in_rent: 'Included in rent',
      advance: 'Advance / provision',
      fixed: 'Fixed / forfaitaire',
      metered: 'Metered',
    };
    return modes[String(value)] ?? String(value);
  }

  if (fieldId === 'deposit.method') {
    const methods: Record<string, string> = {
      blocked_account: 'Blocked account',
      landlord_account: 'Landlord account',
      cash: 'Cash',
      bank_guarantee: 'Bank guarantee',
      ocmw_bank_guarantee: 'OCMW bank guarantee',
      third_party_surety: 'Third-party surety',
    };
    return methods[String(value)] ?? String(value);
  }

  if (fieldId === 'document.language') {
    const langs: Record<string, string> = { nl: 'Dutch', fr: 'French', en: 'English', unknown: 'Unknown' };
    return langs[String(value)] ?? String(value);
  }

  return String(value);
}

function buildFieldSummaries(
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
): ExtractedFieldSummary[] {
  return (Object.entries(FIELD_LABELS) as Array<[LeaseFieldId, string]>)
    .flatMap(([fieldId, label]) => {
      const field = fields[fieldId];
      if (!field || field.status === 'missing') {
        return [];
      }

      return [
        {
          label,
          value: formatFieldValue(fieldId, field),
          confidence: field.confidence,
        },
      ];
    });
}

function buildExtractionMeta(extraction: {
  documentTypeConfidence: number;
  detectedLanguage: ExtractionMeta['detectedLanguage'];
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>;
  missingFields: LeaseFieldId[];
  warnings: string[];
}): ExtractionMeta {
  const fieldEntries = Object.entries(extraction.fields) as Array<
    [LeaseFieldId, ExtractedValue<unknown>]
  >;
  const foundFields = fieldEntries.filter(
    ([, field]) => field.status === 'found' || field.status === 'derived',
  ).length;

  const fieldCoverage: FieldCoverageEntry[] = fieldEntries.map(([fieldId, field]) => ({
    fieldId,
    status: field.status,
    confidence: field.confidence,
  }));

  return {
    documentTypeConfidence: extraction.documentTypeConfidence,
    detectedLanguage: extraction.detectedLanguage,
    totalFields: fieldEntries.length,
    foundFields,
    missingFields: extraction.missingFields,
    fieldCoverage,
    warnings: extraction.warnings,
  };
}

function buildSummary(
  flags: Flag[],
  meta: ExtractionMeta,
  textIsEmpty: boolean,
  documentKind: string | null,
): string {
  if (textIsEmpty) {
    return 'The PDF did not contain readable text. No analysis could be performed.';
  }

  if (documentKind && documentKind !== 'residential_lease' && documentKind !== 'student_lease') {
    return 'This document appears to fall outside the current Flemish residential and student lease scope, so the legal rule checks were not applied.';
  }

  if (meta.foundFields < 3) {
    return `We could only extract ${meta.foundFields} fields \u2014 results may be incomplete. Review the full document with a legal professional.`;
  }

  if (flags.length === 0) {
    return documentKind === 'student_lease'
      ? 'No issues were flagged in this automated student-lease review. That does not guarantee the contract is compliant.'
      : 'No issues were flagged in this automated review. That does not guarantee the contract is compliant.';
  }

  return `Found ${flags.length} potential issue${flags.length > 1 ? 's' : ''} in your lease. Please review the original clauses carefully.`;
}

let cachedLawIndexRecords: EmbeddedClauseRecord[] | null = null;

function parseRawLawIndexToEmbeddedRecords(rawIndex: {
  references: Array<{
    id: string;
    kind: string;
    topic: string;
    title: string;
    language: string;
    ruleIds: string[];
    text: string;
    keywords?: string[];
    sources?: Array<{ label: string; url: string }>;
    embedding: number[];
  }>;
}): EmbeddedClauseRecord[] {
  return rawIndex.references.map((entry) => ({
    id: entry.id,
    source: 'reference',
    topic: entry.topic as any,
    heading: entry.title,
    text: entry.text,
    embedding: entry.embedding,
    keywords: entry.keywords,
    referenceKind: entry.kind as any,
    metadata: {
      language: entry.language,
      ruleIds: entry.ruleIds.join('|'),
      sourceUrls: (entry.sources ?? []).map((source) => source.url).join('|'),
      sourceLabels: (entry.sources ?? []).map((source) => source.label).join('|'),
    },
  }));
}

function getLawIndexRecords(): EmbeddedClauseRecord[] {
  if (!cachedLawIndexRecords) {
    cachedLawIndexRecords = parseRawLawIndexToEmbeddedRecords(rawLawIndex as any);
  }
  return cachedLawIndexRecords;
}

export interface AnalyzeLeaseInput {
  text: string;
  fileName?: string;
}

/**
 * Full RAG semantic clause analysis, executed 100% client-side.
 */
export async function analyzeLeaseClientSide({
  text,
  fileName,
}: AnalyzeLeaseInput): Promise<AnalysisResult> {
  const referenceIndex = getLawIndexRecords();

  const scalarExtraction = extractScalarRegexFields(
    {
      text,
      fileName,
      mimeType: 'application/pdf',
    },
    {
      schema: 'be-flanders-residential-v1',
      country: 'BE',
      region: 'FLANDERS',
      returnEvidence: true,
      strictness: 'balanced',
    },
  );

  const clauseResult = await extractRagClauses({
    text,
    fileName,
    scalarHints: scalarExtraction.fields,
    referenceIndex,
  });

  const mergedFields = mergeFieldMaps(
    scalarExtraction.fields,
    clauseResult.extraction.fields,
    {
      'document.kind': scalarExtraction.fields['document.kind'],
      'document.language': scalarExtraction.fields['document.language'],
    },
  );

  const extraction = buildMergedExtractionResult(
    scalarExtraction,
    mergedFields,
    clauseResult.extraction.warnings,
  );

  const flags = runRules(extraction);
  const explanations = mapExplanations(flags);
  const extractedFields = buildFieldSummaries(extraction.fields);
  const extractionMeta = buildExtractionMeta(extraction);
  const documentKind =
    (extraction.fields['document.kind']?.value as string | null | undefined) ?? null;

  return {
    summary: buildSummary(flags, extractionMeta, !text.trim(), documentKind),
    flags,
    explanations,
    extractedFields,
    extraction: extractionMeta,
  };
}

/**
 * Instant fallback analyzer using regex / scalar parsing without waiting for embeddings.
 */
export function analyzeLeaseFast({
  text,
  fileName,
}: AnalyzeLeaseInput): AnalysisResult {
  const scalarExtraction = extractScalarRegexFields(
    {
      text,
      fileName,
      mimeType: 'application/pdf',
    },
    {
      schema: 'be-flanders-residential-v1',
      country: 'BE',
      region: 'FLANDERS',
      returnEvidence: true,
      strictness: 'balanced',
    },
  );

  const flags = runRules(scalarExtraction);
  const explanations = mapExplanations(flags);
  const extractedFields = buildFieldSummaries(scalarExtraction.fields);
  const extractionMeta = buildExtractionMeta(scalarExtraction);
  const documentKind =
    (scalarExtraction.fields['document.kind']?.value as string | null | undefined) ?? null;

  return {
    summary: buildSummary(flags, extractionMeta, !text.trim(), documentKind),
    flags,
    explanations,
    extractedFields,
    extraction: extractionMeta,
  };
}
