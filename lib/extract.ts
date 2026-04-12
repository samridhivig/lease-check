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

interface ParsedDurationClause {
  actor: ClauseActor;
  kind: ClauseKind;
  months: number;
  snippet: string;
}

interface ParsedLeaseSignals {
  rentAmount: number | null;
  securityDepositAmount: number | null;
  securityDepositMonths: number | null;
  depositHeldByLandlord: boolean;
  leaseTermMonths: number | null;
  leaseTypeHint: 'short' | 'long' | null;
  durationClauses: ParsedDurationClause[];
  tenantEarlyTerminationForbidden: boolean;
  landlordEarlyTerminationAllowed: boolean;
  registrationDeadlineMonths: number | null;
  registrationAssignedToTenant: boolean;
  registrationMentioned: boolean;
  indexationFrequencyMonths: number | null;
  automaticIndexation: boolean;
  propertyTaxChargedToTenant: boolean;
  autoTerminationForNonPayment: boolean;
  inventoryMentioned: boolean;
  inventoryWaived: boolean;
  fireInsuranceTenantMentioned: boolean;
  fireInsuranceLandlordMentioned: boolean;
  autoRenewal: boolean;
  annexesDetected: boolean;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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

function captureAmount(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1];

    if (!value) {
      continue;
    }

