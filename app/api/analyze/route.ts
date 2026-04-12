import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { extractFields } from '@/lib/extract';
import { runRules } from '@/lib/rules';
import { mapExplanations } from '@/lib/explanations';
import type { AnalysisResult, ExtractedFieldSummary, ExtractedValue } from '@/types';

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

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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

  const result: AnalysisResult = {
    summary:
      flags.length === 0
        ? 'No issues detected. Review the full document for any clauses not covered by automated checks.'
        : `Found ${flags.length} potential issue${flags.length > 1 ? 's' : ''} in your lease.`,
    flags,
    explanations,
    extractedFields,
  };

  return NextResponse.json(result);
}
