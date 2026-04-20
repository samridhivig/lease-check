import type { ExtractFieldsResult, Flag, RuleSource } from '@/types';

type Severity = Flag['severity'];

interface RuleDefinition {
  id: string;
  clause: string;
  severity: Severity;
  explanation: string;
  uncertain?: boolean;
  sources: RuleSource[];
  check: (result: ExtractFieldsResult) => string | null;
}

const SOURCES = {
  leaseBasics: {
    label: 'Vlaanderen.be - Woninghuurovereenkomst sluiten',
    url: 'https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten',
  },
  deposit: {
    label: 'Vlaanderen.be - Huurwaarborg',
    url: 'https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurwaarborg',
  },
  termination: {
    label: 'Vlaanderen.be - Einde en opzegging van het huurcontract',
    url: 'https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract',
  },
  rent: {
    label: 'Vlaanderen.be - De huurprijs',
    url: 'https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/de-huurprijs',
  },
  costs: {
    label: 'Vlaanderen.be - Kosten en lasten',
    url: 'https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten',
  },
} as const;

export const FLANDERS_RULEBOOK_SCOPE =
  'Designed for principal-residence residential leases in Flanders signed on or after 1 January 2019.';

function getFieldValue<T>(result: ExtractFieldsResult, fieldId: keyof ExtractFieldsResult['fields']): T | null {
  return (result.fields[fieldId]?.value as T | null | undefined) ?? null;
}

function getDocumentKind(result: ExtractFieldsResult): string | null {
  return getFieldValue<string>(result, 'document.kind');
}

function isRulebookScopedDocument(result: ExtractFieldsResult): boolean {
  return getDocumentKind(result) === 'residential_lease';
}

function getBoolean(result: ExtractFieldsResult, fieldId: keyof ExtractFieldsResult['fields']): boolean {
  return getFieldValue<boolean>(result, fieldId) === true;
}

function getNumber(result: ExtractFieldsResult, fieldId: keyof ExtractFieldsResult['fields']): number | null {
  return getFieldValue<number>(result, fieldId);
}

function getLeaseType(result: ExtractFieldsResult): string | null {
  return getFieldValue<string>(result, 'lease.type');
}

function isShortLease(result: ExtractFieldsResult): boolean {
  const durationMonths = getNumber(result, 'lease.duration');
  if (durationMonths !== null) {
    return durationMonths <= 36;
  }

  return getLeaseType(result) === 'short_term';
}

function isLongLease(result: ExtractFieldsResult): boolean {
  const durationMonths = getNumber(result, 'lease.duration');
  if (durationMonths !== null) {
    return durationMonths > 36;
  }

  const leaseType = getLeaseType(result);
  return leaseType === 'nine_year' || leaseType === 'long_term';
}

function formatMonths(months: number): string {
  return Number.isInteger(months) ? `${months}` : months.toFixed(1);
}

