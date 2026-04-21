import type { ExtractedValue, LeaseFieldId } from '@/types';
import type { ClauseTopicId, EmbeddedClauseRecord, RetrievedReferenceBundle } from '@/lib/rag/retrieve';

export interface RagClauseFieldExtractionInput {
  clause: EmbeddedClauseRecord;
  referenceBundle: RetrievedReferenceBundle;
}

export interface RagClauseFieldExtractionResult {
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>;
}

interface MatchResult {
  snippet: string;
}

interface DurationResult {
  months: number;
  snippet: string;
}

const WORD_NUMBERS: Array<[RegExp, number]> = [
  [/\b(?:een|one|un|une)\b/i, 1],
  [/\b(?:twee|two|deux)\b/i, 2],
  [/\b(?:drie|three|trois)\b/i, 3],
  [/\b(?:vier|four|quatre)\b/i, 4],
  [/\b(?:vijf|five|cinq)\b/i, 5],
  [/\b(?:zes|six|six)\b/i, 6],
  [/\b(?:zeven|seven|sept)\b/i, 7],
  [/\b(?:acht|eight|huit)\b/i, 8],
  [/\b(?:negen|nine|neuf)\b/i, 9],
  [/\b(?:tien|ten|dix)\b/i, 10],
  [/\b(?:elf|eleven|onze)\b/i, 11],
  [/\b(?:twaalf|twelve|douze)\b/i, 12],
];

const DURATION_FRAGMENT =
  '(?:anderhalve\\s+maand|one\\s+and\\s+a\\s+half\\s+month|un\\s+mois\\s+et\\s+demi|\\d+(?:[.,]\\d+)?\\s*(?:maanden?|months?|mois|jaren?|years?|ans?)|(?:een|one|un|une|twee|two|deux|drie|three|trois|vier|four|quatre|vijf|five|cinq|zes|six|zeven|seven|sept|acht|eight|huit|negen|nine|neuf|tien|ten|dix|elf|eleven|onze|twaalf|twelve|douze)\\s*(?:maanden?|months?|mois|jaren?|years?|ans?))';

function flatten(text: string): string {
  return text.replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();
}

function findMatch(text: string, patterns: RegExp[]): MatchResult | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        snippet: flatten(match[0]),
      };
    }
  }

  return null;
}

function parseNumber(raw: string): number | null {
  const numeric = raw.match(/\d+(?:[.,]\d+)?/);
  if (numeric) {
    const parsed = Number(numeric[0].replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (/anderhalve|one\s+and\s+a\s+half|un\s+mois\s+et\s+demi/i.test(raw)) {
    return 1.5;
  }

  const word = WORD_NUMBERS.find(([pattern]) => pattern.test(raw));
  return word?.[1] ?? null;
}

function parseDurationMonths(raw: string): number | null {
  const value = parseNumber(raw);
  if (value === null) {
    return null;
  }

  if (/(?:jaren?|years?|ans?)\b/i.test(raw)) {
    return value * 12;
  }

  return value;
}

function findDuration(text: string, patterns: RegExp[]): DurationResult | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const durationText = match[1] ?? match[0];
    const months = parseDurationMonths(durationText);
    if (months !== null) {
      return {
        months,
        snippet: flatten(match[0]),
      };
    }
  }

  return null;
}

function buildReferenceNote(referenceBundle: RetrievedReferenceBundle): string | undefined {
  const referenceIds = [
    ...referenceBundle.lawArticles,
    ...referenceBundle.guidancePages,
    ...referenceBundle.supportingExplanations,
  ].map((reference) => reference.id);

  if (referenceIds.length === 0) {
    return undefined;
  }

  return `RAG references retrieved: ${referenceIds.join(', ')}.`;
}

function makeValue<T>(
  value: T,
  confidence: number,
  snippet: string,
  note?: string,
): ExtractedValue<T> {
  return {
    value,
    confidence,
    status: 'found',
    evidence: [{ snippet }],
    notes: note ? [note] : undefined,
  };
}

