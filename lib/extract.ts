import type {
  ExtractFieldsInput,
  ExtractFieldsOptions,
  ExtractFieldsResult,
  ExtractedValue,
  LeaseFieldId,
  SupportedDocumentLanguage,
} from '@/types';

type ClauseActor = 'tenant' | 'landlord';
type ClauseKind = 'notice' | 'fee';
type ClauseType =
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
type SignalStatus = ExtractedValue<unknown>['status'];

interface DocumentClause {
  articleNumber: number | null;
  heading: string;
  raw: string;
  normalized: string;
  type: ClauseType;
}

interface ParsedDurationClause {
  actor: ClauseActor;
  kind: ClauseKind;
  months: number;
  snippet: string;
}

interface ParsedFieldSignal<T> {
  value: T | null;
  status: SignalStatus;
  snippet?: string;
  note?: string;
}

interface ParsedScalarSignal extends ParsedFieldSignal<number> {
}

interface ParsedStringSignal extends ParsedFieldSignal<string> {
}

interface ParsedStringListSignal extends ParsedFieldSignal<string[]> {
}

interface ParsedLeaseSignals {
  propertyAddress: string | null;
  propertyAddressStatus: SignalStatus;
  propertyAddressSnippet?: string;
  propertyAddressNote?: string;
  landlordNames: string[] | null;
  landlordNamesStatus: SignalStatus;
  landlordNamesSnippet?: string;
  landlordNamesNote?: string;
  tenantNames: string[] | null;
  tenantNamesStatus: SignalStatus;
  tenantNamesSnippet?: string;
  tenantNamesNote?: string;
  leaseStartDate: string | null;
  leaseStartDateStatus: SignalStatus;
  leaseStartDateSnippet?: string;
  leaseStartDateNote?: string;
  leaseEndDate: string | null;
  leaseEndDateStatus: SignalStatus;
  leaseEndDateSnippet?: string;
  leaseEndDateNote?: string;
  rentAmount: number | null;
  rentAmountStatus: SignalStatus;
  rentAmountSnippet?: string;
  rentAmountNote?: string;
  chargesAmount: number | null;
  chargesAmountStatus: SignalStatus;
  chargesAmountSnippet?: string;
  chargesAmountNote?: string;
  chargesMode: string | null;
  chargesModeStatus: SignalStatus;
  chargesModeSnippet?: string;
  chargesModeNote?: string;
  securityDepositAmount: number | null;
  securityDepositAmountStatus: SignalStatus;
  securityDepositAmountSnippet?: string;
  securityDepositAmountNote?: string;
  securityDepositMonths: number | null;
  securityDepositMonthsStatus: SignalStatus;
  securityDepositMonthsSnippet?: string;
  securityDepositMonthsNote?: string;
  securityDepositMethod: string | null;
  securityDepositMethodStatus: SignalStatus;
  securityDepositMethodSnippet?: string;
  securityDepositMethodNote?: string;
  depositHeldByLandlord: boolean;
  depositHeldByLandlordSnippet?: string;
  leaseTermMonths: number | null;
  leaseTermSnippet?: string;
  leaseTermStatus: SignalStatus;
  leaseTermNote?: string;
  leaseTypeHint: 'short' | 'long' | null;
  durationClauses: ParsedDurationClause[];
  tenantPreStartFeeMonths: number | null;
  tenantPreStartFeeSnippet?: string;
  tenantEarlyTerminationForbidden: boolean;
  tenantEarlyTerminationForbiddenSnippet?: string;
  landlordEarlyTerminationAllowed: boolean;
  landlordEarlyTerminationAllowedSnippet?: string;
  registrationDeadlineMonths: number | null;
  registrationDeadlineSnippet?: string;
  registrationAssignedToTenant: boolean;
  registrationAssignedToTenantSnippet?: string;
  registrationMentioned: boolean;
  registrationMentionedSnippet?: string;
  indexationFrequencyMonths: number | null;
  indexationFrequencySnippet?: string;
  automaticIndexation: boolean;
  automaticIndexationSnippet?: string;
  propertyTaxChargedToTenant: boolean;
  propertyTaxSnippet?: string;
  autoTerminationForNonPayment: boolean;
  autoTerminationSnippet?: string;
  inventoryMentioned: boolean;
  inventoryMentionedSnippet?: string;
  inventoryWaived: boolean;
  inventoryWaivedSnippet?: string;
  fireInsuranceTenantMentioned: boolean;
  fireInsuranceTenantSnippet?: string;
  fireInsuranceLandlordMentioned: boolean;
  fireInsuranceLandlordSnippet?: string;
  epcLabel: string | null;
  epcLabelStatus: SignalStatus;
  epcLabelSnippet?: string;
  epcLabelNote?: string;
  epcScore: number | null;
  epcScoreStatus: SignalStatus;
  epcScoreSnippet?: string;
  epcScoreNote?: string;
  autoRenewal: boolean;
  autoRenewalSnippet?: string;
  annexesDetected: boolean;
  annexesSnippet?: string;
}

const ARTICLE_HEADING_REGEX = /(?:^|\n)\s*(artikel|article|art\.)\s*(\d+)\s*[\.:]\s*([^\n]*)/gi;
const WORD_NUMBER_PATTERN =
  '(?:één|een|one|un|une|twee|two|deux|drie|three|trois|vier|four|quatre|vijf|five|cinq|zes|six|zeven|seven|sept|acht|eight|huit|negen|nine|neuf|tien|ten|dix|elf|eleven|onze|twaalf|twelve|douze|dertien|thirteen|treize|veertien|fourteen|quatorze|vijftien|fifteen|quinze|zestien|sixteen|seize|zeventien|seventeen|dix-sept|achttien|eighteen|dix-huit)';
const DURATION_UNIT_PATTERN =
  '(?:maanden?|maand|months?|month|mois|dagen?|dag|days?|day|jours?|jour|jaren?|jaar|years?|year|ans?)';
const DURATION_FRAGMENT_PATTERN =
  `(?:anderhalve\\s+maand|een\\s+halve\\s+maand|one\\s+and\\s+a\\s+half\\s+month|half\\s+a\\s+month|un\\s+mois\\s+et\\s+demi|demi-?mois|\\d+(?:[.,]\\d+)?\\s*${DURATION_UNIT_PATTERN}|${WORD_NUMBER_PATTERN}\\s*${DURATION_UNIT_PATTERN})`;

const WORD_NUMBERS: Array<[RegExp, number]> = [
  [/\b(?:een|één|one|un|une)\b/i, 1],
  [/\b(?:twee|two|deux)\b/i, 2],
  [/\b(?:drie|three|trois)\b/i, 3],
  [/\b(?:vier|four|quatre)\b/i, 4],
  [/\b(?:vijf|five|cinq)\b/i, 5],
  [/\b(?:zes|six)\b/i, 6],
  [/\b(?:zeven|seven|sept)\b/i, 7],
  [/\b(?:acht|eight|huit)\b/i, 8],
  [/\b(?:negen|nine|neuf)\b/i, 9],
  [/\b(?:tien|ten|dix)\b/i, 10],
  [/\b(?:elf|eleven|onze)\b/i, 11],
  [/\b(?:twaalf|twelve|douze)\b/i, 12],
  [/\b(?:dertien|thirteen|treize)\b/i, 13],
  [/\b(?:veertien|fourteen|quatorze)\b/i, 14],
  [/\b(?:vijftien|fifteen|quinze)\b/i, 15],
  [/\b(?:zestien|sixteen|seize)\b/i, 16],
  [/\b(?:zeventien|seventeen|dix-sept)\b/i, 17],
  [/\b(?:achttien|eighteen|dix-huit)\b/i, 18],
];

