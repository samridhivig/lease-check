export interface Flag {
  ruleId: string;
  clause: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
  uncertain?: boolean;
  sources: RuleSource[];
}

export interface Explanation {
  ruleId: string;
  clause: string;
  explanation: string;
  uncertain?: boolean;
  sources: RuleSource[];
}

export interface AnalysisResult {
  summary: string;
  flags: Flag[];
  explanations: Explanation[];
}

export interface RuleSource {
  label: string;
  url: string;
}

export type LeaseExtractionSchema =
  | 'be-flanders-residential-v1'
  | 'be-flanders-social-v1'
  | 'be-flanders-student-v1';

export type LeaseFieldId =
  | 'document.kind'
  | 'document.language'
  | 'property.address'
  | 'parties.landlord.names'
  | 'parties.tenant.names'
  | 'lease.startDate'
  | 'lease.endDate'
  | 'lease.duration'
  | 'lease.type'
  | 'rent.baseAmount'
  | 'rent.currency'
  | 'rent.indexationFrequencyMonths'
  | 'rent.indexationAutomatic'
  | 'charges.amount'
  | 'charges.mode'
  | 'charges.propertyTaxToTenant'
  | 'deposit.amount'
  | 'deposit.months'
  | 'deposit.method'
  | 'deposit.heldByLandlord'
  | 'registration.required'
  | 'registration.deadlineMonths'
  | 'registration.mentioned'
  | 'registration.assignedToTenant'
  | 'inventory.mentioned'
  | 'inventory.waived'
  | 'insurance.fireMentioned'
  | 'insurance.fireTenantMentioned'
  | 'insurance.fireLandlordMentioned'
  | 'epc.label'
  | 'epc.score'
  | 'notice.tenantMonths'
  | 'notice.landlordMonths'
  | 'notice.tenantFeeMonths'
  | 'notice.landlordFeeMonths'
  | 'termination.tenantEarlyForbidden'
  | 'termination.landlordEarlyAllowed'
  | 'termination.autoForNonPayment'
  | 'renewal.auto'
  | 'annexes.detected';

export type ExtractedFieldStatus = 'found' | 'missing' | 'ambiguous' | 'derived';

export type SupportedDocumentLanguage = 'nl' | 'fr' | 'en' | 'unknown';

export type LeaseExtractionStrictness = 'strict' | 'balanced' | 'lenient';

export interface ExtractionToken {
  text: string;
  bbox: [number, number, number, number];
}

export interface ExtractionPageInput {
  page: number;
  text?: string;
  tokens?: ExtractionToken[];
}

export interface ExtractFieldsInput {
  text?: string;
  pages?: ExtractionPageInput[];
  fileName?: string;
  mimeType?: string;
}

export interface ExtractFieldsOptions {
  schema: LeaseExtractionSchema;
  requestedFields?: LeaseFieldId[];
  country?: 'BE';
  region?: 'FLANDERS';
  languageHints?: Array<'nl' | 'fr' | 'en'>;
  preferLayoutSignals?: boolean;
  returnEvidence?: boolean;
  strictness?: LeaseExtractionStrictness;
}

export interface ExtractionEvidence {
  page?: number;
  snippet: string;
  start?: number;
  end?: number;
  bbox?: [number, number, number, number];
}

export interface ExtractedValue<T> {
  value: T | null;
  confidence: number;
  status: ExtractedFieldStatus;
  evidence?: ExtractionEvidence[];
  notes?: string[];
}

export interface ExtractFieldsResult {
  schema: LeaseExtractionSchema;
  documentTypeConfidence: number;
  detectedLanguage: SupportedDocumentLanguage;
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>;
  missingFields: LeaseFieldId[];
  warnings: string[];
}
