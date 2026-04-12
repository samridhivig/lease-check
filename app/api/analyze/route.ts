import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { extractFields } from '@/lib/extract';
import { runRules } from '@/lib/rules';
import { mapExplanations } from '@/lib/explanations';
import type { AnalysisResult } from '@/types';

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

  const result: AnalysisResult = {
    summary:
      flags.length === 0
        ? 'No issues detected. Review the full document for any clauses not covered by automated checks.'
        : `Found ${flags.length} potential issue${flags.length > 1 ? 's' : ''} in your lease.`,
    flags,
    explanations,
  };

  return NextResponse.json(result);
}
