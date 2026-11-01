// node answer.test.mjs
import assert from 'node:assert';
import { normalize } from './answer.js';

for (const s of ['14th Feb 2024', '14 February 2024', '14/02/2024', '14-2-2024', '14.02.24', '14022024',
  '2024-02-14', 'Feb 14, 2024', 'February 14th 2024', '02/14/2024', ' 14 - 02 - 2024 ', '14th of February, 2024'])
  assert.strictEqual(normalize(s), '20240214', s);
assert.strictEqual(normalize('  Test ANSWER '), 'testanswer');
assert.strictEqual(normalize('15 Feb 2024') === normalize('14 Feb 2024'), false);
console.log('ok');
