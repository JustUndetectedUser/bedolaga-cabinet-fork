import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isNarrowPage } from './narrowPage';

describe('isNarrowPage: экраны одного действия — узкая колонка', () => {
  it.each([
    '/subscription',
    '/subscription/purchase',
    '/subscriptions/912',
    '/subscriptions/912/',
    '/subscriptions/912/renew',
    '/balance/top-up',
    '/balance/top-up/yookassa',
  ])('%s — узкая', (path) => {
    expect(isNarrowPage(path)).toBe(true);
  });

  it.each([
    '/',
    '/subscriptions',
    '/balance',
    '/balance/saved-cards',
    '/balance/top-up/result',
    '/balance/top-up/result/yookassa',
    '/referral',
    '/profile',
    '/support',
    '/gift',
    '/admin/users',
  ])('%s — как была', (path) => {
    expect(isNarrowPage(path)).toBe(false);
  });

  it('оболочка ставит метку, blackbird.css задаёт 640 px', () => {
    const shell = readFileSync(
      join(import.meta.dirname, '../layout/AppShell/AppShell.tsx'),
      'utf-8',
    );
    const css = readFileSync(join(import.meta.dirname, '../../styles/blackbird.css'), 'utf-8');
    expect(shell).toMatch(/data-bb-narrow=\{isNarrowPage\(location\.pathname\) \|\| undefined\}/);
    expect(css).toMatch(/main\[data-bb-narrow\] > \* \{[^}]*max-width: 640px/);
  });
});
