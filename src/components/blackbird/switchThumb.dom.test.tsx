// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toggle } from '../admin/Toggle';
import { Switch } from '../primitives/Switch';

/**
 * BlackBird: правило ручки включённого переключателя (blackbird.css) попадает
 * в ручку на разметке, как её строят компоненты: Switch из primitives (Radix:
 * дорожка — сама кнопка) и admin/Toggle (дорожка — span в кнопке).
 */
// Switch вызывает виброотклик платформы: здесь он ничего не делает
vi.mock('@/platform', () => {
  const noop = () => {};
  const any: object = new Proxy({}, { get: () => new Proxy(noop, { get: () => noop }) });
  return { usePlatform: () => any };
});

const css = readFileSync(join(import.meta.dirname, '../../styles/blackbird.css'), 'utf-8');
const selectorOf = (theme: string) => {
  const m = new RegExp(
    `(\\.${theme} \\[role="switch"\\][^{]*)\\{\\s*background-color: rgb\\(var\\(--color-dark-`,
  ).exec(css);
  return m ? m[1].trim() : '';
};

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
});

describe('ручка включённого переключателя', () => {
  for (const theme of ['dark', 'light']) {
    it(`${theme}: Switch и Toggle — ручка включённого под правилом, выключенного — нет`, () => {
      document.documentElement.className = theme;
      const sel = selectorOf(theme);
      expect(sel).not.toBe('');
      for (const checked of [true, false]) {
        const s = render(<Switch checked={checked} onCheckedChange={() => {}} />);
        const sThumb = s.container.querySelector('[role="switch"] .bg-white');
        expect(sThumb?.matches(sel), `Switch ${checked}`).toBe(checked);
        const t = render(<Toggle checked={checked} onChange={() => {}} />);
        const tThumb = t.container.querySelector('[role="switch"] .bg-white');
        expect(tThumb?.matches(sel), `Toggle ${checked}`).toBe(checked);
        cleanup();
      }
    });
  }
});
