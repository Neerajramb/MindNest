/**
 * "MindNest" as speech recognisers tend to write it ("Mind Nest", "mine nest", "mind-nest"), with an optional
 * greeting before it. Recognition is also biased towards the word itself (contextual strings), so this only has
 * to cover the common splits.
 */
const WAKE = /\b(?:(?:hey|hi|hello|ok|okay)[\s,]+)?(?:mind|mine|mined|mynd)[\s-]*nests?\b[\s,.!?]*/gi;

/**
 * The question spoken after the last "MindNest" in `transcript`: '' when only the name was said, null when the
 * name was not said at all.
 */
export function afterWakeWord(transcript: string): string | null {
  let end = -1;
  for (const match of transcript.matchAll(WAKE)) end = match.index + match[0].length;
  return end < 0 ? null : transcript.slice(end).trim();
}