function normalize(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function flatten(text: string): string {
  return normalize(text).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getInputText(input: ExtractFieldsInput): string {
  if (input.text) {
    return input.text;
  }

  return (
    input.pages
      ?.map((page) => page.text?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n\n') ?? ''
  );
}

function inferDocumentKind(text: string, fileName?: string): string {
  const normalizedText = normalize(text).toLowerCase();
  const fileSource = (fileName ?? '').toLowerCase();
  const headSource = normalizedText.slice(0, 2500);
  const strongSource = `${fileSource} ${headSource}`;
  const residentialSource = `${strongSource} ${normalizedText.slice(0, 6000)}`;

  if (/handelshuur|handelshuurovereenkomst|pop-up/.test(strongSource)) {
    return 'commercial_lease';
  }

  if (/gemeen recht|common law/.test(strongSource)) {
    return 'common_law_dwelling_lease';
  }

  if (
    /studentenhuur|huurovereenkomst voor studenten|studentenkamer|studentenwoning/.test(strongSource) ||
    (/student/.test(strongSource) &&
      /academic year|student residence|main residence|hoofdverblijfplaats|model tenancy agreement/.test(residentialSource))
  ) {
    return 'student_lease';
  }

  if (/typehoofdhuurovereenkomst|\bhho\b/.test(strongSource)) {
    if (/sociale huur|sociale huurwoning|sociale huisvesting|socialehuur/.test(strongSource)) {
      return 'social_housing_head_lease';
    }

    if (/geconventioneerde huurwoning|geconventioneerdeverhuur|budgethuurwoning|geconventioneerde verhuurorganisatie/.test(strongSource)) {
      return 'regulated_head_lease';
    }
  }

  if (/onderverhuur|onderverhuring|onderhuurovereenkomst|typehuurovereenkomst voor de onderverhuring|\boho\b/.test(strongSource)) {
    if (/geconventioneerde huurwoning|geconventioneerdeverhuur|budgethuurwoning|geconventioneerde verhuurorganisatie/.test(strongSource)) {
      return 'regulated_sublease';
    }

    return 'sublease';
  }

  if (/sociale huur|sociale huurwoning|typehoofdhuurovereenkomst|typehuurovereenkomst.*sociale/i.test(strongSource)) {
    return 'social_housing_lease';
  }

  if (/geconventioneerde huurwoning|geconventioneerdeverhuur|budgethuurwoning|geconventioneerde verhuurorganisatie/.test(strongSource)) {
    return 'regulated_residential_lease';
  }

  if (/huurovereenkomst|hoofdverblijfplaats|woninghuurdecreet|woning of appartement/.test(residentialSource)) {
    return 'residential_lease';
  }

  return 'unknown_lease';
}

function parseAmount(raw: string): number {
  const sanitized = raw.replace(/[^\d,.-]/g, '');

  if (sanitized.includes(',') && sanitized.includes('.')) {
    return parseFloat(sanitized.replace(/\./g, '').replace(',', '.'));
  }

  if (sanitized.includes(',')) {
    const parts = sanitized.split(',');
    const decimalPart = parts[parts.length - 1] ?? '';

    if (decimalPart.length === 2) {
      return parseFloat(sanitized.replace(/\./g, '').replace(',', '.'));
    }

    return parseFloat(sanitized.replace(/,/g, ''));
  }

  return parseFloat(sanitized);
}

function findSnippet(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);

  if (match?.index === undefined) {
    return undefined;
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);

  return flatten(text.slice(start, end));
}

function makeValue<T>(
  value: T | null,
  config: {
    confidence: number;
    status?: ExtractedValue<T>['status'];
    snippet?: string;
    note?: string;
  },
): ExtractedValue<T> {
  const status = config.status ?? (value === null ? 'missing' : 'found');

  return {
    value,
    confidence: config.confidence,
    status,
    evidence: config.snippet ? [{ snippet: config.snippet }] : undefined,
    notes: config.note ? [config.note] : undefined,
  };
}

function classifyClause(text: string): ClauseType {
  const lower = flatten(text).toLowerCase();

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

function segmentClauses(text: string): DocumentClause[] {
  const source = normalize(text);
  const matches = Array.from(source.matchAll(ARTICLE_HEADING_REGEX));

  if (matches.length === 0) {
    return [
      {
        articleNumber: null,
        heading: '',
        raw: source,
        normalized: flatten(source),
        type: classifyClause(source),
      },
    ];
  }

  const clauses: DocumentClause[] = [];
  let preambleEnd = matches[0]?.index ?? 0;

  if (preambleEnd > 0) {
    const preamble = source.slice(0, preambleEnd).trim();
    if (preamble) {
      clauses.push({
        articleNumber: null,
        heading: '',
        raw: preamble,
        normalized: flatten(preamble),
        type: classifyClause(preamble),
      });
    }
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const end = index < matches.length - 1 ? (matches[index + 1]?.index ?? source.length) : source.length;
    const raw = source.slice(start, end).trim();
    const articleNumber = Number.parseInt(match[2] ?? '', 10);
    const heading = `Artikel ${match[2] ?? ''}${(match[3] ?? '').trim() ? `: ${(match[3] ?? '').trim()}` : ''}`;

    clauses.push({
      articleNumber: Number.isNaN(articleNumber) ? null : articleNumber,
      heading,
      raw,
      normalized: flatten(raw),
      type: classifyClause(raw),
    });
  }

  return clauses;
}

function clausesOfType(clauses: DocumentClause[], ...types: ClauseType[]): DocumentClause[] {
  return clauses.filter((clause) => types.includes(clause.type));
}

function dedupeClauses(clauses: DocumentClause[]): DocumentClause[] {
  return clauses.filter(
    (clause, index, collection) =>
      collection.findIndex((candidate) => candidate.heading === clause.heading && candidate.normalized === clause.normalized) ===
      index,
  );
}

function relevantDurationClauses(clauses: DocumentClause[]): DocumentClause[] {
  return dedupeClauses([
    ...clausesOfType(clauses, 'duration'),
    ...clauses.filter((clause) =>
      /duur van de (?:korte )?huur|duur van de huurovereenkomst|gesloten voor een duur|negenjarige huurovereenkomst|korte duur|maximaal\s+3\s+jaar/i.test(
        clause.normalized,
      ),
    ),
  ]);
}

function relevantDepositClauses(clauses: DocumentClause[]): DocumentClause[] {
  return dedupeClauses([
    ...clausesOfType(clauses, 'deposit'),
    ...clauses.filter((clause) =>
      /(?:artikel\s+11.*de waarborg|\bhuurwaarborg\b|\bwaarborg\b|security deposit|deposit|garantie locative|bankwaarborg)/i.test(
        clause.normalized,
      ),
    ),
  ]);
}

function relevantRegistrationClauses(clauses: DocumentClause[]): DocumentClause[] {
  return dedupeClauses([
    ...clausesOfType(clauses, 'registration'),
    ...clauses.filter((clause) =>
      /registr(?:atie|eren)|geregistreerd|registration|enregistrement/i.test(clause.normalized),
    ),
  ]);
}

function inferLeaseTypeHint(text: string): 'short' | 'long' | null {
  if (/korte\s+duur|short[-\s]?term|courte\s+dure[e]?|maximaal\s+3\s+jaar/i.test(text)) {
    return 'short';
  }

  if (
    /9\s*(?:jaar|jaren|years?|ans?)|negenjarig|lange\s+duur|long[-\s]?term|longue\s+dure[e]?|levenslang/i.test(
      text,
    )
  ) {
    return 'long';
  }

  return null;
}

function normalizeMonthPhrase(fragment: string): number | null {
  const lower = flatten(fragment).toLowerCase();

  if (
    /anderhalve\s+maand|one\s+and\s+a\s+half\s+month|un\s+mois\s+et\s+demi/.test(lower)
  ) {
    return 1.5;
  }

  if (/een\s+halve\s+maand|half\s+a\s+month|demi-?mois/.test(lower)) {
    return 0.5;
  }

  if (/één\s+(?:maanden?|maand|months?|month|mois)/.test(lower)) {
    return 1;
  }

  const numericMatch = lower.match(/(\d+(?:[.,]\d+)?)/);
  const unitMatch = lower.match(
    /(maanden?|maand|months?|month|mois|dagen?|dag|days?|day|jours?|jour|jaren?|jaar|years?|year|ans?)/,
  );

  if (numericMatch && unitMatch) {
    const value = parseFloat(numericMatch[1].replace(',', '.'));

    if (Number.isNaN(value)) {
      return null;
    }

    if (/^(?:dagen?|dag|days?|day|jours?|jour)$/.test(unitMatch[1])) {
      return Number((value / 30).toFixed(2));
    }

    if (/^(?:jaren?|jaar|years?|year|ans?)$/.test(unitMatch[1])) {
      return value * 12;
    }

    return value;
  }

  const unitOnlyMatch = lower.match(/(maanden?|maand|months?|month|mois|dagen?|dag|days?|day|jours?|jour|jaren?|jaar|years?|year|ans?)/);
  if (!unitOnlyMatch) {
    return null;
  }

  for (const [pattern, value] of WORD_NUMBERS) {
    if (pattern.test(lower)) {
      if (/^(?:dagen?|dag|days?|day|jours?|jour)$/.test(unitOnlyMatch[1])) {
        return Number((value / 30).toFixed(2));
      }

      if (/^(?:jaren?|jaar|years?|year|ans?)$/.test(unitOnlyMatch[1])) {
        return value * 12;
      }

      return value;
    }
  }

  return null;
}

function extractDurationValues(fragment: string): number[] {
  const pattern = new RegExp(DURATION_FRAGMENT_PATTERN, 'gi');

  const values: number[] = [];

  for (const match of fragment.matchAll(pattern)) {
    const value = normalizeMonthPhrase(match[0] ?? '');

    if (value !== null) {
      values.push(value);
    }
  }

  return values;
}

function pickClauseMatch(
  clauses: DocumentClause[],
  patterns: RegExp[],
): { snippet?: string; value?: string } {
  for (const clause of clauses) {
    for (const pattern of patterns) {
      const match = clause.normalized.match(pattern);
      if (!match) {
        continue;
      }

      return {
        snippet: findSnippet(clause.normalized, pattern),
        value: match[1] ?? match[0],
      };
    }
  }

  return {};
}

function extractLeaseTerm(
  clauses: DocumentClause[],
  leaseTypeHint: ParsedLeaseSignals['leaseTypeHint'],
): {
  months: number | null;
  snippet?: string;
  status: SignalStatus;
  note?: string;
} {
  const durationClauses = relevantDurationClauses(clauses);
  const exactPatterns = [
    new RegExp(`wordt gesloten voor een duur van\\s*(${DURATION_FRAGMENT_PATTERN})`, 'i'),
    new RegExp(`huurovereenkomst wordt gesloten voor een bepaalde duur van\\s*(${DURATION_FRAGMENT_PATTERN})`, 'i'),
    new RegExp(`duur van\\s*(${DURATION_FRAGMENT_PATTERN})`, 'i'),
  ];

  for (const clause of durationClauses) {
    const hasPrimaryDurationPlaceholder =
      /deze schriftelijke huurovereenkomst is gesloten voor een duur van\s*[.]{4,}|deze huurovereenkomst is gesloten voor een duur van\s*[.]{4,}|wordt gesloten voor een duur van\s*[.]{4,}|duur van\s*[.]{4,}\s*(?:jaar|jaren|maanden?|maand)/i.test(
        clause.normalized,
      );

    if (leaseTypeHint === 'short' && hasPrimaryDurationPlaceholder) {
      return {
        months: null,
        snippet:
          findSnippet(
            clause.normalized,
            /deze schriftelijke huurovereenkomst is gesloten voor een duur van\s*[.\s]+.*?(?:jaar|jaren|maanden?|maand)|wordt gesloten voor een duur van\s*[.\s]+.*?(?:jaar|jaren|maanden?|maand)|duur van\s*[.\s]+.*?(?:jaar|jaren|maanden?|maand)|maximum\s*3\s*jaar|maximaal\s*3\s*jaar/i,
          ) ?? clause.heading,
        status: 'ambiguous',
        note: 'The template shows a duration placeholder or maximum, but no filled-in agreed duration.',
      };
    }

    for (const pattern of exactPatterns) {
      const match = clause.normalized.match(pattern);

      if (!match?.[1]) {
        continue;
      }

      const context = clause.normalized.slice(
        Math.max(0, (match.index ?? 0) - 24),
        Math.min(clause.normalized.length, (match.index ?? 0) + match[0].length + 24),
      );

      if (/maximum|maximaal/.test(context)) {
        continue;
      }

      const months = normalizeMonthPhrase(match[1]);

      if (months !== null) {
        if (
          months > 36 &&
          /omgezet|geacht te zijn aangegaan|bij ontstentenis|blijft bewonen zonder verzet|zonder dat de totale duur/i.test(
            clause.normalized,
          )
        ) {
          continue;
        }

        return {
          months: Math.round(months * 12) / 12,
          snippet: findSnippet(clause.normalized, pattern),
          status: 'found',
          note: 'Duration is normalized to months.',
        };
      }
    }

    if (
      /duur van\s*[.]{4,}|wordt gesloten voor een duur van\s*[.]{4,}|duurtijd\s*[.]{4,}/i.test(
        clause.normalized,
      ) ||
      (/\bmaximum\b|\bmaximaal\b/.test(clause.normalized) && /3 jaar|36 maanden/i.test(clause.normalized))
    ) {
      return {
        months: null,
        snippet:
          findSnippet(
            clause.normalized,
            /duur van\s*[.\s]+.*?(?:jaar|jaren|maanden?)|maximum\s*3\s*jaar|maximaal\s*3\s*jaar/i,
          ) ?? clause.heading,
        status: 'ambiguous',
        note: 'The template shows a duration placeholder or maximum, but no filled-in agreed duration.',
      };
    }
  }

  return { months: null, status: 'missing' };
}

function extractRentAmount(clauses: DocumentClause[]): ParsedScalarSignal {
  const rentClauses = clausesOfType(clauses, 'rent');
  const patterns = [
    /basishuurprijs bedraagt\s*(?:EUR|€)\s*([\d.,]+)/i,
    /huurprijs bedraagt\s*(?:EUR|€)\s*([\d.,]+)/i,
    /(?:EUR|€)\s*([\d.,]+)\s*(?:per\s*(?:maand|month|mois)|\/\s*(?:maand|month|mois))/i,
  ];

  for (const clause of rentClauses) {
    for (const pattern of patterns) {
      const match = clause.raw.match(pattern);
      const value = match?.[1];

      if (!value || /^[.\s]+$/.test(value)) {
        continue;
      }

      const parsed = parseAmount(value);

      if (!Number.isNaN(parsed)) {
        return {
          value: parsed,
          status: 'found',
          snippet: findSnippet(clause.raw, pattern),
        };
      }
    }
  }

  return detectTemplatePlaceholder(
    rentClauses,
    [
      /(?:basishuurprijs|huurprijs).{0,80}?(?:€|eur)\s*[.]{3,}/i,
      /(?:basishuurprijs|huurprijs).{0,80}?[.]{6,}/i,
      /(?:basishuurprijs|huurprijs).{0,80}?(?:nog te bepalen|nader te bepalen|in te vullen|a completer|to be filled)/i,
    ],
    'The rent clause contains a template placeholder rather than an agreed monthly rent.',
  );
}

function captureAmountFromClauses(
  clauses: DocumentClause[],
  patterns: RegExp[],
): ParsedScalarSignal {
  for (const clause of clauses) {
    for (const pattern of patterns) {
      const match = clause.normalized.match(pattern);
      const value = match?.[1];

      if (!value || /^[.\s]+$/.test(value)) {
        continue;
      }

      const parsed = parseAmount(value);

      if (!Number.isNaN(parsed)) {
        return {
          value: parsed,
          status: 'found',
          snippet: findSnippet(clause.normalized, pattern),
        };
      }
    }
  }

  return { value: null, status: 'missing' };
}

function captureDurationFromClauses(
  clauses: DocumentClause[],
  patterns: RegExp[],
): ParsedScalarSignal {
  for (const clause of clauses) {
    for (const pattern of patterns) {
      const match = clause.normalized.match(pattern);
      const fragment = match?.[1];

      if (!fragment) {
        continue;
      }

      const months = normalizeMonthPhrase(fragment);

      if (months !== null) {
        return {
          value: months,
          status: 'found',
          snippet: findSnippet(clause.normalized, pattern),
        };
      }
    }
  }

  return { value: null, status: 'missing' };
}

function detectTemplatePlaceholder(
  clauses: DocumentClause[],
  patterns: RegExp[],
  note: string,
): ParsedScalarSignal {
  for (const clause of clauses) {
    for (const pattern of patterns) {
      if (!pattern.test(clause.normalized)) {
        continue;
      }

      return {
        value: null,
        status: 'ambiguous',
        snippet: findSnippet(clause.normalized, pattern) ?? clause.heading,
        note,
      };
    }
  }

  return { value: null, status: 'missing' };
}

function ambiguousStringSignal(snippet: string | undefined, note: string): ParsedStringSignal {
  return {
    value: null,
    status: 'ambiguous',
    snippet,
    note,
  };
}

function ambiguousStringListSignal(snippet: string | undefined, note: string): ParsedStringListSignal {
  return {
    value: null,
    status: 'ambiguous',
    snippet,
    note,
  };
}

function hasPlaceholderDots(value: string): boolean {
  return /[.]{4,}/.test(value);
}

function normalizeWhitespaceValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDateValue(value: string): string {
  return value.replace(/\s+/g, '').replace(/[.-]/g, '/');
}

function extractPropertyAddressSignal(clauses: DocumentClause[]): ParsedStringSignal {
  const candidates = dedupeClauses(
    clauses.filter((clause) =>
      /gelegen te|omschrijving van de gehuurde woning|omschrijving van het gehuurde goed/i.test(
        clause.normalized,
      ),
    ),
  );

  for (const clause of candidates) {
    const actualMatch = clause.normalized.match(
      /gelegen te\s*(?!\()([^.;]{8,180}?)(?:\s+bestaande uit|\s+Het gehuurde goed|\s+Deze huurovereenkomst|\s+\(|$)/i,
    );

    if (actualMatch?.[1]) {
      const candidate = normalizeWhitespaceValue(actualMatch[1]);

      if (candidate && !hasPlaceholderDots(candidate) && !/(postnummer|plaats|straat|huisnummer|busnummer|verdieping)/i.test(candidate)) {
        return {
          value: candidate,
          status: 'found',
          snippet: findSnippet(clause.normalized, /gelegen te\s*(?!\()([^.;]{8,180}?)(?:\s+bestaande uit|\s+Het gehuurde goed|\s+Deze huurovereenkomst|\s+\(|$)/i),
        };
      }
    }

    if (/gelegen te\s*(?:\([^)]+\)\s*)?[.]{4,}/i.test(clause.normalized)) {
      return ambiguousStringSignal(
        findSnippet(clause.normalized, /gelegen te\s*(?:\([^)]+\)\s*)?[.\s]{6,}/i) ?? clause.heading,
        'The property address field is present as a template placeholder but not filled in.',
      );
    }
  }

  return { value: null, status: 'missing' };
}

function extractPartyNamesSignal(clauses: DocumentClause[], role: 'landlord' | 'tenant'): ParsedStringListSignal {
  const preamble = clauses.find((clause) => clause.articleNumber === null);
  if (!preamble) {
    return { value: null, status: 'missing' };
  }

  const roleLabel = role === 'landlord' ? 'verhuurder' : 'huurder';
  const markerPattern =
    role === 'landlord'
      ? /familienaam[^\n]*verhuurder\(s\)[\s\S]{0,500}?met rijksregisternummer/i
      : /familienaam[^\n]*huurder\(s\)[\s\S]{0,500}?met rijksregisternummer/i;
  const roleSection = preamble.raw.match(markerPattern)?.[0];

  if (!roleSection) {
    return { value: null, status: 'missing' };
  }

  if (hasPlaceholderDots(roleSection)) {
    return ambiguousStringListSignal(
      flatten(roleSection).slice(0, 220),
      `The ${roleLabel} name section is present as a template placeholder but not filled in.`,
    );
  }

  const betweenMarkers = roleSection.match(/\)\s*([\s\S]+?)\s*met rijksregisternummer/i)?.[1];
  if (!betweenMarkers) {
    return { value: null, status: 'missing' };
  }

  const names = betweenMarkers
    .split(/\n|,/)
    .map((part) => normalizeWhitespaceValue(part))
    .filter((part) => part.length > 1 && !/familienaam|voornamen/i.test(part));

  if (names.length === 0) {
    return { value: null, status: 'missing' };
  }

  return {
    value: names,
    status: 'found',
    snippet: flatten(roleSection).slice(0, 220),
  };
}

function extractLeaseDateSignal(
  clauses: DocumentClause[],
  type: 'start' | 'end',
): ParsedStringSignal {
  const candidates = relevantDurationClauses(clauses);
  const actualPattern =
    type === 'start'
      ? /(?:met aanvang op|vangt aan op)\s*(\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{2,4})/i
      : /(?:eindigend op|eindigt op)\s*(\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{2,4})/i;
  const placeholderPattern =
    type === 'start'
      ? /(?:met aanvang op|vangt aan op)\s*[.\s\/-]{6,}/i
      : /(?:eindigend op|eindigt op)\s*[.\s\/-]{6,}/i;

  for (const clause of candidates) {
    const actualMatch = clause.normalized.match(actualPattern);

    if (actualMatch?.[1]) {
      return {
        value: normalizeDateValue(actualMatch[1]),
        status: 'found',
        snippet: findSnippet(clause.normalized, actualPattern),
      };
    }

    if (placeholderPattern.test(clause.normalized)) {
      return ambiguousStringSignal(
        findSnippet(clause.normalized, placeholderPattern) ?? clause.heading,
        `The lease ${type} date field is present as a template placeholder but not filled in.`,
      );
    }
  }

  return { value: null, status: 'missing' };
}

function extractChargesAmountSignal(clauses: DocumentClause[]): ParsedScalarSignal {
  const patterns = [
    /(?:voorschot|provisie|forfaitair(?:e)? bedrag|inbegrepen in de huurprijs.{0,40}bepaald op).{0,40}?(?:EUR|€)\s*([\d.,]+)/i,
    /([\d.,]+)\s*€.{0,40}?(?:per maand|van de huur per maand)/i,
  ];

  const actual = captureAmountFromClauses(clauses, patterns);
  if (actual.status === 'found') {
    return actual;
  }

  return detectTemplatePlaceholder(
    clauses,
    [
      /(?:voorschot|provisie|forfaitair(?:e)? bedrag|bepaald op).{0,40}?(?:EUR|€)\s*[.]{3,}/i,
      /(?:EUR|€)\s*[.]{3,}.{0,40}(?:per maand|van de huur per maand)/i,
      /(?:bepaald op|geraamd bedrag).{0,20}[.]{3,}\s*(?:EUR|€)/i,
      /[.]{3,}\s*(?:EUR|€).{0,40}(?:per maand|van de huur per maand)/i,
    ],
    'The charges clause contains a template placeholder rather than an agreed monthly amount.',
  );
}

function extractChargesModeSignal(clauses: DocumentClause[]): ParsedStringSignal {
  const modes = new Map<string, string>();
  const patterns: Array<[string, RegExp]> = [
    ['included_in_rent', /inbegrepen in de huurprijs/i],
    ['advance', /voorschot|provisie/i],
    ['fixed', /forfaitair/i],
    ['metered', /individuele meters|meterstanden/i],
  ];

  for (const clause of clauses) {
    for (const [mode, pattern] of patterns) {
      if (pattern.test(clause.normalized)) {
        modes.set(mode, findSnippet(clause.normalized, pattern) ?? clause.heading);
      }
    }
  }

  const combined = clauses.map((clause) => clause.normalized).join(' ');
  if (
    modes.size > 0 &&
    /volgende mogelijkheden|omcirkel wat van toepassing|opties?\s+[a-d]\)|met uitsluiting van andere mogelijkheden/i.test(
      combined,
    )
  ) {
    return ambiguousStringSignal(
      Array.from(modes.values())[0],
      'The charges clause lists multiple template billing modes, but no single mode is selected.',
    );
  }

  if (modes.size === 1) {
    const [value, snippet] = Array.from(modes.entries())[0];
    return {
      value,
      status: 'found',
      snippet,
    };
  }

  if (modes.size > 1) {
    return ambiguousStringSignal(
      Array.from(modes.values())[0],
      'The charges clause lists multiple template billing modes, but no single mode is selected.',
    );
  }

  return { value: null, status: 'missing' };
}

function extractDepositMethodSignal(clauses: DocumentClause[]): ParsedStringSignal {
  const methods = new Map<string, string>();
  const patterns: Array<[string, RegExp]> = [
    ['cash', /cash|contant|in contanten|esp[eè]ces|hand cash/i],
    ['landlord_account', /rekening van de verhuurder|door de verhuurder opgegeven rekening|landlord'?s account|account of the landlord|compte du bailleur/i],
    ['blocked_account', /ge[iï]ndividualiseerde rekening|huurwaarborgrekening|afzonderlijke huurwaarborgrekening|individual and blocked guarantee account|blocked guarantee account/i],
    ['bank_guarantee', /zakelijke zekerheidstelling|bankwaarborg/i],
    ['ocmw_bank_guarantee', /ocmw/i],
    ['third_party_surety', /borgstelling door een natuurlijke persoon|borgstelling door een rechtspersoon/i],
  ];

  for (const clause of clauses) {
    for (const [method, pattern] of patterns) {
      if (pattern.test(clause.normalized)) {
        methods.set(method, findSnippet(clause.normalized, pattern) ?? clause.heading);
      }
    }
  }

  if (methods.size === 1 && !/omcirkel|één van de volgende wijzen|met uitsluiting van andere mogelijkheden|ofwel/i.test(clauses.map((clause) => clause.normalized).join(' '))) {
    const [value, snippet] = Array.from(methods.entries())[0];
    return {
      value,
      status: 'found',
      snippet,
    };
  }

  if (methods.size > 0) {
    return ambiguousStringSignal(
      Array.from(methods.values())[0],
      'The deposit clause lists multiple lawful guarantee methods, but the selected method is not filled in.',
    );
  }

  return { value: null, status: 'missing' };
}

function extractEpcScoreSignal(clauses: DocumentClause[]): ParsedScalarSignal {
  const epcClauses = dedupeClauses(
    clauses.filter((clause) => /energieprestatiecertificaat|\bepc\b|kerngetal/i.test(clause.normalized)),
  );
  const actual = captureAmountFromClauses(epcClauses, [
    /(?:kerngetal|energieverbruik).{0,40}?bedraagt\s*:?\s*([\d.,]+)\s*kwh\/m²/i,
  ]);
  if (actual.status === 'found') {
    return actual;
  }

  return detectTemplatePlaceholder(
    epcClauses,
    [
      /(?:kerngetal|energieverbruik).{0,40}?bedraagt\s*:?\s*[.]{3,}\s*kwh\/m²/i,
    ],
    'The EPC score field is present as a template placeholder but not filled in.',
  );
}

function extractEpcLabelSignal(clauses: DocumentClause[]): ParsedStringSignal {
  const epcClauses = dedupeClauses(
    clauses.filter((clause) => /energieprestatiecertificaat|\bepc\b|energielabel|epc-label/i.test(clause.normalized)),
  );

  for (const clause of epcClauses) {
    const actualMatch = clause.normalized.match(/(?:epc(?:-label)?|energielabel)\s*:?\s*([a-g](?:\+)?)\b/i);
    if (actualMatch?.[1]) {
      return {
        value: actualMatch[1].toUpperCase(),
        status: 'found',
        snippet: findSnippet(clause.normalized, /(?:epc(?:-label)?|energielabel)\s*:?\s*([a-g](?:\+)?)\b/i),
      };
    }

    if (/(?:epc(?:-label)?|energielabel)\s*:?\s*[.]{3,}/i.test(clause.normalized)) {
      return ambiguousStringSignal(
        findSnippet(clause.normalized, /(?:epc(?:-label)?|energielabel)\s*:?\s*[.\s]{3,}/i) ?? clause.heading,
        'The EPC label field is present as a template placeholder but not filled in.',
      );
    }
  }

  return { value: null, status: 'missing' };
}

function firstMatchingClause(
  clauses: DocumentClause[],
  patterns: RegExp[],
): { matched: boolean; snippet?: string } {
  const match = pickClauseMatch(clauses, patterns);

  return {
    matched: Boolean(match.snippet),
    snippet: match.snippet,
  };
}

function detectIndexationFrequency(
  clauses: DocumentClause[],
): { months: number | null; snippet?: string } {
  const patterns: Array<{ months: number; regex: RegExp }> = [
    {
      months: 1,
      regex:
        /(?:index(?:atie|ering)|indexation).{0,60}?(?:maandelijks|monthly|mensuel(?:lement)?)/i,
    },
    {
      months: 3,
      regex:
        /(?:index(?:atie|ering)|indexation).{0,60}?(?:per kwartaal|quarterly|trimestriel(?:lement)?)/i,
    },
    {
      months: 6,
      regex:
        /(?:index(?:atie|ering)|indexation).{0,60}?(?:halfjaarlijks|semi-annual|semiannual|semestriel(?:lement)?)/i,
    },
    {
      months: 12,
      regex:
        /(?:index(?:atie|ering)|indexation).{0,80}?(?:jaarlijks|annual(?:ly)?|annuel(?:lement)?|elk jaar|every year|chaque annee|chaque an|verjaardag van de inwerkingtreding)/i,
    },
  ];

  for (const clause of clauses) {
    for (const pattern of patterns) {
      if (pattern.regex.test(clause.normalized)) {
        return {
          months: pattern.months,
          snippet: findSnippet(clause.normalized, pattern.regex),
        };
      }
    }
  }

  return { months: null };
}

function relevantTerminationClauses(
  clauses: DocumentClause[],
  actor: ClauseActor,
  leaseTypeHint: ParsedLeaseSignals['leaseTypeHint'],
): DocumentClause[] {
  const actorPattern =
    actor === 'tenant'
      ? /huurder kan de huurovereenkomst|opzeggingsmogelijkheden voor de huurder|opzegging door de huurder|de huurder kan|early termination|cancellation fee|notice period|opzeggingstermijn|opzeggingsvergoeding|be[eë]indiging van zijn studie/i
      : /verhuurder kan de huurovereenkomst|opzeggingsmogelijkheden voor de verhuurder|opzegging door de verhuurder|de verhuurder kan/i;

  const base = clauses.filter((clause) => {
    if (actor === 'tenant') {
      return (
        clause.type === 'tenant_termination' ||
        clause.type === 'duration' ||
        actorPattern.test(clause.normalized)
      );
    }

    return clause.type === 'landlord_termination' || actorPattern.test(clause.normalized);
  });

  let prioritized: DocumentClause[] = [];

  if (actor === 'tenant' && leaseTypeHint === 'short') {
    prioritized = clauses.filter((clause) =>
      /anderhalve maand|een halve maand|eerste korte duur huurovereenkomst|korte duur huurovereenkomst|huurovereenkomst van korte duur|conform artikel 4/i.test(
        clause.normalized,
      ),
    );
  } else if (actor === 'tenant' && leaseTypeHint === 'long') {
    prioritized = base.filter((clause) =>
      /eerste driejarige periode|drie maanden, twee maanden of één maand|opzeggingsmogelijkheden voor de huurder/i.test(
        clause.normalized,
      ),
    );
  } else if (actor === 'landlord' && leaseTypeHint === 'long') {
    prioritized = base.filter((clause) =>
      /opzeggingsmogelijkheden voor de verhuurder|achttien maanden|negen dan wel aan zes maanden|zonder motivering/i.test(
        clause.normalized,
      ),
    );
  } else if (actor === 'landlord' && leaseTypeHint === 'short') {
    prioritized = base.filter((clause) =>
      /kan niet eenzijdig worden opgezegd door de verhuurder/i.test(clause.normalized),
    );
    return prioritized;
  }

  return prioritized.length > 0 ? prioritized : base;
}

function extractDurationClauses(
  clauses: DocumentClause[],
  actor: ClauseActor,
  leaseTypeHint: ParsedLeaseSignals['leaseTypeHint'],
): ParsedDurationClause[] {
  const relevantClauses = relevantTerminationClauses(clauses, actor, leaseTypeHint);
  const parsed: ParsedDurationClause[] = [];

  for (const clause of relevantClauses) {
    const noticeFragments = Array.from(
      clause.normalized.matchAll(/(?:opzeggingstermijn|tegenopzeg(?:gen)?|notice period|period of notice|preavis)[^.]{0,180}/gi),
    );

    for (const fragment of noticeFragments) {
      const values = extractDurationValues(fragment[0] ?? '');
      for (const months of values) {
        parsed.push({
          actor,
          kind: 'notice',
          months,
          snippet: flatten(fragment[0] ?? ''),
        });
      }
    }

    const feeFragments = Array.from(
      clause.normalized.matchAll(
        /(?:recht op een vergoeding|vergoeding is gelijk aan|vergoeding die gelijk is aan|betaling van een vergoeding|opzeggingsvergoeding|cancellation fee|termination fee|indemnity)[^.]{0,240}/gi,
      ),
    );

    for (const fragment of feeFragments) {
      const values = extractDurationValues(fragment[0] ?? '');
      for (const months of values) {
        parsed.push({
          actor,
          kind: 'fee',
          months,
          snippet: flatten(fragment[0] ?? ''),
        });
      }
    }
  }

  return parsed;
}

function maxClauseMonths(
  clauses: ParsedDurationClause[],
  actor: ClauseActor,
  kind: ClauseKind,
): number | null {
  const matching = clauses
    .filter((clause) => clause.actor === actor && clause.kind === kind)
    .map((clause) => clause.months);

  if (matching.length === 0) {
    return null;
  }

  return Math.max(...matching);
}

function firstClauseSnippet(
  clauses: ParsedDurationClause[],
  actor: ClauseActor,
  kind: ClauseKind,
): string | undefined {
  return clauses.find((clause) => clause.actor === actor && clause.kind === kind)?.snippet;
}

function selectDurationClause(
  clauses: ParsedDurationClause[],
  actor: ClauseActor,
  kind: ClauseKind,
  leaseTypeHint: ParsedLeaseSignals['leaseTypeHint'],
): ParsedDurationClause | undefined {
  const matching = clauses.filter((clause) => clause.actor === actor && clause.kind === kind);

  if (matching.length === 0) {
    return undefined;
  }

  if (actor === 'tenant' && kind === 'notice' && leaseTypeHint === 'short') {
    return matching.find((clause) => clause.months === 3) ?? matching[0];
  }

  if (actor === 'tenant' && kind === 'fee' && leaseTypeHint === 'short') {
    return matching.find((clause) => clause.months === 1.5) ?? matching[0];
  }

  if (actor === 'tenant' && kind === 'notice' && leaseTypeHint === 'long') {
    return matching.find((clause) => clause.months === 3) ?? matching[0];
  }

  if (actor === 'tenant' && kind === 'fee' && leaseTypeHint === 'long') {
    return matching.find((clause) => clause.months === 3) ?? matching.sort((a, b) => b.months - a.months)[0];
  }

  if (actor === 'landlord' && kind === 'notice' && leaseTypeHint === 'long') {
    return matching.find((clause) => clause.months === 6) ?? matching.sort((a, b) => b.months - a.months)[0];
  }

  return matching.sort((a, b) => b.months - a.months)[0];
}

function parseSignals(text: string): ParsedLeaseSignals {
  const normalized = flatten(text);
  const clauses = segmentClauses(text);
  const leaseTypeHint = inferLeaseTypeHint(normalized);
  const propertyAddress = extractPropertyAddressSignal(clauses);
  const landlordNames = extractPartyNamesSignal(clauses, 'landlord');
  const tenantNames = extractPartyNamesSignal(clauses, 'tenant');
  const leaseStartDate = extractLeaseDateSignal(clauses, 'start');
  const leaseEndDate = extractLeaseDateSignal(clauses, 'end');

  const rentAmount = extractRentAmount(clauses);
  const chargeClauses = clausesOfType(clauses, 'charges');
  const chargesAmount = extractChargesAmountSignal(chargeClauses);
  const chargesMode = extractChargesModeSignal(chargeClauses);
  const depositClauses = relevantDepositClauses(clauses);
  const securityDepositAmount = captureAmountFromClauses(depositClauses, [
    /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,25}?(?:EUR|€)\s*([\d.,]+)/i,
    /(?:EUR|€)\s*([\d.,]+).{0,25}?(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative)/i,
  ]);
  const securityDepositMonths = captureDurationFromClauses(depositClauses, [
    /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,40}?(anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/i,
  ]);
  const securityDepositAmountPlaceholder =
    securityDepositAmount.status === 'found'
      ? null
      : detectTemplatePlaceholder(
          depositClauses,
          [
            /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,120}?(?:EUR|€)\s*[.]{3,}/i,
            /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,120}?(?:bedrag|bedrage|ten bedrage van).{0,80}[.]{3,}/i,
            /(?:artikel\s+11.*de waarborg).{0,220}?(?:EUR|€)\s*[.]{3,}/i,
          ],
          'The deposit clause contains a template placeholder rather than an agreed security deposit.',
        );
  const securityDepositMonthsPlaceholder =
    securityDepositMonths.status === 'found'
      ? null
      : detectTemplatePlaceholder(
          depositClauses,
          [
            /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,160}[.]{3,}\s*(?:maanden?|maand|months?|month|mois)/i,
            /(?:overeenstemmend met|bedraagt).{0,60}[.]{3,}\s*(?:maanden?|maand|months?|month|mois)/i,
            /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,160}?(?:maximum|maximaal|max\.).{0,40}(?:3|drie)\s*(?:maanden?|months?|mois)/i,
            /(?:artikel\s+11.*de waarborg).{0,240}?(?:maximaal|maximum).{0,40}(?:3|drie)\s*(?:maanden?|maand|months?|month|mois)/i,
          ],
          'The deposit clause only shows a template placeholder or statutory maximum, not a filled-in agreed month count.',
        );
  const securityDepositMethod = extractDepositMethodSignal(depositClauses);

  const depositHeldByLandlordPatterns = [
    /(?:rekening van de verhuurder|eigen rekening van de verhuurder|landlord'?s account|compte du bailleur|cash|contant|in contanten|esp[eè]ces)/i,
    /(?:verhuurder|landlord|bailleur).{0,80}?(?:houdt|keeps|conserve).{0,80}?(?:waarborg|deposit|garantie locative)/i,
  ];
  const depositHeldByLandlordMatch = pickClauseMatch(depositClauses, depositHeldByLandlordPatterns);

  const leaseTerm = extractLeaseTerm(clauses, leaseTypeHint);
  const durationClauses = [
    ...extractDurationClauses(clauses, 'tenant', leaseTypeHint),
    ...extractDurationClauses(clauses, 'landlord', leaseTypeHint),
  ];
  const tenantPreStartFee = captureDurationFromClauses(
    clauses.filter((clause) =>
      clause.type === 'tenant_termination' ||
      /v[óo]or de inwerkingtreding|before commencement|before the start|pre-start|less than three months|minder dan drie maanden/i.test(
        clause.normalized,
      ),
    ),
    [
      new RegExp(
        `(?:opzeggingsvergoeding|cancellation fee|termination fee|fee|compensation|indemnity).{0,100}?(${DURATION_FRAGMENT_PATTERN}).{0,50}?(?:huur|rent|loyer)`,
        'i',
      ),
      new RegExp(
        `(${DURATION_FRAGMENT_PATTERN}).{0,50}?(?:huur|rent|loyer).{0,80}?(?:opzeggingsvergoeding|cancellation fee|termination fee|fee|compensation|indemnity)`,
        'i',
      ),
    ],
  );

  const tenantTerminationClauses = clausesOfType(clauses, 'tenant_termination');
  const landlordTerminationClauses = clausesOfType(clauses, 'landlord_termination');
  const registrationClauses = relevantRegistrationClauses(clauses);
  const inventoryClauses = clausesOfType(clauses, 'inventory');
  const insuranceClauses = clausesOfType(clauses, 'insurance');
  const rentClauses = clausesOfType(clauses, 'rent');
  const epcScore = extractEpcScoreSignal(clauses);
  const epcLabel = extractEpcLabelSignal(clauses);

  const tenantEarlyTerminationForbiddenPatterns = [
    /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:kan|may|peut).{0,40}?(?:niet|not|pas).{0,80}?(?:vroegtijdig|early|avant le terme|before the end|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)/i,
    /(?:geen|no|aucun).{0,40}?(?:vroegtijdige|early|anticipated).{0,40}?(?:opzeg|termination|resiliation).{0,40}?(?:door de huurder|for the tenant|par le locataire)/i,
  ];
  const tenantEarlyTerminationForbiddenMatch = pickClauseMatch(
    tenantTerminationClauses,
    tenantEarlyTerminationForbiddenPatterns,
  );

  const landlordEarlyTerminationAllowedPatterns = [
    /(?:verhuurder|landlord|bailleur).{0,140}?(?:kan|may|peut).{0,80}?(?:vroegtijdig|early|before the end|avant la fin|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)/i,
  ];
  const landlordEarlyTerminationAllowedMatch = pickClauseMatch(
    landlordTerminationClauses,
    landlordEarlyTerminationAllowedPatterns,
  );

  const registrationDeadline = captureDurationFromClauses(registrationClauses, [
    new RegExp(
      `(?:registr(?:atie|eren)|geregistreerd|registration|enregistrement).{0,80}?(${DURATION_FRAGMENT_PATTERN})`,
      'i',
    ),
  ]);
  const registrationAssignedToTenantMatch = pickClauseMatch(registrationClauses, [
    /(?:\bhuurder|\btenant|\blocataire).{0,100}?(?:moet|shall|must|doit).{0,80}?(?:registr(?:eren|atie)|register|enregistrer|enregistrement)/i,
  ]);
  const registrationMentionMatch = pickClauseMatch(registrationClauses, [
    /(?:registr(?:atie|eren)|registration|enregistrement).{0,120}/i,
  ]);
  const registrationMentionedSnippet =
    registrationMentionMatch.snippet ||
    registrationClauses[0]?.heading ||
    findSnippet(normalized, /(?:registr(?:atie|eren)|registration|enregistrement).{0,80}/i);

  const inventoryMentionMatch = pickClauseMatch(inventoryClauses, [
    /(?:plaatsbeschrijving|inventory|etat des lieux).{0,120}/i,
  ]);
  const inventoryMentionedSnippet =
    inventoryMentionMatch.snippet ||
    inventoryClauses[0]?.heading ||
    findSnippet(normalized, /(?:plaatsbeschrijving|inventory|etat des lieux).{0,80}/i);
  const inventoryWaivedMatch = pickClauseMatch(inventoryClauses, [
    /er wordt geen (?:omstandige )?(?:plaatsbeschrijving|inventory|etat des lieux) opgemaakt/i,
    /zonder (?:plaatsbeschrijving|inventory|etat des lieux)/i,
    /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:aanvaardt|accepts|accepte).{0,80}?(?:in de huidige staat|as is|en l[' ]etat)/i,
    /(?:pand|goed|woning|appartement).{0,80}?(?:verhuurd|let).{0,80}?(?:in de staat waarin het zich bevindt|as is).{0,80}?(?:zonder (?:plaatsbeschrijving|inventory|etat des lieux))?/i,
  ]);

  const fireTenantMatch = pickClauseMatch(insuranceClauses, [
    /(?:huurder|tenant|locataire).{0,180}?(?:brandverzekering|fire insurance|assurance incendie|aansprakelijkheid).{0,120}?(?:brand|waterschade|water damage|incendie)/i,
    /(?:huurder|tenant|locataire).{0,120}?(?:verzeker|dekken|cover).{0,120}?(?:brand|waterschade|water damage|incendie)/i,
  ]);
  const fireLandlordMatch = pickClauseMatch(insuranceClauses, [
    /(?:verhuurder|landlord|bailleur).{0,180}?(?:brandverzekering|fire insurance|assurance incendie|aansprakelijkheid).{0,120}?(?:brand|waterschade|water damage|incendie)/i,
    /(?:verhuurder|landlord|bailleur).{0,120}?(?:verzeker|dekken|cover).{0,120}?(?:brand|waterschade|water damage|incendie)/i,
  ]);

  const indexationFrequency = detectIndexationFrequency(rentClauses);
  const automaticIndexation = firstMatchingClause(rentClauses, [
    /automatische\s+index(?:atie|ering)|automatic\s+index(?:ation)?|indexation\s+automatique/i,
  ]);
  const propertyTax = firstMatchingClause(chargeClauses, [
    /(?:\bhuurder|\btenant|\blocataire).{0,160}?(?:betaalt|pays|pay|ten laste).{0,120}?(?:onroerende voorheffing|property tax|precompte immobilier)/i,
    /(?:onroerende voorheffing|property tax|precompte immobilier).{0,120}?(?:ten laste van de huurder|for the tenant|a charge du locataire)/i,
  ]);
  const autoTermination = firstMatchingClause(clausesOfType(clauses, 'breach'), [
    /(?:automatisch|automatically|de plein droit|van rechtswege).{0,120}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu).{0,160}?(?:wanbetaling|non-payment|default|achterstallige huur|impay[eé])/i,
  ]);
  const autoTerminationSnippet = clausesOfType(clauses, 'breach')
    .map((clause) => findSnippet(
      clause.normalized,
      /(?:automatisch|automatically|de plein droit|van rechtswege).{0,120}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu).{0,160}?(?:wanbetaling|non-payment|default|achterstallige huur|impay[eé])/i,
    ))
    .find(Boolean);
  const autoRenewalCandidateSnippet = findSnippet(
    normalized,
    /automatische\s+verlenging|stilzwijgende\s+verlenging|auto(?:matic)?[\s-]?renew(?:al)?|reconduction tacite/i,
  );
  const autoRenewalSnippet =
    autoRenewalCandidateSnippet &&
    !/(?:niet|no|not|verbod|zonder dat|may not|cannot|kan niet|geen).{0,80}(?:stilzwijgend|automatic|renewal|verleng)/i.test(
      autoRenewalCandidateSnippet,
    )
      ? autoRenewalCandidateSnippet
      : undefined;
  const annexesSnippet = findSnippet(normalized, /(?:bijlage|bijlagen|annex(?:e|es)?).{0,40}/i);

  return {
    propertyAddress: propertyAddress.value,
    propertyAddressStatus: propertyAddress.status,
    propertyAddressSnippet: propertyAddress.snippet,
    propertyAddressNote: propertyAddress.note,
    landlordNames: landlordNames.value,
    landlordNamesStatus: landlordNames.status,
    landlordNamesSnippet: landlordNames.snippet,
    landlordNamesNote: landlordNames.note,
    tenantNames: tenantNames.value,
    tenantNamesStatus: tenantNames.status,
    tenantNamesSnippet: tenantNames.snippet,
    tenantNamesNote: tenantNames.note,
    leaseStartDate: leaseStartDate.value,
    leaseStartDateStatus: leaseStartDate.status,
    leaseStartDateSnippet: leaseStartDate.snippet,
    leaseStartDateNote: leaseStartDate.note,
    leaseEndDate: leaseEndDate.value,
    leaseEndDateStatus: leaseEndDate.status,
    leaseEndDateSnippet: leaseEndDate.snippet,
    leaseEndDateNote: leaseEndDate.note,
    rentAmount: rentAmount.value,
    rentAmountStatus: rentAmount.status,
    rentAmountSnippet: rentAmount.snippet,
    rentAmountNote: rentAmount.note,
    chargesAmount: chargesAmount.value,
    chargesAmountStatus: chargesAmount.status,
    chargesAmountSnippet: chargesAmount.snippet,
    chargesAmountNote: chargesAmount.note,
    chargesMode: chargesMode.value,
    chargesModeStatus: chargesMode.status,
    chargesModeSnippet: chargesMode.snippet,
    chargesModeNote: chargesMode.note,
    securityDepositAmount: securityDepositAmount.value,
    securityDepositAmountStatus:
      securityDepositAmountPlaceholder?.status ?? securityDepositAmount.status,
    securityDepositAmountSnippet:
      securityDepositAmountPlaceholder?.snippet ?? securityDepositAmount.snippet,
    securityDepositAmountNote:
      securityDepositAmountPlaceholder?.note ?? securityDepositAmount.note,
    securityDepositMonths: securityDepositMonths.value,
    securityDepositMonthsStatus:
      securityDepositMonthsPlaceholder?.status ?? securityDepositMonths.status,
    securityDepositMonthsSnippet:
      securityDepositMonthsPlaceholder?.snippet ?? securityDepositMonths.snippet,
    securityDepositMonthsNote:
      securityDepositMonthsPlaceholder?.note ?? securityDepositMonths.note,
    securityDepositMethod: securityDepositMethod.value,
    securityDepositMethodStatus: securityDepositMethod.status,
    securityDepositMethodSnippet: securityDepositMethod.snippet,
    securityDepositMethodNote: securityDepositMethod.note,
    depositHeldByLandlord: Boolean(depositHeldByLandlordMatch.snippet),
    depositHeldByLandlordSnippet: depositHeldByLandlordMatch.snippet,
    leaseTermMonths: leaseTerm.months,
    leaseTermSnippet: leaseTerm.snippet,
    leaseTermStatus: leaseTerm.status,
    leaseTermNote: leaseTerm.note,
    leaseTypeHint,
    durationClauses,
    tenantPreStartFeeMonths: tenantPreStartFee.value,
    tenantPreStartFeeSnippet: tenantPreStartFee.snippet,
    tenantEarlyTerminationForbidden: Boolean(tenantEarlyTerminationForbiddenMatch.snippet),
    tenantEarlyTerminationForbiddenSnippet: tenantEarlyTerminationForbiddenMatch.snippet,
    landlordEarlyTerminationAllowed: Boolean(landlordEarlyTerminationAllowedMatch.snippet),
    landlordEarlyTerminationAllowedSnippet: landlordEarlyTerminationAllowedMatch.snippet,
    registrationDeadlineMonths: registrationDeadline.value,
    registrationDeadlineSnippet: registrationDeadline.snippet,
    registrationAssignedToTenant:
      Boolean(registrationAssignedToTenantMatch.snippet) &&
      !/(?:verhuurder|landlord|bailleur).{0,80}?(?:moet|shall|must|doit).{0,80}?(?:registr(?:eren|atie)|register|enregistrer|enregistrement)/i.test(
        registrationClauses.map((clause) => clause.normalized).join(' '),
      ),
    registrationAssignedToTenantSnippet: registrationAssignedToTenantMatch.snippet,
    registrationMentioned: registrationClauses.length > 0 || /(?:registr(?:atie|eren)|registration|enregistrement)/i.test(normalized),
    registrationMentionedSnippet,
    indexationFrequencyMonths: indexationFrequency.months,
    indexationFrequencySnippet: indexationFrequency.snippet,
    automaticIndexation: automaticIndexation.matched,
    automaticIndexationSnippet: automaticIndexation.snippet,
    propertyTaxChargedToTenant: propertyTax.matched,
    propertyTaxSnippet: propertyTax.snippet,
    autoTerminationForNonPayment: autoTermination.matched,
    autoTerminationSnippet: autoTermination.snippet ?? autoTerminationSnippet ?? undefined,
    inventoryMentioned: inventoryClauses.length > 0 || /plaatsbeschrijving|inventory|etat des lieux/i.test(normalized),
    inventoryMentionedSnippet,
    inventoryWaived: Boolean(inventoryWaivedMatch.snippet),
    inventoryWaivedSnippet: inventoryWaivedMatch.snippet,
    fireInsuranceTenantMentioned: Boolean(fireTenantMatch.snippet),
    fireInsuranceTenantSnippet: fireTenantMatch.snippet,
    fireInsuranceLandlordMentioned: Boolean(fireLandlordMatch.snippet),
    fireInsuranceLandlordSnippet: fireLandlordMatch.snippet,
    epcLabel: epcLabel.value,
    epcLabelStatus: epcLabel.status,
    epcLabelSnippet: epcLabel.snippet,
    epcLabelNote: epcLabel.note,
    epcScore: epcScore.value,
    epcScoreStatus: epcScore.status,
    epcScoreSnippet: epcScore.snippet,
    epcScoreNote: epcScore.note,
    autoRenewal: Boolean(autoRenewalSnippet),
    autoRenewalSnippet,
    annexesDetected: Boolean(annexesSnippet),
    annexesSnippet,
  };
}

