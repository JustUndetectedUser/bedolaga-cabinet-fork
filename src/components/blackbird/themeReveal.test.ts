// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * BlackBird: смена темы кругом из точки нажатия (решение владельца 19.11).
 * Переключатель темы (шапка, меню, палитра команд — все через toggleTheme)
 * просит круг (armThemeReveal); класс темы на <html> меняется внутри
 * document.startViewTransition, новая тема раскрывается кругом от последнего
 * нажатия (не старше 1 с; иначе от центра окна) до дальнего угла за 0,5 с.
 * Без View Transitions, при «уменьшить движение», при первой отрисовке, смене
 * системной темы и по API — сразу.
 */

vi.mock('../../api/themeColors', () => ({
  themeColorsApi: { getEnabledThemes: () => Promise.resolve({ dark: true, light: true }) },
}));

type Run = { update: () => void; resolve: () => void; finish: () => void; ready: Promise<void> };
let runs: Run[] = [];
let anims: Array<[Keyframe | PropertyIndexedKeyframes, KeyframeAnimationOptions]> = [];
let reduce = false;

beforeEach(() => {
  vi.resetModules();
  runs = [];
  anims = [];
  reduce = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion: reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.assign(document, {
    startViewTransition: (update: () => void) => {
      let resolve = () => {};
      let finish = () => {};
      const ready = new Promise<void>((r) => {
        resolve = r;
      });
      const finished = new Promise<void>((r) => {
        finish = r;
      });
      runs.push({ update, resolve, finish, ready });
      return { ready, updateCallbackDone: ready, finished };
    },
  });
  document.documentElement.animate = ((
    k: PropertyIndexedKeyframes,
    o: KeyframeAnimationOptions,
  ) => {
    anims.push([k, o]);
    return {} as Animation;
  }) as typeof document.documentElement.animate;
  document.documentElement.className = 'dark';
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  document.documentElement.className = '';
  localStorage.clear();
});

const mod = () => import('./themeReveal');
const html = () => document.documentElement.classList;
/** Прогнать запрошенный переход: снимок старого вида, класс, круг. */
const run = async (i = 0) => {
  runs[i].update();
  runs[i].resolve();
  await Promise.resolve();
  await Promise.resolve();
};
/** Где и докуда круг: --bb-reveal-x, -y, -r на <html> (blackbird.css рисует его по ним). */
const vars = () =>
  ['--bb-reveal-x', '--bb-reveal-y', '--bb-reveal-r'].map(
    (k) => document.documentElement.style.getPropertyValue(k) || null,
  );
const finish = async (i = 0) => {
  runs[i].finish();
  await Promise.resolve();
  await Promise.resolve();
};

