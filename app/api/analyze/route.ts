import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { extractFields } from '@/lib/extract';
import { runRules } from '@/lib/rules';
import { mapExplanations } from '@/lib/explanations';
import { rateLimiter } from '@/lib/rate-limit';
import type {
  AnalysisResult,
  ExtractionMeta,
  ExtractedFieldSummary,
  ExtractedValue,
  FieldCoverageEntry,
  Flag,
  LeaseFieldId,
} from '@/types';

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB

const FIELD_LABELS: Record<string, string> = {
  'lease.duration': 'Lease duration',
  'lease.type': 'Lease type',
  'rent.baseAmount': 'Monthly rent',
  'rent.indexationFrequencyMonths': 'Indexation frequency',
  'rent.indexationAutomatic': 'Automatic indexation',
  'deposit.amount': 'Security deposit',
  'deposit.months': 'Deposit (months)',
  'deposit.heldByLandlord': 'Deposit held by landlord',
  'charges.propertyTaxToTenant': 'Property tax to tenant',
  'notice.tenantMonths': 'Tenant notice period',
  'notice.landlordMonths': 'Landlord notice period',
  'notice.tenantFeeMonths': 'Tenant break fee',
  'notice.landlordFeeMonths': 'Landlord break fee',
  'termination.landlordEarlyAllowed': 'Landlord early termination',
  'termination.autoForNonPayment': 'Auto-termination for non-payment',
  'registration.assignedToTenant': 'Registration assigned to tenant',
  'inventory.mentioned': 'Entry inventory mentioned',
  'inventory.waived': 'Entry inventory waived',
  'insurance.fireTenantMentioned': 'Tenant fire insurance',
  'insurance.fireLandlordMentioned': 'Landlord fire insurance',
  'renewal.auto': 'Automatic renewal',
  'document.language': 'Detected language',
};

function formatFieldValue(key: string, field: ExtractedValue<unknown>): string {
  const v = field.value;
  if (v === null || v === undefined) return 'Not found';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key === 'rent.baseAmount') return `EUR ${v}`;
  if (key === 'deposit.amount') return `EUR ${v}`;
  if (key === 'lease.duration') return `${v} months`;
  if (key === 'rent.indexationFrequencyMonths') return `Every ${v} months`;
  if (key === 'notice.tenantMonths' || key === 'notice.landlordMonths') return `${v} months`;
  if (key === 'notice.tenantFeeMonths' || key === 'notice.landlordFeeMonths') return `${v} months`;
  if (key === 'deposit.months') return `${v} months`;
  if (key === 'lease.type') {
    const types: Record<string, string> = { short_term: 'Short-term', nine_year: '9-year', long_term: 'Long-term' };
    return types[v as string] ?? String(v);
  }
  if (key === 'document.language') {
    const langs: Record<string, string> = { nl: 'Dutch', fr: 'French', en: 'English', unknown: 'Unknown' };
    return langs[v as string] ?? String(v);
  }
  return String(v);
}

function buildFieldSummaries(
  fields: Partial<Record<string, ExtractedValue<unknown>>>,
): ExtractedFieldSummary[] {
  const summaries: ExtractedFieldSummary[] = [];

  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const field = fields[key];
    if (!field || field.status === 'missing') continue;

    summaries.push({
      label,
      value: formatFieldValue(key, field),
      confidence: field.confidence,
    });
  }

  return summaries;
}

function buildExtractionMeta(extraction: {
  documentTypeConfidence: number;
  detectedLanguage: string;
  fields: Partial<Record<string, ExtractedValue<unknown>>>;
  missingFields: LeaseFieldId[];
  warnings: string[];
}): ExtractionMeta {
  const fieldEntries = Object.entries(extraction.fields) as Array<
    [LeaseFieldId, ExtractedValue<unknown>]
  >;

  const foundFields = fieldEntries.filter(
    ([, f]) => f.status === 'found' || f.status === 'derived',
  ).length;

  const fieldCoverage: FieldCoverageEntry[] = fieldEntries.map(([fieldId, f]) => ({
    fieldId,
    status: f.status,
    confidence: f.confidence,
  }));

  return {
    documentTypeConfidence: extraction.documentTypeConfidence,
    detectedLanguage: extraction.detectedLanguage as ExtractionMeta['detectedLanguage'],
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
): string {
  if (textIsEmpty) {
    return 'The PDF did not contain readable text. No analysis could be performed.';
  }

  if (meta.documentTypeConfidence < 0.35) {
    return 'This document does not appear to be a residential lease. The results below may not be relevant.';
  }

  if (meta.foundFields < 5) {
    return `We could only extract ${meta.foundFields} of ${meta.totalFields} fields \u2014 results may be incomplete. Review the full document with a legal professional.`;
  }

  if (flags.length === 0) {
    return `We checked ${meta.totalFields} fields and found no issues. Review the full document for any clauses not covered by automated checks.`;
  }

  return `Found ${flags.length} potential issue${flags.length > 1 ? 's' : ''} in your lease (checked ${meta.foundFields} of ${meta.totalFields} fields).`;
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

  const extractionInput = {
    text,
    fileName: 'name' in file && typeof file.name === 'string' ? file.name : undefined,
    mimeType: file.type || 'application/pdf',
  };

  const extraction = extractFields(extractionInput, {
    schema: 'be-flanders-residential-v1',
    country: 'BE',
    region: 'FLANDERS',
    returnEvidence: true,
    strictness: 'balanced',
  });

  const flags = runRules(extraction);
  const explanations = mapExplanations(flags);
  const extractedFields = buildFieldSummaries(extraction.fields);
  const extractionMeta = buildExtractionMeta(extraction);

  const result: AnalysisResult = {
    summary: buildSummary(flags, extractionMeta, !text.trim()),
    flags,
    explanations,
    extractedFields,
    extraction: extractionMeta,
  };

  return NextResponse.json(result);
}
