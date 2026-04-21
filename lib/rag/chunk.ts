export type RagChunkKind = 'preamble' | 'clause' | 'clause_part';

export type RagClauseTopic =
  | 'duration'
  | 'rent'
  | 'charges'
  | 'deposit'
  | 'registration'
  | 'inventory'
  | 'insurance'
  | 'tenant_termination'
  | 'landlord_termination'
  | 'breach'
  | 'renewal'
  | 'other';

export interface RagChunk {
  id: string;
  documentId: string;
  text: string;
  normalizedText: string;
  heading: string;
  articleNumber: string | null;
  kind: RagChunkKind;
  topic: RagClauseTopic;
  startOffset: number;
  endOffset: number;
  partIndex: number;
  partCount: number;
}

export interface BuildClauseAwareChunksOptions {
  documentId?: string;
  maxCharsPerChunk?: number;
  overlapChars?: number;
}

interface ClauseBoundary {
  heading: string;
  articleNumber: string | null;
  startOffset: number;
}

const DEFAULT_MAX_CHARS_PER_CHUNK = 1_600;
const DEFAULT_OVERLAP_CHARS = 220;

const CLAUSE_HEADING_REGEX =
  /(?:^|\n)\s*((?:(?:artikel|article|art\.)\s*\d+(?:\.\d+)*)|(?:\d+(?:\.\d+)*[.)]))(?:\s*[:.-]?\s*([^\n]{0,160}))?(?=\n|$)/gi;

function normalizeText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function flattenText(text: string): string {
  return normalizeText(text).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeHeadingToken(token: string): string {
  return token.replace(/\s+/g, ' ').trim().replace(/[.)]$/, '');
}

function buildHeading(token: string, trailing: string | undefined): string {
  const cleanToken = normalizeHeadingToken(token);
  const cleanTrailing = (trailing ?? '').trim();

  if (/^(artikel|article|art\.)/i.test(cleanToken)) {
    return cleanTrailing ? `${cleanToken}: ${cleanTrailing}` : cleanToken;
  }

  return cleanTrailing ? `${cleanToken} ${cleanTrailing}` : cleanToken;
}

function detectClauseBoundaries(text: string): ClauseBoundary[] {
  const matches = Array.from(text.matchAll(CLAUSE_HEADING_REGEX));

  return matches.map((match) => {
    const token = match[1] ?? '';
    const heading = buildHeading(token, match[2]);
    const numericMatch = normalizeHeadingToken(token).match(/(\d+(?:\.\d+)*)/);

    return {
      heading,
      articleNumber: numericMatch?.[1] ?? null,
      startOffset: match.index ?? 0,
    };
  });
}

function classifyTopic(text: string): RagClauseTopic {
  const lower = flattenText(text).toLowerCase();

  if (/plaatsbeschrijving|inventory|etat des lieux/.test(lower)) {
    return 'inventory';
  }

  if (
    /brandverzekering|fire insurance|assurance incendie|verzeker|verzekering|brand- en waterschade|brand en waterschade|waterschade/.test(
      lower,
    )
  ) {
    return 'insurance';
  }

  if (
    /opzeggingsmogelijkheden voor de huurder|opzegging door de huurder|huurder kan de huurovereenkomst|tegenopzeg|opzeggingstermijn|opzeggingsvergoeding|early termination|cancellation fee|notice period|be[eë]indiging van zijn studie/.test(
      lower,
    )
  ) {
    return 'tenant_termination';
  }

  if (
    /opzeggingsmogelijkheden voor de verhuurder|opzegging door de verhuurder|verhuurder kan de huurovereenkomst|eigen betrekking|persoonlijk gebruik|renovatiewerken|verbouwingswerken|ongemotiveerde opzegging/.test(
      lower,
    )
  ) {
    return 'landlord_termination';
  }

  if (/registr(?:atie|eren)|registration|enregistrement/.test(lower)) {
    return 'registration';
  }

  if (/huurwaarborg|waarborg|security deposit|deposit|garantie locative|bankwaarborg/.test(lower)) {
    return 'deposit';
  }

  if (/kosten en lasten|charges|costs|onroerende voorheffing|property tax|precompte immobilier/.test(lower)) {
    return 'charges';
  }

  if (/huurprijs|basishuurprijs|loyer|index(?:atie|ering)|indexation/.test(lower)) {
    return 'rent';
  }

  if (/ontbinding|schuld van de huurder|niet nakomt|wanbetaling|wangebruik|van rechtswege/.test(lower)) {
    return 'breach';
  }

  if (
    /duur van de huurovereenkomst|korte duur|negenjarig|9 jaar|lange duur|totale duur van de huur|wordt gesloten voor een duur/.test(
      lower,
    )
  ) {
    return 'duration';
  }

  if (/verlenging|stilzwijgende verlenging|tacit renewal|automatic renewal|wederinhuring|reconduction tacite/.test(lower)) {
    return 'renewal';
  }

  return 'other';
}

