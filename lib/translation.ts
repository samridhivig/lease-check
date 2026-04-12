import path from 'path';

import { franc } from 'franc-min';

const DUTCH_LANGUAGE_CODE = 'nld';
const DUTCH_MODEL_ID = 'Xenova/opus-mt-nl-en';
const LANGUAGE_SAMPLE_LIMIT = 4000;
const MIN_DETECTION_LENGTH = 50;
const MAX_CHARS_PER_CHUNK = 900;

type TranslationChunk = {
  translation_text: string;
};

type DutchTranslator = (
  text: string,
  options?: Record<string, unknown>
) => Promise<TranslationChunk[]>;

export interface DocumentTranslationResult {
  detectedLanguage: string;
  detectedLanguageCode: string;
  translatedText: string | null;
  skippedReason: string | null;
}

const languageLabels: Record<string, string> = {
  nld: 'Dutch',
  eng: 'English',
  fra: 'French',
  deu: 'German',
  und: 'Unknown',
};

const globalForTranslation = globalThis as typeof globalThis & {
  dutchTranslatorPromise?: Promise<DutchTranslator>;
};

async function getDutchTranslator(): Promise<DutchTranslator> {
  if (!globalForTranslation.dutchTranslatorPromise) {
    globalForTranslation.dutchTranslatorPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');

      env.cacheDir = path.join(process.cwd(), '.cache', 'transformers');

      return (await pipeline('translation', DUTCH_MODEL_ID)) as DutchTranslator;
    })();
  }

  try {
    return await globalForTranslation.dutchTranslatorPromise;
  } catch (error) {
    globalForTranslation.dutchTranslatorPromise = undefined;
    throw error;
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectLanguage(text: string): { code: string; label: string } {
  const sample = normalizeText(text).slice(0, LANGUAGE_SAMPLE_LIMIT);

  if (sample.length < MIN_DETECTION_LENGTH) {
    return { code: 'und', label: 'Unknown' };
  }

  const code = franc(sample, { minLength: MIN_DETECTION_LENGTH });

  return {
    code,
    label: languageLabels[code] ?? code.toUpperCase(),
  };
}

function splitLongSegment(segment: string): string[] {
  if (segment.length <= MAX_CHARS_PER_CHUNK) {
    return [segment];
  }

  const sentences = segment.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (sentences.length <= 1) {
    const parts: string[] = [];

    for (let start = 0; start < segment.length; start += MAX_CHARS_PER_CHUNK) {
      parts.push(segment.slice(start, start + MAX_CHARS_PER_CHUNK));
    }

    return parts;
  }

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length > MAX_CHARS_PER_CHUNK) {
      if (current) {
        chunks.push(current);
      }

      const overflowChunks = splitLongSegment(sentence);
      chunks.push(...overflowChunks.slice(0, -1));
      current = overflowChunks.at(-1) ?? '';
      continue;
    }

    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function chunkDocument(text: string): string[] {
  const paragraphs = normalizeText(text).split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHARS_PER_CHUNK) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      chunks.push(...splitLongSegment(paragraph));
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length > MAX_CHARS_PER_CHUNK) {
      if (current) {
        chunks.push(current);
      }
      current = paragraph;
      continue;
    }

    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function translateDutchText(text: string): Promise<string> {
  const translator = await getDutchTranslator();
  const chunks = chunkDocument(text);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    const output = await translator(chunk, {
      max_new_tokens: 512,
    });

    translatedChunks.push(output[0]?.translation_text?.trim() ?? '');
  }

  return translatedChunks.join('\n\n').trim();
}

export async function translateDocument(text: string): Promise<DocumentTranslationResult> {
  const normalizedText = normalizeText(text);
  const detection = detectLanguage(normalizedText);

  if (!normalizedText) {
    return {
      detectedLanguage: 'Unknown',
      detectedLanguageCode: 'und',
      translatedText: null,
      skippedReason: 'The PDF did not contain readable text.',
    };
  }

  if (detection.code !== DUTCH_LANGUAGE_CODE) {
    return {
      detectedLanguage: detection.label,
      detectedLanguageCode: detection.code,
      translatedText: null,
      skippedReason:
        detection.code === 'und'
          ? 'The document language could not be detected, so translation was skipped.'
          : `Translation currently runs only for Dutch documents. Detected ${detection.label}.`,
    };
  }

  const translatedText = await translateDutchText(normalizedText);

  return {
    detectedLanguage: detection.label,
    detectedLanguageCode: detection.code,
    translatedText,
    skippedReason: null,
  };
}