function addField<T>(
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  fieldId: LeaseFieldId,
  value: T,
  confidence: number,
  snippet: string,
  note?: string,
): void {
  fields[fieldId] = makeValue(value, confidence, snippet, note);
}

function addAmbiguousField(
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  fieldId: LeaseFieldId,
  confidence: number,
  snippet: string,
  note: string,
): void {
  fields[fieldId] = {
    value: null,
    confidence,
    status: 'ambiguous',
    evidence: [{ snippet }],
    notes: [note],
  };
}

function extractRegistrationFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const mention = findMatch(text, [
    /(?:registratie|registreren|registration|register|enregistrement|enregistrer).{0,140}/i,
  ]);
  if (mention) {
    addField(fields, 'registration.mentioned', true, 0.8, mention.snippet, note);
  }

  const tenantDuty = findMatch(text, [
    /(?:huurder|tenant|locataire).{0,120}?(?:moet|shall|must|doit|staat in voor|is responsible for).{0,100}?(?:registratie|registreren|registration|register|enregistrement|enregistrer)/i,
    /(?:registratie|registreren|registration|register|enregistrement|enregistrer).{0,120}?(?:door|by|par|ten laste van).{0,50}?(?:huurder|tenant|locataire)/i,
  ]);
  if (tenantDuty) {
    addField(fields, 'registration.assignedToTenant', true, 0.84, tenantDuty.snippet, note);
  }

  const deadline = findDuration(text, [
    new RegExp(`(?:binnen|within|dans les)\\s+(${DURATION_FRAGMENT}).{0,90}?(?:registratie|registreren|registration|register|enregistrement|enregistrer)`, 'i'),
    new RegExp(`(?:registratie|registreren|registration|register|enregistrement|enregistrer).{0,90}?(${DURATION_FRAGMENT})`, 'i'),
  ]);
  if (deadline) {
    addField(fields, 'registration.deadlineMonths', deadline.months, 0.78, deadline.snippet, note);
  }
}

function extractInventoryFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const mention = findMatch(text, [/plaatsbeschrijving|inventory|etat des lieux/i]);
  if (mention) {
    addField(fields, 'inventory.mentioned', true, 0.82, mention.snippet, note);
  }

  const waived = findMatch(text, [
    /er wordt geen (?:omstandige )?(?:plaatsbeschrijving|inventory|etat des lieux) opgemaakt/i,
    /zonder (?:plaatsbeschrijving|inventory|etat des lieux)/i,
    /(?:huurder|tenant|locataire).{0,140}?(?:aanvaardt|accepts|accepte).{0,100}?(?:huidige staat|as is|en l[' ]etat)/i,
  ]);
  if (waived) {
    addField(fields, 'inventory.waived', true, 0.86, waived.snippet, note);
  }
}

function extractInsuranceFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const fire = findMatch(text, [/brandverzekering|fire insurance|assurance incendie|brand|fire|incendie/i]);
  if (fire) {
    addField(fields, 'insurance.fireMentioned', true, 0.78, fire.snippet, note);
  }

  const tenant = findMatch(text, [
    /(?:huurder|tenant|locataire).{0,180}?(?:brandverzekering|fire insurance|assurance incendie|brand|fire|incendie)/i,
    /(?:brandverzekering|fire insurance|assurance incendie|brand|fire|incendie).{0,180}?(?:huurder|tenant|locataire)/i,
  ]);
  if (tenant) {
    addField(fields, 'insurance.fireTenantMentioned', true, 0.82, tenant.snippet, note);
  }

  const landlord = findMatch(text, [
    /(?:verhuurder|landlord|bailleur).{0,180}?(?:brandverzekering|fire insurance|assurance incendie|brand|fire|incendie)/i,
    /(?:brandverzekering|fire insurance|assurance incendie|brand|fire|incendie).{0,180}?(?:verhuurder|landlord|bailleur)/i,
  ]);
  if (landlord) {
    addField(fields, 'insurance.fireLandlordMentioned', true, 0.82, landlord.snippet, note);
  }
}

function extractPropertyTaxFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const tenantTax = findMatch(text, [
    /(?:huurder|tenant|locataire).{0,180}?(?:betaalt|pays|pay|ten laste).{0,140}?(?:onroerende voorheffing|property tax|precompte immobilier)/i,
    /(?:onroerende voorheffing|property tax|precompte immobilier).{0,140}?(?:ten laste van|for|a charge de).{0,80}?(?:huurder|tenant|locataire)/i,
  ]);
  if (tenantTax) {
    addField(fields, 'charges.propertyTaxToTenant', true, 0.88, tenantTax.snippet, note);
  }
}

function extractNonPaymentFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const automatic = findMatch(text, [
    /(?:automatisch|automatically|de plein droit|van rechtswege).{0,140}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu).{0,180}?(?:wanbetaling|non-payment|default|achterstallige huur|impaye)/i,
    /(?:wanbetaling|non-payment|default|achterstallige huur|impaye).{0,180}?(?:automatisch|automatically|de plein droit|van rechtswege).{0,140}?(?:ontbonden|beeindigd|terminated|resiliated?|resolu)/i,
  ]);
  if (automatic) {
    addField(fields, 'termination.autoForNonPayment', true, 0.86, automatic.snippet, note);
  }
}

function extractRentIndexationFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const automatic = findMatch(text, [
    /automatische\s+index(?:atie|ering)|automatic\s+index(?:ation)?|indexation\s+automatique/i,
  ]);
  if (automatic) {
    addField(fields, 'rent.indexationAutomatic', true, 0.84, automatic.snippet, note);
  }

  const explicitFrequency = findDuration(text, [
    new RegExp(`(?:elke|iedere|om de|every|tous les)\\s+(${DURATION_FRAGMENT}).{0,80}?(?:index|indexatie|indexation)`, 'i'),
    new RegExp(`(?:index|indexatie|indexation).{0,100}?(?:elke|iedere|om de|every|tous les)\\s+(${DURATION_FRAGMENT})`, 'i'),
  ]);
  if (explicitFrequency) {
    addField(
      fields,
      'rent.indexationFrequencyMonths',
      explicitFrequency.months,
      0.78,
      explicitFrequency.snippet,
      note,
    );
    return;
  }

  const monthly = findMatch(text, [/maandelijks|monthly|mensuel/i]);
  if (monthly) {
    addField(fields, 'rent.indexationFrequencyMonths', 1, 0.72, monthly.snippet, note);
    return;
  }

  const annual = findMatch(text, [/jaarlijks|annual(?:ly)?|annuel(?:le)?/i]);
  if (annual) {
    addField(fields, 'rent.indexationFrequencyMonths', 12, 0.72, annual.snippet, note);
  }
}

function extractDepositFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const cash = findMatch(text, [/cash|contant|in contanten|esp[eè]ces|hand cash/i]);
  const blockedAccount = findMatch(text, [
    /ge[iï]ndividualiseerde rekening|huurwaarborgrekening|afzonderlijke huurwaarborgrekening|individual and blocked guarantee account|blocked guarantee account/i,
  ]);
  const landlordAccount = findMatch(text, [
    /rekening van de verhuurder|door de verhuurder opgegeven rekening|landlord'?s account|account of the landlord|compte du bailleur/i,
  ]);

  if ([cash, blockedAccount, landlordAccount].filter(Boolean).length > 1) {
    addAmbiguousField(
      fields,
      'deposit.method',
      0.36,
      (cash ?? blockedAccount ?? landlordAccount)?.snippet ?? text.slice(0, 180),
      note
        ? `${note} The deposit clause lists multiple possible methods, but the selected method is not filled in.`
        : 'The deposit clause lists multiple possible methods, but the selected method is not filled in.',
    );
  } else if (cash) {
    addField(fields, 'deposit.method', 'cash', 0.86, cash.snippet, note);
  } else if (landlordAccount) {
    addField(fields, 'deposit.method', 'landlord_account', 0.78, landlordAccount.snippet, note);
  } else if (blockedAccount) {
    addField(fields, 'deposit.method', 'blocked_account', 0.78, blockedAccount.snippet, note);
  }

  if (cash) {
    addField(fields, 'deposit.heldByLandlord', true, 0.88, cash.snippet, note);
  }

  const heldByLandlord = findMatch(text, [
    /(?:rekening van de verhuurder|eigen rekening van de verhuurder|landlord'?s account|compte du bailleur|cash|contant|in contanten|especes)/i,
    /(?:verhuurder|landlord|bailleur).{0,100}?(?:houdt|keeps|conserve|ontvangt|receives).{0,100}?(?:waarborg|deposit|garantie locative)/i,
  ]);
  if (heldByLandlord) {
    addField(fields, 'deposit.heldByLandlord', true, 0.88, heldByLandlord.snippet, note);
  }
}

function extractTenantTerminationFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const forbidden = findMatch(text, [
    /(?:huurder|tenant|locataire).{0,140}?(?:kan|may|peut).{0,50}?(?:niet|not|pas).{0,100}?(?:vroegtijdig|early|avant le terme|before the end).{0,100}?(?:opzeggen|terminate|resilier)/i,
    /(?:geen|no|aucun).{0,60}?(?:vroegtijdige|early|anticipated).{0,60}?(?:opzeg|termination|resiliation).{0,60}?(?:huurder|tenant|locataire)/i,
  ]);
  if (forbidden) {
    addField(fields, 'termination.tenantEarlyForbidden', true, 0.86, forbidden.snippet, note);
  }

  const notice = findDuration(text, [
    new RegExp(`(?:opzeggingstermijn|notice\\s+period|period\\s+of\\s+notice|preavis)\\s+(?:is|bedraagt|of)?\\s*(${DURATION_FRAGMENT})`, 'i'),
    new RegExp(`(?:huurder|tenant|locataire).{0,160}?(?:opzeg|notice|preavis).{0,80}?(${DURATION_FRAGMENT})`, 'i'),
    new RegExp(`(${DURATION_FRAGMENT}).{0,80}?(?:opzeg|notice|preavis).{0,120}?(?:huurder|tenant|locataire)`, 'i'),
  ]);
  if (notice) {
    addField(fields, 'notice.tenantMonths', notice.months, 0.76, notice.snippet, note);
  }

  const fee = findDuration(text, [
    new RegExp(`(?:huurder|tenant|locataire).{0,180}?(?:vergoeding|indemnity|compensation|fee|indemnite).{0,90}?(${DURATION_FRAGMENT})`, 'i'),
    new RegExp(`(${DURATION_FRAGMENT}).{0,90}?(?:huur|rent|loyer).{0,80}?(?:vergoeding|indemnity|compensation|fee|indemnite)`, 'i'),
  ]);
  if (fee) {
    addField(fields, 'notice.tenantFeeMonths', fee.months, 0.74, fee.snippet, note);
  }

  const preStartFee = findDuration(text, [
    new RegExp(
      `(?:opzeggingsvergoeding|cancellation fee|termination fee|fee|compensation|indemnity).{0,100}?(${DURATION_FRAGMENT}).{0,50}?(?:huur|rent|loyer)`,
      'i',
    ),
    new RegExp(
      `(${DURATION_FRAGMENT}).{0,50}?(?:huur|rent|loyer).{0,80}?(?:opzeggingsvergoeding|cancellation fee|termination fee|fee|compensation|indemnity)`,
      'i',
    ),
  ]);
  if (
    preStartFee &&
    /v[óo]or de inwerkingtreding|before commencement|before the start|less than three months|minder dan drie maanden/i.test(
      text,
    )
  ) {
    addField(
      fields,
      'termination.tenantPreStartFeeMonths',
      preStartFee.months,
      0.78,
      preStartFee.snippet,
      note,
    );
  }
}

function extractLandlordTerminationFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const earlyAllowed = findMatch(text, [
    /(?:verhuurder|landlord|bailleur).{0,160}?(?:kan|may|peut).{0,100}?(?:vroegtijdig|early|before the end|avant la fin).{0,100}?(?:opzeggen|terminate|resilier)/i,
  ]);
  if (earlyAllowed) {
    addField(fields, 'termination.landlordEarlyAllowed', true, 0.84, earlyAllowed.snippet, note);
  }

  const notice = findDuration(text, [
    new RegExp(`(?:verhuurder|landlord|bailleur).{0,160}?(?:opzeg|notice|preavis).{0,80}?(${DURATION_FRAGMENT})`, 'i'),
    new RegExp(`(${DURATION_FRAGMENT}).{0,80}?(?:opzeg|notice|preavis).{0,120}?(?:verhuurder|landlord|bailleur)`, 'i'),
  ]);
  if (notice) {
    addField(fields, 'notice.landlordMonths', notice.months, 0.76, notice.snippet, note);
  }

  const fee = findDuration(text, [
    new RegExp(`(?:verhuurder|landlord|bailleur).{0,180}?(?:vergoeding|indemnity|compensation|fee|indemnite).{0,90}?(${DURATION_FRAGMENT})`, 'i'),
    new RegExp(`(${DURATION_FRAGMENT}).{0,90}?(?:huur|rent|loyer).{0,80}?(?:vergoeding|indemnity|compensation|fee|indemnite)`, 'i'),
  ]);
  if (fee) {
    addField(fields, 'notice.landlordFeeMonths', fee.months, 0.74, fee.snippet, note);
  }
}

function extractRenewalFields(
  text: string,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  note?: string,
): void {
  const automatic = findMatch(text, [
    /(?:stilzwijgend|automatic(?:ally)?|tacitly|reconduction tacite).{0,80}?(?:verleng|renew|extended|prolonge)/i,
    /(?:verleng|renew|extended|prolonge).{0,80}?(?:stilzwijgend|automatic(?:ally)?|tacitly|reconduction tacite)/i,
  ]);
  if (!automatic) {
    return;
  }

  if (/(?:niet|no|not|verbod|zonder dat|may not|cannot|kan niet|geen).{0,80}(?:stilzwijgend|automatic|renewal|verleng)/i.test(automatic.snippet)) {
    return;
  }

  addField(fields, 'renewal.auto', true, 0.82, automatic.snippet, note);
}

const TOPIC_EXTRACTORS: Record<
  ClauseTopicId,
  (
    text: string,
    fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
    note?: string,
  ) => void
> = {
  registration: extractRegistrationFields,
  inventory: extractInventoryFields,
  fire_insurance: extractInsuranceFields,
  property_tax: extractPropertyTaxFields,
  non_payment_termination: extractNonPaymentFields,
  rent_indexation: extractRentIndexationFields,
  deposit_handling: extractDepositFields,
  tenant_termination: extractTenantTerminationFields,
  landlord_termination: extractLandlordTerminationFields,
  renewal: extractRenewalFields,
};

export function extractRagClauseFields({
  clause,
  referenceBundle,
}: RagClauseFieldExtractionInput): RagClauseFieldExtractionResult {
  const fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> = {};
  if (!clause.topic) {
    return { fields };
  }

  const extractor = TOPIC_EXTRACTORS[clause.topic];
  extractor(`${clause.heading ?? ''}\n${clause.text}`, fields, buildReferenceNote(referenceBundle));

  return { fields };
}