    const parsed = parseAmount(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeMonthPhrase(fragment: string): number | null {
  const lower = fragment.toLowerCase();

  if (
    /anderhalve\s+maand|one\s+and\s+a\s+half\s+month|un\s+mois\s+et\s+demi/.test(lower)
  ) {
    return 1.5;
  }

  if (/een\s+halve\s+maand|half\s+a\s+month|demi-?mois/.test(lower)) {
    return 0.5;
  }

  const numericMatch = lower.match(/(\d+(?:[.,]\d+)?)/);
  const unitMatch = lower.match(
    /(maanden?|maand|months?|month|mois|dagen?|dag|days?|day|jours?|jour)/,
  );

  if (!numericMatch || !unitMatch) {
    return null;
  }

  const value = parseFloat(numericMatch[1].replace(',', '.'));
  const unit = unitMatch[1];

  if (Number.isNaN(value)) {
    return null;
  }

  if (/dag|day|jour/.test(unit)) {
    return Number((value / 30).toFixed(2));
  }

  return value;
}

function captureDuration(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const fragment = match?.[1];

    if (!fragment) {
      continue;
    }

    const months = normalizeMonthPhrase(fragment);

    if (months !== null) {
      return months;
    }
  }

  return null;
}

function inferLeaseTypeHint(text: string): 'short' | 'long' | null {
  if (/korte\s+duur|short[-\s]?term|courte\s+dure[e]?/i.test(text)) {
    return 'short';
  }

  if (
    /9\s*(?:jaar|jaren|years?|ans?)|lange\s+duur|long[-\s]?term|longue\s+dure[e]?|levenslang/i.test(
      text,
    )
  ) {
    return 'long';
  }

  return null;
}

function captureLeaseTermMonths(text: string): number | null {
  const patterns = [
    /(?:huurtermijn|duur|looptijd|termijn|duration|duree|dur[ée]e).{0,40}?(\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/i,
    /(?:huurtermijn|duur|looptijd|termijn|duration|duree|dur[ée]e).{0,40}?(\d+(?:[.,]\d+)?\s*(?:jaar|jaren|years?|ans?))/i,
    /(?:contract|huurovereenkomst|lease|bail).{0,40}?(\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/i,
    /(?:contract|huurovereenkomst|lease|bail).{0,40}?(\d+(?:[.,]\d+)?\s*(?:jaar|jaren|years?|ans?))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const fragment = match?.[1];

    if (!fragment) {
      continue;
    }

    const lower = fragment.toLowerCase();
    const value = parseFloat((lower.match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '').replace(',', '.'));

    if (Number.isNaN(value)) {
      continue;
    }

    if (/(maand|month|mois)/.test(lower)) {
      return Math.round(value);
    }

    if (/(jaar|year|ans?)/.test(lower)) {
      return Math.round(value * 12);
    }
  }

  return null;
}

function captureDurationClauses(text: string): ParsedDurationClause[] {
  const patterns: Array<{
    actor: ClauseActor;
    kind: ClauseKind;
    regex: RegExp;
  }> = [
    {
      actor: 'tenant',
      kind: 'notice',
      regex:
        /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:opzeg(?:ging)?(?:stermijn)?|notice|preavis).{0,40}?(anderhalve maand|een halve maand|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois|dagen?|days?|jours?))/gi,
    },
    {
      actor: 'landlord',
      kind: 'notice',
      regex:
        /(?:verhuurder|landlord|bailleur).{0,120}?(?:opzeg(?:ging)?(?:stermijn)?|notice|preavis).{0,40}?(anderhalve maand|een halve maand|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois|dagen?|days?|jours?))/gi,
    },
    {
      actor: 'tenant',
      kind: 'fee',
      regex:
        /(?:\bhuurder|\btenant|\blocataire).{0,140}?(?:opzeggingsvergoeding|vergoeding|indemnit[eé]|penalt(?:y|ies)|fee).{0,40}?(anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/gi,
    },
    {
      actor: 'landlord',
      kind: 'fee',
      regex:
        /(?:verhuurder|landlord|bailleur).{0,140}?(?:opzeggingsvergoeding|vergoeding|indemnit[eé]|penalt(?:y|ies)|fee).{0,40}?(anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/gi,
    },
  ];

  const clauses: ParsedDurationClause[] = [];

  for (const { actor, kind, regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      const fragment = match[1];

      if (!fragment) {
        continue;
      }

      const months = normalizeMonthPhrase(fragment);

      if (months === null) {
        continue;
      }

      clauses.push({
        actor,
        kind,
        months,
        snippet: normalize(match[0] ?? fragment),
      });
    }
  }

  return clauses;
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

function parseSignals(text: string): ParsedLeaseSignals {
  const normalized = normalize(text);

  const rentAmount = captureAmount(normalized, [
    /(?:huurprijs|rent|monthly rent|loyer).{0,20}?(?:EUR|€)?\s*([\d.,]+)/i,
    /(?:EUR|€)\s*([\d.,]+)\s*(?:per\s*(?:maand|month|mois)|\/\s*(?:maand|month|mois))/i,
  ]);

  const securityDepositAmount = captureAmount(normalized, [
    /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,25}?(?:EUR|€)\s*([\d.,]+)/i,
    /(?:EUR|€)\s*([\d.,]+).{0,25}?(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative)/i,
  ]);

  const securityDepositMonths = captureDuration(normalized, [
    /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,40}?(anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/i,
  ]);

  const depositHeldByLandlord =
    /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,120}?(?:rekening van de verhuurder|eigen rekening van de verhuurder|landlord'?s account|compte du bailleur|cash|contant|in contanten|esp[eè]ces)/i.test(
      normalized,
    ) ||
    /(?:verhuurder|landlord|bailleur).{0,80}?(?:houdt|keeps|conserve).{0,80}?(?:waarborg|deposit|garantie locative)/i.test(
      normalized,
    );

  const leaseTermMonths = captureLeaseTermMonths(normalized);
  const leaseTypeHint = inferLeaseTypeHint(normalized);
  const durationClauses = captureDurationClauses(normalized);

  const tenantEarlyTerminationForbidden =
    /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:kan|may|peut).{0,40}?(?:niet|not|pas).{0,80}?(?:vroegtijdig|early|avant le terme|before the end|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)/i.test(
      normalized,
    ) ||
    /(?:geen|no|aucun).{0,40}?(?:vroegtijdige|early|anticipated).{0,40}?(?:opzeg|termination|resiliation).{0,40}?(?:door de huurder|for the tenant|par le locataire)/i.test(
      normalized,
    );

  const landlordEarlyTerminationAllowed =
    /(?:verhuurder|landlord|bailleur).{0,140}?(?:kan|may|peut).{0,80}?(?:vroegtijdig|early|before the end|avant la fin|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)/i.test(
      normalized,
    );

