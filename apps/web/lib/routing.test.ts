import { describe, expect, it } from 'vitest';
import { safeNext } from './routing';

describe('safeNext', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNext('/work-orders/42?tab=activity#c1')).toBe('/work-orders/42?tab=activity#c1');
    expect(safeNext('/invite/abc')).toBe('/invite/abc');
  });

  it('rejects anything that could leave the site', () => {
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', 'javascript:alert(1)', 'evil.example']) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
