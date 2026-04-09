import type { Flag, Explanation } from '@/types';

const EXPLANATIONS: Record<string, string> = {
  'Late Fee':
    'Many states cap late fees at a percentage of monthly rent (commonly 5–10%) or a flat maximum. ' +
    'An unusually high late fee may be challenged in court as a penalty clause.',
  'Notice Period':
    'Most jurisdictions require landlords to provide at least 30 days written notice before terminating ' +
    'a tenancy or making significant changes. A shorter period may violate local tenant protection laws.',
  'Auto-Renewal':
    'Auto-renewal clauses automatically extend the lease at term end unless the tenant gives advance ' +
    'notice (often 30–60 days). Check the required notice window and set a calendar reminder.',
};

export function mapExplanations(flags: Flag[]): Explanation[] {
  return flags.map((flag) => ({
    clause: flag.clause,
    explanation:
      EXPLANATIONS[flag.clause] ??
      'Review this clause carefully with a qualified legal professional.',
  }));
}