function detectLanguage(text: string): SupportedDocumentLanguage {
  const lower = text.toLowerCase();

  const scores = {
    nl: 0,
    fr: 0,
    en: 0,
  };

  const dictionaries: Record<'nl' | 'fr' | 'en', RegExp[]> = {
    nl: [
      /\bhuurder\b/g,
      /\bverhuurder\b/g,
      /\bhuurovereenkomst\b/g,
      /\bhuurprijs\b/g,
      /\bhuurwaarborg\b/g,
      /\bplaatsbeschrijving\b/g,
    ],
    fr: [
      /\blocataire\b/g,
      /\bbailleur\b/g,
      /\bbail\b/g,
      /\bloyer\b/g,
      /\bgarantie locative\b/g,
      /\betat des lieux\b/g,
    ],
    en: [
      /\btenant\b/g,
      /\blandlord\b/g,
      /\blease\b/g,
      /\brent\b/g,
      /\bsecurity deposit\b/g,
      /\binventory\b/g,
    ],
  };

  for (const [language, patterns] of Object.entries(dictionaries) as Array<
    ['nl' | 'fr' | 'en', RegExp[]]
  >) {
    for (const pattern of patterns) {
      scores[language] += lower.match(pattern)?.length ?? 0;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  if (!best || best[1] === 0) {
    return 'unknown';
  }

  return best[0] as SupportedDocumentLanguage;
}

function deriveLeaseType(signals: ParsedLeaseSignals): string | null {
  if (signals.leaseTermMonths !== null) {
    if (signals.leaseTermMonths <= 36) {
      return 'short_term';
    }

    if (signals.leaseTermMonths <= 108) {
      return 'nine_year';
    }

    return 'long_term';
  }

  if (signals.leaseTypeHint === 'short') {
    return 'short_term';
  }

  if (signals.leaseTypeHint === 'long') {
    return 'nine_year';
  }

  return null;
}

function buildAllFields(
  text: string,
  signals: ParsedLeaseSignals,
  input?: ExtractFieldsInput,
): Record<LeaseFieldId, ExtractedValue<unknown>> {
  const normalized = flatten(text);
  const documentKind = inferDocumentKind(text, input?.fileName);
  const tenantNoticeClause = selectDurationClause(
    signals.durationClauses,
    'tenant',
    'notice',
    signals.leaseTypeHint,
  );
  const landlordNoticeClause = selectDurationClause(
    signals.durationClauses,
    'landlord',
    'notice',
    signals.leaseTypeHint,
  );
  const tenantFeeClause = selectDurationClause(
    signals.durationClauses,
    'tenant',
    'fee',
    signals.leaseTypeHint,
  );
  const landlordFeeClause = selectDurationClause(
    signals.durationClauses,
    'landlord',
    'fee',
    signals.leaseTypeHint,
  );
  const tenantNoticeMonths = tenantNoticeClause?.months ?? null;
  const landlordNoticeMonths = landlordNoticeClause?.months ?? null;
  const tenantFeeMonths = tenantFeeClause?.months ?? null;
  const landlordFeeMonths = landlordFeeClause?.months ?? null;
  const leaseType = deriveLeaseType(signals);

  return {
    'document.kind': makeValue(documentKind, {
      confidence: documentKind === 'residential_lease' ? 0.72 : 0.84,
      status: 'derived',
      note:
        documentKind === 'residential_lease'
          ? 'Scoped to the Flemish residential lease schema.'
          : 'Detected from the document title and recurring clause language.',
    }),
    'document.language': makeValue(detectLanguage(normalized), {
      confidence: 0.7,
      status: 'derived',
    }),
    'property.address': makeValue(signals.propertyAddress, {
      confidence:
        signals.propertyAddressStatus === 'found'
          ? 0.82
          : signals.propertyAddressStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.propertyAddressStatus,
      snippet: signals.propertyAddressSnippet,
      note: signals.propertyAddressNote,
    }),
    'parties.landlord.names': makeValue(signals.landlordNames, {
      confidence:
        signals.landlordNamesStatus === 'found'
          ? 0.78
          : signals.landlordNamesStatus === 'ambiguous'
            ? 0.32
            : 0.1,
      status: signals.landlordNamesStatus,
      snippet: signals.landlordNamesSnippet,
      note: signals.landlordNamesNote,
    }),
    'parties.tenant.names': makeValue(signals.tenantNames, {
      confidence:
        signals.tenantNamesStatus === 'found'
          ? 0.78
          : signals.tenantNamesStatus === 'ambiguous'
            ? 0.32
            : 0.1,
      status: signals.tenantNamesStatus,
      snippet: signals.tenantNamesSnippet,
      note: signals.tenantNamesNote,
    }),
    'lease.startDate': makeValue(signals.leaseStartDate, {
      confidence:
        signals.leaseStartDateStatus === 'found'
          ? 0.78
          : signals.leaseStartDateStatus === 'ambiguous'
            ? 0.32
            : 0.1,
      status: signals.leaseStartDateStatus,
      snippet: signals.leaseStartDateSnippet,
      note: signals.leaseStartDateNote,
    }),
    'lease.endDate': makeValue(signals.leaseEndDate, {
      confidence:
        signals.leaseEndDateStatus === 'found'
          ? 0.78
          : signals.leaseEndDateStatus === 'ambiguous'
            ? 0.32
            : 0.1,
      status: signals.leaseEndDateStatus,
      snippet: signals.leaseEndDateSnippet,
      note: signals.leaseEndDateNote,
    }),
    'lease.duration': makeValue(signals.leaseTermMonths, {
      confidence:
        signals.leaseTermStatus === 'found'
          ? 0.82
          : signals.leaseTermStatus === 'ambiguous'
            ? 0.4
            : 0.15,
      status: signals.leaseTermStatus,
      snippet: signals.leaseTermSnippet,
      note: signals.leaseTermNote,
    }),
    'lease.type': makeValue(leaseType, {
      confidence: leaseType === null ? 0.2 : signals.leaseTypeHint ? 0.82 : 0.74,
      status: leaseType === null ? 'missing' : 'derived',
      note:
        leaseType !== null && signals.leaseTermStatus === 'ambiguous'
          ? 'Lease type is inferred from clause language because the agreed duration is not filled in.'
          : undefined,
    }),
    'rent.baseAmount': makeValue(signals.rentAmount, {
      confidence:
        signals.rentAmountStatus === 'found'
          ? 0.84
          : signals.rentAmountStatus === 'ambiguous'
            ? 0.38
            : 0.15,
      status: signals.rentAmountStatus,
      snippet: signals.rentAmountSnippet,
      note: signals.rentAmountNote,
    }),
    'rent.currency': makeValue(signals.rentAmount === null ? null : 'EUR', {
      confidence: signals.rentAmount === null ? 0.1 : 0.9,
      status: signals.rentAmount === null ? 'missing' : 'derived',
    }),
    'rent.indexationFrequencyMonths': makeValue(signals.indexationFrequencyMonths, {
      confidence: signals.indexationFrequencyMonths === null ? 0.15 : 0.78,
      snippet: signals.indexationFrequencySnippet,
    }),
    'rent.indexationAutomatic': makeValue(signals.automaticIndexation, {
      confidence: signals.automaticIndexation ? 0.82 : 0.25,
      status: signals.automaticIndexation ? 'found' : 'missing',
      snippet: signals.automaticIndexationSnippet,
    }),
    'charges.amount': makeValue(signals.chargesAmount, {
      confidence:
        signals.chargesAmountStatus === 'found'
          ? 0.78
          : signals.chargesAmountStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.chargesAmountStatus,
      snippet: signals.chargesAmountSnippet,
      note: signals.chargesAmountNote,
    }),
    'charges.mode': makeValue(signals.chargesMode, {
      confidence:
        signals.chargesModeStatus === 'found'
          ? 0.76
          : signals.chargesModeStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.chargesModeStatus,
      snippet: signals.chargesModeSnippet,
      note: signals.chargesModeNote,
    }),
    'charges.propertyTaxToTenant': makeValue(signals.propertyTaxChargedToTenant, {
      confidence: signals.propertyTaxChargedToTenant ? 0.82 : 0.2,
      status: signals.propertyTaxChargedToTenant ? 'found' : 'missing',
      snippet: signals.propertyTaxSnippet,
    }),
    'deposit.amount': makeValue(signals.securityDepositAmount, {
      confidence:
        signals.securityDepositAmountStatus === 'found'
          ? 0.8
          : signals.securityDepositAmountStatus === 'ambiguous'
            ? 0.36
            : 0.15,
      status: signals.securityDepositAmountStatus,
      snippet: signals.securityDepositAmountSnippet,
      note: signals.securityDepositAmountNote,
    }),
    'deposit.months': makeValue(signals.securityDepositMonths, {
      confidence:
        signals.securityDepositMonthsStatus === 'found'
          ? 0.78
          : signals.securityDepositMonthsStatus === 'ambiguous'
            ? 0.36
            : 0.15,
      status: signals.securityDepositMonthsStatus,
      snippet: signals.securityDepositMonthsSnippet,
      note: signals.securityDepositMonthsNote,
    }),
    'deposit.method': makeValue(signals.securityDepositMethod, {
      confidence:
        signals.securityDepositMethodStatus === 'found'
          ? 0.76
          : signals.securityDepositMethodStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.securityDepositMethodStatus,
      snippet: signals.securityDepositMethodSnippet,
      note: signals.securityDepositMethodNote,
    }),
    'deposit.heldByLandlord': makeValue(signals.depositHeldByLandlord, {
      confidence: signals.depositHeldByLandlord ? 0.82 : 0.2,
      status: signals.depositHeldByLandlord ? 'found' : 'missing',
      snippet: signals.depositHeldByLandlordSnippet,
    }),
    'registration.required': makeValue(true, {
      confidence: 0.95,
      status: 'derived',
      note: 'Residential leases in Flanders require landlord registration under the scoped rulebook.',
    }),
    'registration.deadlineMonths': makeValue(signals.registrationDeadlineMonths, {
      confidence: signals.registrationDeadlineMonths === null ? 0.15 : 0.76,
      snippet: signals.registrationDeadlineSnippet,
    }),
    'registration.mentioned': makeValue(signals.registrationMentioned, {
      confidence: signals.registrationMentioned ? 0.78 : 0.2,
      status: signals.registrationMentioned ? 'found' : 'missing',
      snippet: signals.registrationMentionedSnippet,
    }),
    'registration.assignedToTenant': makeValue(signals.registrationAssignedToTenant, {
      confidence: signals.registrationAssignedToTenant ? 0.8 : 0.2,
      status: signals.registrationAssignedToTenant ? 'found' : 'missing',
      snippet: signals.registrationAssignedToTenantSnippet,
    }),
    'inventory.mentioned': makeValue(signals.inventoryMentioned, {
      confidence: signals.inventoryMentioned ? 0.82 : 0.2,
      status: signals.inventoryMentioned ? 'found' : 'missing',
      snippet: signals.inventoryMentionedSnippet,
    }),
    'inventory.waived': makeValue(signals.inventoryWaived, {
      confidence: signals.inventoryWaived ? 0.86 : 0.2,
      status: signals.inventoryWaived ? 'found' : 'missing',
      snippet: signals.inventoryWaivedSnippet,
    }),
    'insurance.fireMentioned': makeValue(
      signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned,
      {
        confidence:
          signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned
            ? 0.84
            : 0.2,
        status:
          signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned
            ? 'found'
            : 'missing',
        snippet: signals.fireInsuranceTenantSnippet ?? signals.fireInsuranceLandlordSnippet,
      },
    ),
    'insurance.fireTenantMentioned': makeValue(signals.fireInsuranceTenantMentioned, {
      confidence: signals.fireInsuranceTenantMentioned ? 0.84 : 0.2,
      status: signals.fireInsuranceTenantMentioned ? 'found' : 'missing',
      snippet: signals.fireInsuranceTenantSnippet,
    }),
    'insurance.fireLandlordMentioned': makeValue(signals.fireInsuranceLandlordMentioned, {
      confidence: signals.fireInsuranceLandlordMentioned ? 0.84 : 0.2,
      status: signals.fireInsuranceLandlordMentioned ? 'found' : 'missing',
      snippet: signals.fireInsuranceLandlordSnippet,
    }),
    'epc.label': makeValue(signals.epcLabel, {
      confidence:
        signals.epcLabelStatus === 'found'
          ? 0.78
          : signals.epcLabelStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.epcLabelStatus,
      snippet: signals.epcLabelSnippet,
      note: signals.epcLabelNote,
    }),
    'epc.score': makeValue(signals.epcScore, {
      confidence:
        signals.epcScoreStatus === 'found'
          ? 0.78
          : signals.epcScoreStatus === 'ambiguous'
            ? 0.34
            : 0.1,
      status: signals.epcScoreStatus,
      snippet: signals.epcScoreSnippet,
      note: signals.epcScoreNote,
    }),
    'notice.tenantMonths': makeValue(tenantNoticeMonths, {
      confidence: tenantNoticeMonths === null ? 0.15 : 0.8,
      snippet: tenantNoticeClause?.snippet,
    }),
    'notice.landlordMonths': makeValue(landlordNoticeMonths, {
      confidence: landlordNoticeMonths === null ? 0.15 : 0.8,
      snippet: landlordNoticeClause?.snippet,
    }),
    'notice.tenantFeeMonths': makeValue(tenantFeeMonths, {
      confidence: tenantFeeMonths === null ? 0.15 : 0.8,
      snippet: tenantFeeClause?.snippet,
    }),
    'notice.landlordFeeMonths': makeValue(landlordFeeMonths, {
      confidence: landlordFeeMonths === null ? 0.15 : 0.8,
      snippet: landlordFeeClause?.snippet,
    }),
    'termination.tenantPreStartFeeMonths': makeValue(signals.tenantPreStartFeeMonths, {
      confidence: signals.tenantPreStartFeeMonths === null ? 0.15 : 0.78,
      snippet: signals.tenantPreStartFeeSnippet,
    }),
    'termination.tenantEarlyForbidden': makeValue(signals.tenantEarlyTerminationForbidden, {
      confidence: signals.tenantEarlyTerminationForbidden ? 0.82 : 0.2,
      status: signals.tenantEarlyTerminationForbidden ? 'found' : 'missing',
      snippet: signals.tenantEarlyTerminationForbiddenSnippet,
    }),
    'termination.landlordEarlyAllowed': makeValue(signals.landlordEarlyTerminationAllowed, {
      confidence: signals.landlordEarlyTerminationAllowed ? 0.8 : 0.2,
      status: signals.landlordEarlyTerminationAllowed ? 'found' : 'missing',
      snippet: signals.landlordEarlyTerminationAllowedSnippet,
    }),
    'termination.autoForNonPayment': makeValue(signals.autoTerminationForNonPayment, {
      confidence: signals.autoTerminationForNonPayment ? 0.82 : 0.2,
      status: signals.autoTerminationForNonPayment ? 'found' : 'missing',
      snippet: signals.autoTerminationSnippet,
    }),
    'renewal.auto': makeValue(signals.autoRenewal, {
      confidence: signals.autoRenewal ? 0.78 : 0.2,
      status: signals.autoRenewal ? 'found' : 'missing',
      snippet: signals.autoRenewalSnippet,
    }),
    'annexes.detected': makeValue(signals.annexesDetected, {
      confidence: signals.annexesDetected ? 0.72 : 0.2,
      status: signals.annexesDetected ? 'found' : 'missing',
      snippet: signals.annexesSnippet,
    }),
  };
}

function estimateDocumentTypeConfidence(text: string): number {
  const normalized = text.toLowerCase();
  const indicators = [
    /\bhuurovereenkomst\b/,
    /\bhuren?\b/,
    /\bhuurprijs\b/,
    /\bhuurwaarborg\b/,
    /\btenant\b/,
    /\blandlord\b/,
    /\bsecurity deposit\b/,
    /\bbail\b/,
    /\blocataire\b/,
  ];

  const hits = indicators.filter((pattern) => pattern.test(normalized)).length;

  if (hits === 0) {
    return 0;
  }

  return Math.min(0.95, 0.35 + hits * 0.08);
}

function selectFields(
  allFields: Record<LeaseFieldId, ExtractedValue<unknown>>,
  requestedFields?: LeaseFieldId[],
): Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> {
  if (!requestedFields || requestedFields.length === 0) {
    return allFields;
  }

  return requestedFields.reduce<Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>>(
    (acc, fieldId) => {
      const field = allFields[fieldId];

      if (field) {
        acc[fieldId] = field;
      }

      return acc;
    },
    {},
  );
}

export function extractFields(
  input: ExtractFieldsInput,
  options: ExtractFieldsOptions,
): ExtractFieldsResult {
  const text = getInputText(input);
  const signals = parseSignals(text);
  const allFields = buildAllFields(text, signals, input);
  const fields = selectFields(allFields, options.requestedFields);
  const missingFields = Object.entries(fields)
    .filter(([, field]) => field?.status === 'missing')
    .map(([fieldId]) => fieldId as LeaseFieldId);

  const warnings: string[] = [];

  if (!text.trim()) {
    warnings.push('No extractable text was provided to the extractor.');
  }

  if (options.preferLayoutSignals && !input.pages?.some((page) => page.tokens?.length)) {
    warnings.push('Layout-aware extraction was requested, but no token bounding boxes were provided.');
  }

  return {
    schema: options.schema,
    documentTypeConfidence: estimateDocumentTypeConfidence(text),
    detectedLanguage: detectLanguage(text),
    fields,
    missingFields,
    warnings,
  };
}
