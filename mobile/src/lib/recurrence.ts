/** The few repeat patterns caregivers need, mapped to the RFC 5545 rules the backend stores. */
export const REPEAT_OPTIONS = [
  { value: 'FREQ=DAILY', label: 'Every day' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
  { value: 'FREQ=WEEKLY;BYDAY=SA,SU', label: 'Weekends' },
] as const;

export type RepeatRule = (typeof REPEAT_OPTIONS)[number]['value'];

export function describeRule(rule: string): string {
  const known = REPEAT_OPTIONS.find((o) => o.value === rule);
  if (known) return known.label;
  if (rule.startsWith('FREQ=WEEKLY')) return 'Some days each week';
  if (rule.startsWith('FREQ=MONTHLY')) return 'Monthly';
  return 'Repeats';
}

export function asRepeatRule(rule: string | undefined): RepeatRule {
  return (REPEAT_OPTIONS.find((o) => o.value === rule)?.value ?? 'FREQ=DAILY') as RepeatRule;
}
