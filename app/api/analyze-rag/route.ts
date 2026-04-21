import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { mapExplanations } from '@/lib/explanations';
import { extractRagClauses } from '@/lib/rag/clause-extract';
import { ensureLawClauseIndexRegistered } from '@/lib/rag/law-corpus';
import { buildMergedExtractionResult, extractScalarRegexFields, mergeFieldMaps } from '@/lib/rag/scalar';
import { rateLimiter } from '@/lib/rate-limit';
import { runRules } from '@/lib/rules';
import type {
  AnalysisResult,
  ExtractionMeta,
  ExtractedFieldSummary,
  ExtractedValue,
  FieldCoverageEntry,
  Flag,
  LeaseFieldId,
} from '@/types';

const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

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
    return 'The PDF did not contain readable text. No RAG clause analysis could be performed.';
  }

  if (documentKind && documentKind !== 'residential_lease' && documentKind !== 'student_lease') {
    return 'This experimental RAG analyzer could not confidently place the document inside the Flemish residential lease scope.';
  }

  if (meta.foundFields < 3) {
    return 'The experimental RAG analyzer found only a few clause signals. Compare against the current analyzer before relying on these results.';
  }

  if (flags.length === 0) {
    return documentKind === 'student_lease'
      ? 'The experimental RAG analyzer did not flag any issues in this student lease. It combines the current scalar regex extraction with deterministic RAG clause extraction, so compare it against the baseline analyzer before relying on it.'
      : 'The experimental RAG analyzer did not flag any issues. It combines the current scalar regex extraction with deterministic RAG clause extraction, so compare it against the baseline analyzer before relying on it.';
  }

  return `The experimental RAG analyzer found ${flags.length} potential issue${flags.length > 1 ? 's' : ''}. Compare these results with the current analyzer before drawing conclusions.`;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  const rateCheck = rateLimiter.check(getClientIp(req));
  if (!rateCheck.allowed) {
    const res = NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
    res.headers.set(
      'Retry-After',
      String(Math.ceil((rateCheck.retryAfterMs ?? 60_000) / 1000)),
    );
    return res;
  }

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File exceeds the 4.5 MB size limit.' },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    const parsed = await pdf(buffer);
    text = parsed.text;
  } catch {
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 422 });
  }

  try {
    await ensureLawClauseIndexRegistered();
  } catch (error) {
    console.warn('Failed to load precomputed RAG law index', error);
  }

  const scalarExtraction = extractScalarRegexFields(
    {
      text,
      fileName: 'name' in file && typeof file.name === 'string' ? file.name : undefined,
      mimeType: file.type || 'application/pdf',
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
    fileName: 'name' in file && typeof file.name === 'string' ? file.name : undefined,
    scalarHints: scalarExtraction.fields,
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
    (extraction.fields['document.kind']?.value as string | null | undefined) ??
    null;

  const result: AnalysisResult = {
    summary: buildSummary(flags, extractionMeta, !text.trim(), documentKind),
    flags,
    explanations,
    extractedFields,
    extraction: extractionMeta,
  };

  return NextResponse.json(result);
}