  const registrationDeadlineMonths = captureDuration(normalized, [
    /(?:registr(?:atie|eren)|registration|enregistrement).{0,50}?(anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois|dagen?|days?|jours?))/i,
  ]);

  const registrationAssignedToTenant =
    /(?:\bhuurder|\btenant|\blocataire).{0,100}?(?:moet|shall|must|doit).{0,80}?(?:registr(?:eren|atie)|register|enregistrer|enregistrement)/i.test(
      normalized,
    ) &&
    !/(?:verhuurder|landlord|bailleur).{0,80}?(?:moet|shall|must|doit).{0,80}?(?:registr(?:eren|atie)|register|enregistrer|enregistrement)/i.test(
      normalized,
    );

  const registrationMentioned =
    /(?:registr(?:atie|eren)|registration|enregistrement)/i.test(normalized);

  let indexationFrequencyMonths: number | null = null;
  if (
    /(?:index(?:atie|ering)|indexation).{0,40}?(?:maandelijks|monthly|mensuel(?:lement)?)/i.test(
      normalized,
    )
  ) {
    indexationFrequencyMonths = 1;
  } else if (
    /(?:index(?:atie|ering)|indexation).{0,40}?(?:per kwartaal|quarterly|trimestriel(?:lement)?)/i.test(
      normalized,
    )
  ) {
    indexationFrequencyMonths = 3;
  } else if (
    /(?:index(?:atie|ering)|indexation).{0,40}?(?:halfjaarlijks|semi-annual|semiannual|semestriel(?:lement)?)/i.test(
      normalized,
    )
  ) {
    indexationFrequencyMonths = 6;
  } else if (
    /(?:index(?:atie|ering)|indexation).{0,40}?(?:jaarlijks|annual(?:ly)?|annuel(?:lement)?|elk jaar|every year|chaque annee|chaque an)/i.test(
      normalized,
    )
  ) {
    indexationFrequencyMonths = 12;
  }

  const automaticIndexation =
    /automatische\s+index(?:atie|ering)|automatic\s+index(?:ation)?|indexation\s+automatique/i.test(
      normalized,
    );

  const propertyTaxChargedToTenant =
    /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:betaalt|pays|pay).{0,80}?(?:onroerende voorheffing|property tax|precompte immobilier)/i.test(
      normalized,
    ) ||
    /(?:onroerende voorheffing|property tax|precompte immobilier).{0,80}?(?:ten laste van de huurder|for the tenant|a charge du locataire)/i.test(
      normalized,
    );

  const autoTerminationForNonPayment =
    /(?:automatisch|automatically|de plein droit).{0,100}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu).{0,140}?(?:wanbetaling|non-payment|default|achterstallige huur|impay[eé])/i.test(
      normalized,
    );

  const inventoryMentioned = /plaatsbeschrijving|inventory|etat des lieux/i.test(normalized);

  const inventoryWaived =
    /(?:geen|no|sans).{0,40}?(?:plaatsbeschrijving|inventory|etat des lieux)/i.test(normalized) ||
    /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:aanvaardt|accepts|accepte).{0,80}?(?:in de huidige staat|as is|en l[' ]etat)/i.test(
      normalized,
    );

  const fireInsuranceTenantMentioned =
    /(?:\bhuurder|\btenant|\blocataire).{0,80}?(?:brandverzekering|fire insurance|assurance incendie)/i.test(
      normalized,
    );

  const fireInsuranceLandlordMentioned =
    /(?:verhuurder|landlord|bailleur).{0,80}?(?:brandverzekering|fire insurance|assurance incendie)/i.test(
      normalized,
    );

  const autoRenewal =
    /automatische\s+verlenging|stilzwijgende\s+verlenging|auto(?:matic)?[\s-]?renew(?:al)?|reconduction tacite/i.test(
      normalized,
    );

  const annexesDetected = /(?:bijlage|bijlagen|annex(?:e|es)?)/i.test(normalized);

  return {
    rentAmount,
    securityDepositAmount,
    securityDepositMonths,
    depositHeldByLandlord,
    leaseTermMonths,
    leaseTypeHint,
    durationClauses,
    tenantEarlyTerminationForbidden,
    landlordEarlyTerminationAllowed,
    registrationDeadlineMonths,
    registrationAssignedToTenant,
    registrationMentioned,
    indexationFrequencyMonths,
    automaticIndexation,
    propertyTaxChargedToTenant,
    autoTerminationForNonPayment,
    inventoryMentioned,
    inventoryWaived,
    fireInsuranceTenantMentioned,
    fireInsuranceLandlordMentioned,
    autoRenewal,
    annexesDetected,
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

function findSnippet(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);

  if (match?.index === undefined) {
    return undefined;
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);

  return normalize(text.slice(start, end));
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

function buildAllFields(text: string, signals: ParsedLeaseSignals): Record<LeaseFieldId, ExtractedValue<unknown>> {
  const normalized = normalize(text);
  const tenantNoticeMonths = maxClauseMonths(signals.durationClauses, 'tenant', 'notice');
  const landlordNoticeMonths = maxClauseMonths(signals.durationClauses, 'landlord', 'notice');
  const tenantFeeMonths = maxClauseMonths(signals.durationClauses, 'tenant', 'fee');
  const landlordFeeMonths = maxClauseMonths(signals.durationClauses, 'landlord', 'fee');
  const leaseType = deriveLeaseType(signals);

  return {
    'document.kind': makeValue('residential_lease', {
      confidence: 0.72,
      status: 'derived',
      note: 'Scoped to the Flemish residential lease schema.',
    }),
    'document.language': makeValue(detectLanguage(normalized), {
      confidence: 0.7,
      status: 'derived',
    }),
    'property.address': makeValue<string>(null, { confidence: 0.1 }),
    'parties.landlord.names': makeValue<string[] | null>(null, { confidence: 0.1 }),
    'parties.tenant.names': makeValue<string[] | null>(null, { confidence: 0.1 }),
    'lease.startDate': makeValue<string>(null, { confidence: 0.1 }),
    'lease.endDate': makeValue<string>(null, { confidence: 0.1 }),
    'lease.duration': makeValue(signals.leaseTermMonths, {
      confidence: signals.leaseTermMonths === null ? 0.15 : 0.78,
      snippet: findSnippet(
        normalized,
        /(?:huurtermijn|duur|looptijd|termijn|duration|duree|dur[ée]e|contract|huurovereenkomst|lease|bail).{0,40}?\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois|jaar|jaren|years?|ans?)/i,
      ),
      note:
        signals.leaseTermMonths === null
          ? undefined
          : 'Duration is normalized to months.',
    }),
    'lease.type': makeValue(leaseType, {
      confidence: leaseType === null ? 0.2 : 0.74,
      status: leaseType === null ? 'missing' : 'derived',
    }),
    'rent.baseAmount': makeValue(signals.rentAmount, {
      confidence: signals.rentAmount === null ? 0.15 : 0.82,
      snippet: findSnippet(
        normalized,
        /(?:huurprijs|rent|monthly rent|loyer).{0,20}?(?:EUR|€)?\s*[\d.,]+|(?:EUR|€)\s*[\d.,]+\s*(?:per\s*(?:maand|month|mois)|\/\s*(?:maand|month|mois))/i,
      ),
    }),
    'rent.currency': makeValue(signals.rentAmount === null ? null : 'EUR', {
      confidence: signals.rentAmount === null ? 0.1 : 0.9,
      status: signals.rentAmount === null ? 'missing' : 'derived',
    }),
    'rent.indexationFrequencyMonths': makeValue(signals.indexationFrequencyMonths, {
      confidence: signals.indexationFrequencyMonths === null ? 0.15 : 0.78,
      snippet: findSnippet(normalized, /(?:index(?:atie|ering)|indexation).{0,80}/i),
    }),
    'rent.indexationAutomatic': makeValue(signals.automaticIndexation, {
      confidence: signals.automaticIndexation ? 0.82 : 0.25,
      status: signals.automaticIndexation ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /automatische\s+index(?:atie|ering)|automatic\s+index(?:ation)?|indexation\s+automatique/i,
      ),
    }),
    'charges.amount': makeValue<number>(null, { confidence: 0.1 }),
    'charges.mode': makeValue<string>(null, { confidence: 0.1 }),
    'charges.propertyTaxToTenant': makeValue(signals.propertyTaxChargedToTenant, {
      confidence: signals.propertyTaxChargedToTenant ? 0.82 : 0.2,
      status: signals.propertyTaxChargedToTenant ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:onroerende voorheffing|property tax|precompte immobilier).{0,80}/i,
      ),
    }),
    'deposit.amount': makeValue(signals.securityDepositAmount, {
      confidence: signals.securityDepositAmount === null ? 0.15 : 0.8,
      snippet: findSnippet(
        normalized,
        /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,25}?(?:EUR|€)\s*[\d.,]+|(?:EUR|€)\s*[\d.,]+.{0,25}?(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative)/i,
      ),
    }),
    'deposit.months': makeValue(signals.securityDepositMonths, {
      confidence: signals.securityDepositMonths === null ? 0.15 : 0.78,
      snippet: findSnippet(
        normalized,
        /(?:huurwaarborg|waarborg|security deposit|deposit|garantie locative).{0,40}?(?:anderhalve maand|een halve maand|un mois et demi|demi-?mois|\d+(?:[.,]\d+)?\s*(?:maanden?|months?|mois))/i,
      ),
    }),
    'deposit.method': makeValue<string>(null, { confidence: 0.1 }),
    'deposit.heldByLandlord': makeValue(signals.depositHeldByLandlord, {
      confidence: signals.depositHeldByLandlord ? 0.82 : 0.2,
      status: signals.depositHeldByLandlord ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:rekening van de verhuurder|eigen rekening van de verhuurder|landlord'?s account|compte du bailleur|cash|contant|in contanten|esp[eè]ces)/i,
      ),
    }),
    'registration.required': makeValue(true, {
      confidence: 0.95,
      status: 'derived',
      note: 'Residential leases in Flanders require landlord registration under the scoped rulebook.',
    }),
    'registration.deadlineMonths': makeValue(signals.registrationDeadlineMonths, {
      confidence: signals.registrationDeadlineMonths === null ? 0.15 : 0.76,
      snippet: findSnippet(
        normalized,
        /(?:registr(?:atie|eren)|registration|enregistrement).{0,80}/i,
      ),
    }),
    'registration.mentioned': makeValue(signals.registrationMentioned, {
      confidence: signals.registrationMentioned ? 0.78 : 0.2,
      status: signals.registrationMentioned ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:registr(?:atie|eren)|registration|enregistrement).{0,80}/i,
      ),
    }),
    'registration.assignedToTenant': makeValue(signals.registrationAssignedToTenant, {
      confidence: signals.registrationAssignedToTenant ? 0.8 : 0.2,
      status: signals.registrationAssignedToTenant ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:\bhuurder|\btenant|\blocataire).{0,100}?(?:moet|shall|must|doit).{0,80}?(?:registr(?:eren|atie)|register|enregistrer|enregistrement)/i,
      ),
    }),
    'inventory.mentioned': makeValue(signals.inventoryMentioned, {
      confidence: signals.inventoryMentioned ? 0.78 : 0.2,
      status: signals.inventoryMentioned ? 'found' : 'missing',
      snippet: findSnippet(normalized, /(?:plaatsbeschrijving|inventory|etat des lieux).{0,80}/i),
    }),
    'inventory.waived': makeValue(signals.inventoryWaived, {
      confidence: signals.inventoryWaived ? 0.82 : 0.2,
      status: signals.inventoryWaived ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:geen|no|sans).{0,40}?(?:plaatsbeschrijving|inventory|etat des lieux)|(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:aanvaardt|accepts|accepte).{0,80}?(?:in de huidige staat|as is|en l[' ]etat)/i,
      ),
    }),
    'insurance.fireMentioned': makeValue(
      signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned,
      {
        confidence:
          signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned
            ? 0.8
            : 0.2,
        status:
          signals.fireInsuranceTenantMentioned || signals.fireInsuranceLandlordMentioned
            ? 'found'
            : 'missing',
        snippet: findSnippet(
          normalized,
          /(?:brandverzekering|fire insurance|assurance incendie).{0,80}/i,
        ),
      },
    ),
    'insurance.fireTenantMentioned': makeValue(signals.fireInsuranceTenantMentioned, {
      confidence: signals.fireInsuranceTenantMentioned ? 0.8 : 0.2,
      status: signals.fireInsuranceTenantMentioned ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:\bhuurder|\btenant|\blocataire).{0,80}?(?:brandverzekering|fire insurance|assurance incendie)/i,
      ),
    }),
    'insurance.fireLandlordMentioned': makeValue(signals.fireInsuranceLandlordMentioned, {
      confidence: signals.fireInsuranceLandlordMentioned ? 0.8 : 0.2,
      status: signals.fireInsuranceLandlordMentioned ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:verhuurder|landlord|bailleur).{0,80}?(?:brandverzekering|fire insurance|assurance incendie)/i,
      ),
    }),
    'epc.label': makeValue<string>(null, { confidence: 0.1 }),
    'epc.score': makeValue<number>(null, { confidence: 0.1 }),
    'notice.tenantMonths': makeValue(tenantNoticeMonths, {
      confidence: tenantNoticeMonths === null ? 0.15 : 0.76,
      snippet: signals.durationClauses.find(
        (clause) => clause.actor === 'tenant' && clause.kind === 'notice',
      )?.snippet,
    }),
    'notice.landlordMonths': makeValue(landlordNoticeMonths, {
      confidence: landlordNoticeMonths === null ? 0.15 : 0.76,
      snippet: signals.durationClauses.find(
        (clause) => clause.actor === 'landlord' && clause.kind === 'notice',
      )?.snippet,
    }),
    'notice.tenantFeeMonths': makeValue(tenantFeeMonths, {
      confidence: tenantFeeMonths === null ? 0.15 : 0.76,
      snippet: signals.durationClauses.find(
        (clause) => clause.actor === 'tenant' && clause.kind === 'fee',
      )?.snippet,
    }),
    'notice.landlordFeeMonths': makeValue(landlordFeeMonths, {
      confidence: landlordFeeMonths === null ? 0.15 : 0.76,
      snippet: signals.durationClauses.find(
        (clause) => clause.actor === 'landlord' && clause.kind === 'fee',
      )?.snippet,
    }),
    'termination.tenantEarlyForbidden': makeValue(signals.tenantEarlyTerminationForbidden, {
      confidence: signals.tenantEarlyTerminationForbidden ? 0.82 : 0.2,
      status: signals.tenantEarlyTerminationForbidden ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:\bhuurder|\btenant|\blocataire).{0,120}?(?:kan|may|peut).{0,40}?(?:niet|not|pas).{0,80}?(?:vroegtijdig|early|avant le terme|before the end|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)|(?:geen|no|aucun).{0,40}?(?:vroegtijdige|early|anticipated).{0,40}?(?:opzeg|termination|resiliation).{0,40}?(?:door de huurder|for the tenant|par le locataire)/i,
      ),
    }),
    'termination.landlordEarlyAllowed': makeValue(signals.landlordEarlyTerminationAllowed, {
      confidence: signals.landlordEarlyTerminationAllowed ? 0.78 : 0.2,
      status: signals.landlordEarlyTerminationAllowed ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:verhuurder|landlord|bailleur).{0,140}?(?:kan|may|peut).{0,80}?(?:vroegtijdig|early|before the end|avant la fin|anticip[eé]e?).{0,80}?(?:opzeggen|terminate|resilier)/i,
      ),
    }),
    'termination.autoForNonPayment': makeValue(signals.autoTerminationForNonPayment, {
      confidence: signals.autoTerminationForNonPayment ? 0.82 : 0.2,
      status: signals.autoTerminationForNonPayment ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /(?:automatisch|automatically|de plein droit).{0,100}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu).{0,140}?(?:wanbetaling|non-payment|default|achterstallige huur|impay[eé])/i,
      ),
    }),
    'renewal.auto': makeValue(signals.autoRenewal, {
      confidence: signals.autoRenewal ? 0.78 : 0.2,
      status: signals.autoRenewal ? 'found' : 'missing',
      snippet: findSnippet(
        normalized,
        /automatische\s+verlenging|stilzwijgende\s+verlenging|auto(?:matic)?[\s-]?renew(?:al)?|reconduction tacite/i,
      ),
    }),
    'annexes.detected': makeValue(signals.annexesDetected, {
      confidence: signals.annexesDetected ? 0.72 : 0.2,
      status: signals.annexesDetected ? 'found' : 'missing',
      snippet: findSnippet(normalized, /(?:bijlage|bijlagen|annex(?:e|es)?).{0,40}/i),
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
  const allFields = buildAllFields(text, signals);
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
