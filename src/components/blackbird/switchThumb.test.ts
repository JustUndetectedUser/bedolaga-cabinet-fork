import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BlackBird: включённый переключатель (отзыв 20.11). Дорожка — цвет акцента
 * (#F5F5F5 у палитры BlackBird), ручка — bg-white: вместе одна белая капсула,
 * не видно, что он включён. У включённого (aria-checked="true", дорожка
 * bg-accent-500: Switch из primitives, admin/Toggle и самодельные в формах)
 * ручка тёмная: в тёмной теме цвета фона, в светлой — цвета текста.
 */
const css = readFileSync(join(import.meta.dirname, '../../styles/blackbird.css'), 'utf-8');

describe('blackbird.css: ручка включённого переключателя', () => {
  // 24.11.2026: в светлой теме ручка была цвета текста (--color-dark-50) — того же, что акцент светлой палитры,
  // и на дорожке её не было видно. Теперь в обеих темах ручка — цвета фона страницы.
  it('обе темы: цвет фона страницы, одним правилом', () => {
    expect(css).toMatch(
      /\.dark \[role="switch"\]\[aria-checked="true"\]\[class\*="bg-accent-500"\] > span,\s*\.dark \[role="switch"\]\[aria-checked="true"\] > \[class\*="bg-accent-500"\] > div,\s*\.light \[role="switch"\]\[aria-checked="true"\]\[class\*="bg-accent-500"\] > span,\s*\.light \[role="switch"\]\[aria-checked="true"\] > \[class\*="bg-accent-500"\] > div \{\s*background-color: rgb\(var\(--color-dark-950\)\);\s*\}/,
    );
  });

  it('ручка нигде не красится в цвет текста', () => {
    expect(css).not.toMatch(
      /\[role="switch"\][^{]*\{\s*background-color: rgb\(var\(--color-dark-50\)\)/,
    );
  });
});
