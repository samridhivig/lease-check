import type { LeaseFieldId } from '@/types';

export const CLAUSE_DERIVED_FIELD_IDS = [
  'notice.tenantMonths',
  'notice.landlordMonths',
  'notice.tenantFeeMonths',
  'notice.landlordFeeMonths',
  'termination.tenantPreStartFeeMonths',
  'termination.tenantEarlyForbidden',
  'termination.landlordEarlyAllowed',
  'termination.autoForNonPayment',
  'registration.deadlineMonths',
  'registration.mentioned',
  'registration.assignedToTenant',
  'inventory.mentioned',
  'inventory.waived',
  'insurance.fireMentioned',
  'insurance.fireTenantMentioned',
  'insurance.fireLandlordMentioned',
  'rent.indexationFrequencyMonths',
  'rent.indexationAutomatic',
  'charges.propertyTaxToTenant',
  'renewal.auto',
  'deposit.heldByLandlord',
] as const satisfies readonly LeaseFieldId[];

export const SCALAR_REGEX_FIELD_IDS = [
  'document.kind',
  'document.language',
  'property.address',
  'parties.landlord.names',
  'parties.tenant.names',
  'lease.startDate',
  'lease.endDate',
  'lease.duration',
  'lease.type',
  'rent.baseAmount',
  'rent.currency',
  'charges.amount',
  'charges.mode',
  'deposit.amount',
  'deposit.months',
  'deposit.method',
  'registration.required',
  'epc.label',
  'epc.score',
  'annexes.detected',
] as const satisfies readonly LeaseFieldId[];

export const ALL_RAG_FIELD_IDS = [
  ...SCALAR_REGEX_FIELD_IDS,
  ...CLAUSE_DERIVED_FIELD_IDS,
] as const satisfies readonly LeaseFieldId[];
