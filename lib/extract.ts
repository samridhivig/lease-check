import type { ExtractedFields } from '@/types';

export function extractFields(text: string): ExtractedFields {
  // TODO: Replace regex placeholders with accurate patterns for real lease documents

  // TODO: Match patterns like "$1,500/month", "rent of $2,000", "monthly rent: $1,800"
  const rentAmountMatch = text.match(/\$[\d,]+(?:\.\d{2})?\s*(?:per month|\/month|monthly)/i);
  const rentAmount = rentAmountMatch
    ? parseFloat(rentAmountMatch[0].replace(/[$,]/g, ''))
    : null;

  // TODO: Match patterns like "30 days notice", "60-day notice period"
  const noticePeriodMatch = text.match(/(\d+)[\s-]?days?\s+(?:written\s+)?notice/i);
  const noticePeriod = noticePeriodMatch ? parseInt(noticePeriodMatch[1], 10) : null;

  // TODO: Match patterns like "late fee of $150", "$75 late charge"
  const lateFeeMatch = text.match(/late\s+fee[s]?\s+(?:of\s+)?\$?([\d,]+(?:\.\d{2})?)/i);
  const lateFee = lateFeeMatch ? parseFloat(lateFeeMatch[1].replace(/,/g, '')) : null;

  // TODO: Match various auto-renewal clause phrasings
  const autoRenewal = /auto(?:matic)?[\s-]?renew(?:al)?/i.test(text);

  return { rentAmount, noticePeriod, lateFee, autoRenewal };
}
