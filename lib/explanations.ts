import { getRuleDefinition } from '@/lib/rules';
import type { Explanation, Flag } from '@/types';

export function mapExplanations(flags: Flag[]): Explanation[] {
  return flags.map((flag) => {
    const rule = getRuleDefinition(flag.ruleId);

    return {
      ruleId: flag.ruleId,
      clause: flag.clause,
      explanation:
        rule?.explanation ??
        'Review this clause carefully with a qualified legal professional.',
      uncertain: flag.uncertain,
      sources: flag.sources,
    };
  });
}
