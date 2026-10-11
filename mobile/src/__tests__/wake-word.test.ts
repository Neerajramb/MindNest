import { describe, expect, test } from '@jest/globals';

import { afterWakeWord } from '@/lib/wake-word';

describe('afterWakeWord', () => {
  test.each([
    ['Hey MindNest what is on my schedule today', 'what is on my schedule today'],
    ['mind nest, where are my keys?', 'where are my keys?'],
    ['Okay mine nest when is my appointment', 'when is my appointment'],
    ['hi mind-nest who is this', 'who is this'],
    ['MindNest', ''],
    ['Hey MindNest.', ''],
  ])('%s', (heard, question) => {
    expect(afterWakeWord(heard)).toBe(question);
  });

  test('takes the question after the last time the name was said', () => {
    expect(afterWakeWord('MindNest stop MindNest who is this')).toBe('who is this');
  });

  test.each(['What is the time', 'I do not mind the nest', 'mindful nesting'])('ignores %s', (heard) => {
    expect(afterWakeWord(heard)).toBeNull();
  });
});
