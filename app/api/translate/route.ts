import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';

import { translateDocument } from '@/lib/translation';
import { rateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB

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

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a file upload.' },
      { status: 415 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid form-data payload. Please upload a PDF file.' },
      { status: 400 },
    );
  }

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
    const result = await translateDocument(text);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Translation failed', error);
    return NextResponse.json(
      {
        error:
          'Translation is temporarily unavailable. Please try again in a moment.',
      },
      { status: 503 },
    );
  }
}
