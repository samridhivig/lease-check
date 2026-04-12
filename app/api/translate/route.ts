import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';

import { translateDocument } from '@/lib/translation';

export const runtime = 'nodejs';

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

  const result = await translateDocument(text);
  return NextResponse.json(result);
}