describe('applyThemeClass: круг от нажатия', () => {
  it('с переходом: где и докуда — до перехода, класс темы — внутри, круг рисует CSS с первого кадра', async () => {
    const { applyThemeClass, armThemeReveal, rememberPointer } = await mod();
    rememberPointer({ clientX: 900, clientY: 40 });
    armThemeReveal();
    applyThemeClass(document.documentElement, 'light');
    expect(runs).toHaveLength(1);
    expect(html().contains('bb-reveal')).toBe(true);
    // дальний угол от (900, 40) в окне jsdom 1024 x 768 — (0, 768)
    expect(vars()).toEqual(['900px', '40px', `${Math.ceil(Math.hypot(900, 728))}px`]);
    expect(html().contains('dark')).toBe(true);
    await run();
    expect(html().contains('light') && !html().contains('dark')).toBe(true);
    // круг не запускает скрипт после ready: в Firefox кадр раньше был виден весь новый вид — вспышка
    expect(anims).toEqual([]);
    await finish();
    expect(html().contains('bb-reveal')).toBe(false);
    expect(vars()).toEqual([null, null, null]);
  });

  it('нажатие старше 1 с или его нет: круг от центра окна', async () => {
    vi.useFakeTimers();
    const { applyThemeClass, armThemeReveal, rememberPointer } = await mod();
    rememberPointer({ clientX: 900, clientY: 40 });
    vi.advanceTimersByTime(1500);
    armThemeReveal();
    applyThemeClass(document.documentElement, 'light');
    vi.useRealTimers();
    expect(vars()).toEqual(['512px', '384px', '640px']);
  });

  it('без просьбы (первая отрисовка, системная тема, API): сразу', async () => {
    const { applyThemeClass } = await mod();
    applyThemeClass(document.documentElement, 'light');
    expect(runs).toHaveLength(0);
    expect(html().contains('light')).toBe(true);
  });

  it('«уменьшить движение» и браузер без View Transitions: сразу', async () => {
    reduce = true;
    let m = await mod();
    m.armThemeReveal();
    m.applyThemeClass(document.documentElement, 'light');
    expect(runs).toHaveLength(0);
    expect(html().contains('light')).toBe(true);
    reduce = false;
    vi.resetModules();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    m = await mod();
    m.armThemeReveal();
    m.applyThemeClass(document.documentElement, 'dark');
    expect(html().contains('dark') && !html().contains('light')).toBe(true);
  });

  it('уже в этой теме: перехода нет, просьба не остаётся на потом', async () => {
    const { applyThemeClass, armThemeReveal } = await mod();
    armThemeReveal();
    applyThemeClass(document.documentElement, 'dark');
    expect(runs).toHaveLength(0);
    applyThemeClass(document.documentElement, 'light');
    expect(runs).toHaveLength(0);
    expect(html().contains('light')).toBe(true);
  });

  it('другой экземпляр useTheme ставит тему во время перехода: ждёт его, переход один', async () => {
    const { applyThemeClass, armThemeReveal } = await mod();
    armThemeReveal();
    applyThemeClass(document.documentElement, 'light');
    applyThemeClass(document.documentElement, 'light');
    expect(runs).toHaveLength(1);
    expect(html().contains('dark')).toBe(true);
    await run();
    expect(html().contains('light') && !html().contains('dark')).toBe(true);
  });
});

describe('useTheme: переключатель просит круг', () => {
  it('toggleTheme — через переход, первая отрисовка — нет', async () => {
    localStorage.setItem('cabinet-theme', 'dark');
    const { useTheme } = await import('../../hooks/useTheme');
    const { result, unmount } = renderHook(() => useTheme());
    expect(runs).toHaveLength(0);
    await act(async () => {
      result.current.toggleTheme();
    });
    expect(runs).toHaveLength(1);
    await act(async () => {
      await run();
    });
    expect(html().contains('light')).toBe(true);
    expect(localStorage.getItem('cabinet-theme')).toBe('light');
    unmount();
  });
});

describe('blackbird.css', () => {
  it('собственное растворение перехода выключено: видна только смена кругом', () => {
    const css = readFileSync(join(import.meta.dirname, '../../styles/blackbird.css'), 'utf-8');
    expect(css).toMatch(
      /:root\.bb-reveal::view-transition-old\(root\),\s*:root\.bb-reveal::view-transition-new\(root\)\s*\{\s*animation: none;\s*mix-blend-mode: normal;\s*\}/,
    );
    expect(css).toMatch(
      /\n:root\.bb-reveal::view-transition-new\(root\)\s*\{\s*animation: bb-reveal 0\.5s cubic-bezier\(0\.65, 0, 0\.35, 1\) both;\s*\}/,
    );
    expect(css).toMatch(
      /@keyframes bb-reveal\s*\{\s*from\s*\{\s*clip-path: circle\(0 at var\(--bb-reveal-x\) var\(--bb-reveal-y\)\);\s*\}\s*to\s*\{\s*clip-path: circle\(var\(--bb-reveal-r\) at var\(--bb-reveal-x\) var\(--bb-reveal-y\)\);/,
    );
  });
});
