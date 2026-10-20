import { describe, expect, it } from 'vitest';
import { inSequence } from '../../src/common/sequential.js';

describe('inSequence', () => {
  it('runs tasks strictly one after another and returns a typed tuple', async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    };
    const [a, b] = await inSequence(task('a', 20), task('b', 1));
    expect([a, b]).toEqual(['a', 'b']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('stops at the first failure', async () => {
    let ran = false;
    await expect(inSequence(() => Promise.reject(new Error('boom')), () => (ran = true))).rejects.toThrow('boom');
    expect(ran).toBe(false);
  });
});
