import type { ExtractedFields, Flag } from '@/types';

export function runRules(fields: ExtractedFields): Flag[] {
  const flags: Flag[] = [];

  // TODO: Add remaining rules covering security deposit limits, entry notice requirements,
  // lease-break penalties, utilities clauses, subletting restrictions, habitability waivers, etc.

  // Rule 1: Late fee exceeds $100
  if (fields.lateFee !== null && fields.lateFee > 100) {
    flags.push({
      clause: 'Late Fee',
      issue: `Late fee of $${fields.lateFee} exceeds $100 and may be unenforceable in some jurisdictions.`,
      severity: 'high',
    });
  }

  // Rule 2: Notice period shorter than 30 days
  if (fields.noticePeriod !== null && fields.noticePeriod < 30) {
    flags.push({
      clause: 'Notice Period',
      issue: `Notice period of ${fields.noticePeriod} days is below the standard 30-day minimum.`,
      severity: 'medium',
    });
  }

  // Rule 3: Auto-renewal clause detected
  if (fields.autoRenewal === true) {
    flags.push({
      clause: 'Auto-Renewal',
      issue: 'Lease contains an automatic renewal clause. You may be locked into another term without explicit action.',
      severity: 'medium',
    });
  }

  return flags;
}