export const FLANDERS_RULES: RuleDefinition[] = [
  {
    id: 'deposit-max-three-months',
    clause: 'Security Deposit',
    severity: 'high',
    explanation:
      'For Flemish residential leases signed from 1 January 2019, the landlord may ask for at most 3 months of rent as a rental guarantee.',
    sources: [SOURCES.deposit],
    check(result) {
      const byMonths = getNumber(result, 'deposit.months');
      if (byMonths !== null && byMonths > 3) {
        return `The lease asks for a security deposit of ${formatMonths(byMonths)} months, which exceeds the 3-month cap.`;
      }

      const depositAmount = getNumber(result, 'deposit.amount');
      const rentAmount = getNumber(result, 'rent.baseAmount');
      if (depositAmount !== null && rentAmount !== null && depositAmount > rentAmount * 3) {
        return `The lease asks for a security deposit of EUR ${depositAmount.toFixed(
          2,
        )}, which is more than 3 months of rent.`;
      }

      return null;
    },
  },
  {
    id: 'deposit-not-held-by-landlord',
    clause: 'Security Deposit Handling',
    severity: 'high',
    explanation:
      'The deposit must not stay on the landlord account or in cash. The official rule is that the guarantee belongs on a blocked account in the tenant name, unless another lawful guarantee method is used.',
    sources: [SOURCES.deposit],
    check(result) {
      if (!getBoolean(result, 'deposit.heldByLandlord')) {
        return null;
      }

      return 'The lease appears to let the landlord hold the security deposit directly, which conflicts with the official Flemish guarantee rules.';
    },
  },
  {
    id: 'term-between-three-and-nine-years-defaults-to-nine',
    clause: 'Lease Term',
    severity: 'medium',
    explanation:
      'If the contract states a term between 3 and 9 years, Flemish law treats it as a 9-year lease for a principal residence.',
    sources: [SOURCES.leaseBasics],
    check(result) {
      const leaseTermMonths = getNumber(result, 'lease.duration');
      if (leaseTermMonths === null) {
        return null;
      }

      if (leaseTermMonths > 36 && leaseTermMonths < 108) {
        return `The stated lease term is ${formatMonths(
          leaseTermMonths / 12,
        )} years. In Flanders, a term between 3 and 9 years is treated as a 9-year lease.`;
      }

      return null;
    },
  },
  {
    id: 'short-lease-no-landlord-early-termination',
    clause: 'Short-Term Lease Termination',
    severity: 'high',
    explanation:
      'For a residential lease of 3 years or less, the landlord has no statutory right to terminate early.',
    sources: [SOURCES.leaseBasics, SOURCES.termination],
    check(result) {
      if (!isShortLease(result) || !getBoolean(result, 'termination.landlordEarlyAllowed')) {
        return null;
      }

      return 'This looks like a short-term lease, but it appears to give the landlord an early-termination right that Flemish law does not provide.';
    },
  },
  {
    id: 'short-lease-tenant-notice-max-three-months',
    clause: 'Short-Term Tenant Notice',
    severity: 'high',
    explanation:
      'For a short-term lease signed since 1 January 2019, the tenant may terminate early with 3 months notice.',
    sources: [SOURCES.termination],
    check(result) {
      if (!isShortLease(result)) {
        return null;
      }

      const tenantNotice = getNumber(result, 'notice.tenantMonths');

      if (getBoolean(result, 'termination.tenantEarlyForbidden')) {
        return 'This looks like a short-term lease, but the tenant appears to be denied the statutory right to terminate early.';
      }

      if (tenantNotice !== null && tenantNotice > 3) {
        return `This looks like a short-term lease, but the tenant notice period is ${formatMonths(
          tenantNotice,
        )} months, above the 3-month statutory notice.`;
      }

      return null;
    },
  },
  {
    id: 'short-lease-tenant-fee-max-one-and-a-half-months',
    clause: 'Short-Term Break Fee',
    severity: 'high',
    explanation:
      'For a short-term lease, the tenant break fee is capped at 1.5 months in year 1, 1 month in year 2, and 0.5 month in year 3.',
    sources: [SOURCES.termination],
    check(result) {
      if (!isShortLease(result)) {
        return null;
      }

      const tenantFee = getNumber(result, 'notice.tenantFeeMonths');
      if (tenantFee !== null && tenantFee > 1.5) {
        return `This looks like a short-term lease, but the tenant break fee reaches ${formatMonths(
          tenantFee,
        )} months, above the statutory maximum of 1.5 months.`;
      }

      return null;
    },
  },
  {
    id: 'long-lease-tenant-notice-max-three-months',
    clause: 'Tenant Notice',
    severity: 'high',
    explanation:
      'For 9-year or longer residential leases, the tenant may terminate at any time with 3 months notice.',
    sources: [SOURCES.termination],
    check(result) {
      if (!isLongLease(result)) {
        return null;
      }

      const tenantNotice = getNumber(result, 'notice.tenantMonths');
      if (tenantNotice !== null && tenantNotice > 3) {
        return `The tenant notice period is ${formatMonths(
          tenantNotice,
        )} months, above the statutory 3-month notice for long residential leases.`;
      }

      return null;
    },
  },
  {
    id: 'long-lease-tenant-fee-max-three-months',
    clause: 'Tenant Break Fee',
    severity: 'high',
    explanation:
      'For 9-year or longer residential leases, the tenant break fee may not exceed 3 months of rent, and it steps down to 2 and 1 month in years 2 and 3.',
    sources: [SOURCES.termination],
    check(result) {
      if (!isLongLease(result)) {
        return null;
      }

      const tenantFee = getNumber(result, 'notice.tenantFeeMonths');
      if (tenantFee !== null && tenantFee > 3) {
        return `The tenant break fee reaches ${formatMonths(
          tenantFee,
        )} months, above the 3-month statutory ceiling for long residential leases.`;
      }

      return null;
    },
  },
  {
    id: 'registration-by-landlord-within-two-months',
    clause: 'Registration',
    severity: 'medium',
    explanation:
      'The landlord must register the residential lease within 2 months after signature. A clause that pushes that duty to the tenant or stretches the deadline is a red flag.',
    sources: [SOURCES.leaseBasics],
    check(result) {
      if (getBoolean(result, 'registration.assignedToTenant')) {
        return 'The lease appears to shift the registration duty to the tenant, while the official Flemish rule places that duty on the landlord.';
      }

      const deadlineMonths = getNumber(result, 'registration.deadlineMonths');
      if (deadlineMonths !== null && deadlineMonths > 2) {
        return `The lease appears to allow ${formatMonths(
          deadlineMonths,
        )} months for registration, above the official 2-month deadline.`;
      }

      return null;
    },
  },
  {
    id: 'inventory-cannot-be-waived',
    clause: 'Entry Inventory',
    severity: 'medium',
    explanation:
      'At the start of the lease, the parties must draw up, date, and sign a detailed entry inventory no later than the first month of the tenancy.',
    sources: [SOURCES.leaseBasics],
    check(result) {
      if (!getBoolean(result, 'inventory.waived')) {
        return null;
      }

      return 'The contract seems to waive the entry inventory or asks the tenant to accept the dwelling "as is", which conflicts with the official Flemish inventory rules.';
    },
  },
  {
    id: 'indexation-not-more-than-annual-and-not-automatic',
    clause: 'Rent Indexation',
    severity: 'medium',
    explanation:
      'Rent may be indexed only once per year, from the anniversary date, and indexation is never automatic: the landlord must request it in writing.',
    sources: [SOURCES.rent],
    check(result) {
      const frequencyMonths = getNumber(result, 'rent.indexationFrequencyMonths');
      if (frequencyMonths !== null && frequencyMonths < 12) {
        return `The lease appears to allow rent indexation every ${formatMonths(
          frequencyMonths,
        )} months, but Flemish law only allows annual indexation.`;
      }

      if (getBoolean(result, 'rent.indexationAutomatic')) {
        return 'The lease appears to make rent indexation automatic, but the official rule says indexation never happens automatically and must be requested in writing.';
      }

      return null;
    },
  },
  {
    id: 'property-tax-cannot-be-charged-to-tenant',
    clause: 'Costs and Charges',
    severity: 'high',
    explanation:
      'For post-2019 Flemish residential leases, the landlord pays the onroerende voorheffing (property tax).',
    sources: [SOURCES.costs],
    check(result) {
      if (!getBoolean(result, 'charges.propertyTaxToTenant')) {
        return null;
      }

      return 'The lease appears to charge the onroerende voorheffing or property tax to the tenant, but that cost remains with the landlord.';
    },
  },
  {
    id: 'no-automatic-termination-for-non-payment',
    clause: 'Automatic Termination',
    severity: 'high',
    explanation:
      'Only the justice of the peace can dissolve the lease. A clause that says the lease ends automatically after non-payment is not valid.',
    sources: [SOURCES.rent],
    check(result) {
      if (!getBoolean(result, 'termination.autoForNonPayment')) {
        return null;
      }

      return 'The lease appears to say it ends automatically if rent is unpaid, but the official Flemish guidance says only the justice of the peace can dissolve the contract.';
    },
  },
  {
    id: 'fire-insurance-should-cover-both-parties',
    clause: 'Fire Insurance',
    severity: 'low',
    explanation:
      'Since 1 January 2019, both tenant and landlord are required to have fire insurance. This check is intentionally cautious because some leases rely on statutory law without restating it.',
    uncertain: true,
    sources: [SOURCES.leaseBasics],
    check(result) {
      const tenantMentioned = getBoolean(result, 'insurance.fireTenantMentioned');
      const landlordMentioned = getBoolean(result, 'insurance.fireLandlordMentioned');
      const mentionsOneSide =
        (tenantMentioned && !landlordMentioned) || (!tenantMentioned && landlordMentioned);

      if (!mentionsOneSide) {
        return null;
      }

      return 'The lease mentions fire insurance for only one party. Flemish law requires both tenant and landlord to be insured, so this clause deserves a manual check.';
    },
  },
];

export function getRuleDefinition(ruleId: string): RuleDefinition | undefined {
  return FLANDERS_RULES.find((rule) => rule.id === ruleId);
}

export function runRules(result: ExtractFieldsResult): Flag[] {
  if (!isRulebookScopedDocument(result)) {
    return [];
  }

  const flags: Flag[] = [];

  for (const rule of FLANDERS_RULES) {
    const issue = rule.check(result);

    if (!issue) {
      continue;
    }

    flags.push({
      ruleId: rule.id,
      clause: rule.clause,
      issue,
      severity: rule.severity,
      uncertain: rule.uncertain,
      sources: rule.sources,
    });
  }

  return flags;
}
