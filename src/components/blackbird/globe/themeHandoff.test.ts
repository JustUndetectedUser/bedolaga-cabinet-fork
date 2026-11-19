// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import htmlSource from '../../../../index.html?raw';

/**
 * BlackBird: тема лендинга едет в кабинет. Вход с лендинга несёт метку
 * ?from=landing&theme=<light|dark>; скрипт темы index.html (до первой
 * отрисовки) открывает кабинет в теме лендинга и запоминает её
 * (cabinet-theme), дальше useTheme читает её как сохранённый выбор. Без
 * theme или с неверной — тёмная: старый лендинг только тёмный. Решение
 * владельца (19.11): светлый лендинг — светлый кабинет, тёмный — тёмный,
 * кэш включённых тем здесь не спрашивается.
 */

vi.mock('../../../api/themeColors', () => ({
  themeColorsApi: { getEnabledThemes: () => Promise.resolve({ dark: true, light: true }) },
}));

let systemLight = false;
let reduce = false;

beforeEach(() => {
  systemLight = false;
  reduce = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches:
      (systemLight && q.includes('prefers-color-scheme: light')) ||
      (reduce && q.includes('prefers-reduced-motion: reduce')),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  localStorage.clear();
  document.documentElement.className = 'dark';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = '';
  history.replaceState(null, '', '/');
});

/** Скрипт темы из index.html (тот, что ставит класс темы до первой отрисовки). */
const themeScript = () => {
  const match = htmlSource.match(/<script>(\s*\/\/ Тема ДО первой отрисовки[\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html: нет скрипта темы до первой отрисовки');
  new Function(match[1])();
};
const go = (url: string) => history.replaceState(null, '', url);
const theme = () => (document.documentElement.classList.contains('light') ? 'light' : 'dark');

describe('тема лендинга при входе (index.html, скрипт темы)', () => {
  it('from=landing&theme=light при сохранённой dark: светлая, сохранено light', () => {
    localStorage.setItem('cabinet-theme', 'dark');
    go('/?from=landing&theme=light&bg=e5e7eb&fg=111827');
    themeScript();
    expect(theme()).toBe('light');
    expect(localStorage.getItem('cabinet-theme')).toBe('light');
  });

  it('from=landing&theme=dark при сохранённой light: тёмная, сохранено dark', () => {
    localStorage.setItem('cabinet-theme', 'light');
    go('/?from=landing&theme=dark');
    themeScript();
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('cabinet-theme')).toBe('dark');
  });

  it.each([
    ['без theme (старый лендинг)', '/?from=landing&lon=1&t=2'],
    ['theme=blue', '/?from=landing&theme=blue'],
  ])('from=landing %s при сохранённой light: тёмная, сохранено dark', (_, url) => {
    localStorage.setItem('cabinet-theme', 'light');
    systemLight = true;
    go(url);
    themeScript();
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('cabinet-theme')).toBe('dark');
  });

  it('тема лендинга важнее кэша включённых тем', () => {
    localStorage.setItem('cabinet-enabled-themes', JSON.stringify({ dark: true, light: false }));
    go('/?from=landing&theme=light');
    themeScript();
    expect(theme()).toBe('light');
    expect(localStorage.getItem('cabinet-theme')).toBe('light');
  });

  it('«уменьшить движение» не мешает', () => {
    reduce = true;
    go('/?from=landing&theme=light');
    themeScript();
    expect(theme()).toBe('light');
  });

  it('theme без from=landing: не трогает', () => {
    localStorage.setItem('cabinet-theme', 'dark');
    go('/?theme=light');
    themeScript();
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('cabinet-theme')).toBe('dark');
  });

  it('localStorage бросает: тема из метки, без исключения', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    go('/?from=landing&theme=light');
    expect(() => themeScript()).not.toThrow();
    expect(theme()).toBe('light');
  });

  it('после скрипта useTheme() отдаёт тему лендинга', async () => {
    localStorage.setItem('cabinet-theme', 'dark');
    go('/?from=landing&theme=light');
    themeScript();
    const { useTheme } = await import('../../../hooks/useTheme');
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    // до снятия заглушек (afterEach): эффекты хука после теста иначе зовут
    // matchMedia, которой в jsdom нет, — необработанная ошибка, vitest выходит с 1
    unmount();
  });
});