function splitClauseText(
  text: string,
  maxCharsPerChunk: number,
  overlapChars: number,
): string[] {
  if (text.length <= maxCharsPerChunk) {
    return [text];
  }

  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return splitRawText(text, maxCharsPerChunk, overlapChars);
  }

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxCharsPerChunk) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length > maxCharsPerChunk) {
      chunks.push(...splitRawText(paragraph, maxCharsPerChunk, overlapChars));
      current = '';
      continue;
    }

    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitRawText(
  text: string,
  maxCharsPerChunk: number,
  overlapChars: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + maxCharsPerChunk);
    if (end < text.length) {
      const window = text.slice(start, end);
      const breakPoint = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('; '),
      );

      if (breakPoint > Math.floor(maxCharsPerChunk * 0.55)) {
        end = start + breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks.filter(Boolean);
}

export function buildClauseAwareChunks(
  inputText: string,
  options: BuildClauseAwareChunksOptions = {},
): RagChunk[] {
  const documentId = options.documentId ?? 'document';
  const maxCharsPerChunk = options.maxCharsPerChunk ?? DEFAULT_MAX_CHARS_PER_CHUNK;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const text = normalizeText(inputText);

  if (!text) {
    return [];
  }

  const boundaries = detectClauseBoundaries(text);
  const baseChunks: Array<Omit<RagChunk, 'id' | 'partIndex' | 'partCount' | 'kind'>> = [];

  if (boundaries.length === 0) {
    baseChunks.push({
      documentId,
      text,
      normalizedText: flattenText(text),
      heading: '',
      articleNumber: null,
      topic: classifyTopic(text),
      startOffset: 0,
      endOffset: text.length,
    });
  } else {
    const preamble = text.slice(0, boundaries[0]?.startOffset ?? 0).trim();
    if (preamble) {
      baseChunks.push({
        documentId,
        text: preamble,
        normalizedText: flattenText(preamble),
        heading: '',
        articleNumber: null,
        topic: classifyTopic(preamble),
        startOffset: 0,
        endOffset: boundaries[0]?.startOffset ?? preamble.length,
      });
    }

    for (let index = 0; index < boundaries.length; index += 1) {
      const boundary = boundaries[index];
      const endOffset =
        index < boundaries.length - 1 ? boundaries[index + 1]?.startOffset ?? text.length : text.length;
      const rawClause = text.slice(boundary.startOffset, endOffset).trim();

      if (!rawClause) {
        continue;
      }

      baseChunks.push({
        documentId,
        text: rawClause,
        normalizedText: flattenText(rawClause),
        heading: boundary.heading,
        articleNumber: boundary.articleNumber,
        topic: classifyTopic(rawClause),
        startOffset: boundary.startOffset,
        endOffset,
      });
    }
  }

  const chunks: RagChunk[] = [];

  for (const baseChunk of baseChunks) {
    const prefix = baseChunk.heading ? `${baseChunk.heading}\n` : '';
    const body = baseChunk.heading && baseChunk.text.startsWith(baseChunk.heading)
      ? baseChunk.text.slice(baseChunk.heading.length).trimStart()
      : baseChunk.text;
    const splitParts = splitClauseText(body, Math.max(250, maxCharsPerChunk - prefix.length), overlapChars);
    const partCount = splitParts.length;
    const stem =
      baseChunk.articleNumber !== null
        ? `article-${baseChunk.articleNumber}`
        : baseChunk.heading
          ? slugify(baseChunk.heading)
          : 'preamble';

    for (let partIndex = 0; partIndex < splitParts.length; partIndex += 1) {
      const partText = prefix ? `${prefix}${splitParts[partIndex]}`.trim() : splitParts[partIndex].trim();
      chunks.push({
        id: `${documentId}:${stem}:${partIndex + 1}`,
        documentId,
        text: partText,
        normalizedText: flattenText(partText),
        heading: baseChunk.heading,
        articleNumber: baseChunk.articleNumber,
        kind:
          !baseChunk.heading && partCount === 1
            ? 'preamble'
            : partCount === 1
              ? 'clause'
              : 'clause_part',
        topic: baseChunk.topic,
        startOffset: baseChunk.startOffset,
        endOffset: baseChunk.endOffset,
        partIndex: partIndex + 1,
        partCount,
      });
    }
  }

  return chunks;
}
