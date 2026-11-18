// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import htmlSource from '../../../../index.html?raw';
import mainSource from '../../../main.tsx?raw';

// CSS через ?raw в vitest приходит пустым (стили не обрабатываются) — читаем файл.
const cssSource = readFileSync(join(import.meta.dirname, '../../../styles/blackbird.css'), 'utf-8');

/**
 * Вход с лендинга: метка ?from=landing (&lon=&t= — где был глобус лендинга в
 * момент нажатия). Тёмная тема: #root скрыт (bb-entry), пока глобус не
 * нарисуется, но не дольше 600 мс; потом проявляется за 400 мс (bb-entry-in).
 * Светлая: чёрная накладка гаснет за 400 мс после первой отрисовки
 * приложения, без ожидания глобуса. Метка убирается из адреса в любом случае.
 */

const { loadGlobeMock } = vi.hoisted(() => ({ loadGlobeMock: vi.fn() }));
vi.mock('./loadGlobe', () => ({ loadGlobe: (...a: unknown[]) => loadGlobeMock(...a) }));

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const MIN = 60_000;
let reduce = false;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  reduce = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion: reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  loadGlobeMock.mockReset();
  // глобус ещё грузится
  loadGlobeMock.mockReturnValue(new Promise(() => {}));
  document.documentElement.className = 'dark';
  document.body.innerHTML = '<div id="root"></div>';
  history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

const entry = () => import('./landingEntry');
const go = (url: string, state: unknown = null) => history.replaceState(state, '', url);
const here = () => location.pathname + location.search + location.hash;
const html = () => document.documentElement.classList;
const veil = () => document.querySelector<HTMLElement>('.bb-entry-veil');

describe('captureLandingEntry: без метки', () => {
  it('null: классов, накладки и загрузки нет, адрес не тронут', async () => {
    go('/?tgWebAppStartParam=x#h');
    const { captureLandingEntry, landingEntryPending, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBeNull();
    expect(html().contains('bb-entry')).toBe(false);
    expect(veil()).toBeNull();
    expect(here()).toBe('/?tgWebAppStartParam=x#h');
    expect(loadGlobeMock).not.toHaveBeenCalled();
    expect(landingEntryPending()).toBe(false);
    expect(landingSpinFrom()).toBeNull();
  });

  it('from — не landing: null, адрес не тронут', async () => {
    go(`/?from=bot&lon=12&t=${NOW}`);
    const { captureLandingEntry } = await entry();
    expect(captureLandingEntry(window)).toBeNull();
    expect(here()).toBe(`/?from=bot&lon=12&t=${NOW}`);
  });
});

describe('captureLandingEntry: тёмная тема', () => {
  it('dark: #root скрыт, метка убрана, прочие параметры, hash и state на месте', async () => {
    go(`/?tgWebAppStartParam=x&from=landing&a=b%20c+d&lon=12.34&t=${NOW - 500}#h`, { usr: 1 });
    const { captureLandingEntry, landingEntryPending, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(html().contains('bb-entry')).toBe(true);
    expect(landingEntryPending()).toBe(true);
    expect(here()).toBe('/?tgWebAppStartParam=x&a=b%20c+d#h');
    expect(history.state).toEqual({ usr: 1 });
    expect(landingSpinFrom()).toEqual({ lon: 12.34, at: NOW - 500 });
    expect(veil()).toBeNull();
  });

  it('без других параметров адрес остаётся без «?»', async () => {
    go(`/?from=landing&lon=-3.5&t=${NOW}`);
    const { captureLandingEntry } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(here()).toBe('/');
  });

  it('глобус начинает грузиться сразу', async () => {
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    expect(loadGlobeMock).toHaveBeenCalledTimes(1);
  });

  it('ожидание не дольше 600 мс, затем проявление за 400 мс', async () => {
    go('/?from=landing');
    const { captureLandingEntry, landingEntryPending } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(599);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(landingEntryPending()).toBe(false);
    vi.advanceTimersByTime(600);
    expect(html().contains('bb-entry-in')).toBe(false);
  });

  it('600 мс считаются от now: часть уже прошла — ждём остаток', async () => {
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window, performance.now() - 450);
    vi.advanceTimersByTime(149);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('releaseLandingEntry раньше 600 мс снимает сразу; повторный вызов безопасен', async () => {
    go('/?from=landing');
    const { captureLandingEntry, releaseLandingEntry, landingEntryPending } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(200);
    releaseLandingEntry();
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(landingEntryPending()).toBe(false);
    expect(() => releaseLandingEntry()).not.toThrow();
    vi.advanceTimersByTime(250);
    // второй вызов не начал проявление заново
    releaseLandingEntry();
    vi.advanceTimersByTime(250);
    expect(html().contains('bb-entry-in')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(false);
  });

  it('глобуса не будет (loadGlobe → null): ожидание снято сразу', async () => {
    loadGlobeMock.mockResolvedValue(null);
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    await vi.advanceTimersByTimeAsync(0);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('метка без lon/t: вход есть, вращение не передаётся', async () => {
    go('/?from=landing');
    const { captureLandingEntry, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(landingSpinFrom()).toBeNull();
  });

  it.each([
    ['lon пустой', `lon=&t=${NOW}`],
    ['lon из пробелов', `lon=%20%20&t=${NOW}`],
    ['lon не число', `lon=abc&t=${NOW}`],
    ['lon Infinity', `lon=Infinity&t=${NOW}`],
    ['t пустой', 'lon=12&t='],
    ['t не число', 'lon=12&t=soon'],
    ['t на 10 мин + 1 мс вперёд', `lon=12&t=${NOW + 10 * MIN + 1}`],
    ['t на 10 мин + 1 мс назад', `lon=12&t=${NOW - 10 * MIN - 1}`],
    ['только lon', 'lon=12'],
    ['только t', `t=${NOW}`],
  ])('%s: вход есть, вращение не передаётся, метка убрана', async (_, q) => {
    go(`/?from=landing&${q}&x=1`);
    const { captureLandingEntry, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(landingSpinFrom()).toBeNull();
    expect(here()).toBe('/?x=1');
  });

  it.each([
    ['ровно 10 мин назад', '-180.00', NOW - 10 * MIN, -180],
    ['ровно 10 мин вперёд', '0', NOW + 10 * MIN, 0],
    ['дробная долгота', '179.99', NOW, 179.99],
  ])('%s: вращение передаётся', async (_, lon, t, want) => {
    go(`/?from=landing&lon=${lon}&t=${t}`);
    const { captureLandingEntry, landingSpinFrom } = await entry();
    captureLandingEntry(window);
    expect(landingSpinFrom()).toEqual({ lon: want, at: t });
  });
});

describe('captureLandingEntry: светлая тема', () => {
  it('light: чёрная накладка, без ожидания глобуса и без передачи вращения', async () => {
    document.documentElement.className = 'light';
    go(`/?from=landing&lon=12&t=${NOW}#h`);
    const { captureLandingEntry, landingEntryPending, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('light');
    expect(html().contains('bb-entry')).toBe(false);
    expect(landingEntryPending()).toBe(false);
    expect(landingSpinFrom()).toBeNull();
    expect(loadGlobeMock).not.toHaveBeenCalled();
    expect(here()).toBe('/#h');
    const v = veil();
    expect(v).not.toBeNull();
    expect(v?.parentElement).toBe(document.body);
    expect(v?.getAttribute('aria-hidden')).toBe('true');
    expect(v?.classList.contains('is-out')).toBe(false);
  });

  it('накладка гаснет после первой отрисовки приложения и потом убирается', async () => {
    document.documentElement.className = 'light';
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(1000);
    expect(veil()?.classList.contains('is-out')).toBe(false);
    document.getElementById('root')?.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(0);
    expect(veil()?.classList.contains('is-out')).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(veil()).toBeNull();
  });

  it('приложение так и не отрисовалось: накладка всё равно гаснет', async () => {
    document.documentElement.className = 'light';
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(6000);
    expect(veil()?.classList.contains('is-out')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(veil()).toBeNull();
  });
});

describe('captureLandingEntry: прочее', () => {
  it('reduced motion: null, без классов и накладки, но метка убрана', async () => {
    reduce = true;
    go(`/?from=landing&lon=12&t=${NOW}&x=1`);
    const { captureLandingEntry, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBeNull();
    expect(html().contains('bb-entry')).toBe(false);
    expect(veil()).toBeNull();
    expect(landingSpinFrom()).toBeNull();
    expect(here()).toBe('/?x=1');
  });

  it('повторный вызов (редирект на /login, вход) без метки: null, ожидание не повторяется', async () => {
    go(`/?from=landing&lon=12&t=${NOW}`);
    const { captureLandingEntry, releaseLandingEntry, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    releaseLandingEntry();
    go('/login');
    expect(captureLandingEntry(window)).toBeNull();
    go('/');
    expect(captureLandingEntry(window)).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(html().contains('bb-entry')).toBe(false);
    // вращение с лендинга остаётся для глобуса этой страницы
    expect(landingSpinFrom()).toEqual({ lon: 12, at: NOW });
  });

  it('main.tsx: вызов самым первым делом, до createRoot', () => {
    const call = mainSource.indexOf('captureLandingEntry(window)');
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(mainSource.indexOf('installEncodingSurrogateGuard()'));
    expect(call).toBeLessThan(mainSource.indexOf('createRoot('));
    expect(mainSource.slice(0, call)).toMatch(/\/\/ BlackBird:[^\n]*\n(\/\/[^\n]*\n)*$/);
  });
});

describe('первая отрисовка чёрная (index.html, bb-entry-black)', () => {
  const inline = () => {
    const match = htmlSource.match(/<script data-hint="landing-entry">([\s\S]*?)<\/script>/);
    if (!match) throw new Error('index.html: нет инлайн-скрипта data-hint="landing-entry"');
    new Function(match[1])();
  };
  const black = () => html().contains('bb-entry-black');

  afterEach(() => {
    for (const s of document.head.querySelectorAll('style')) s.remove();
  });

  it('index.html: с меткой — чёрный фон до бандла (класс и правило)', () => {
    go('/?x=1&from=landing&lon=1&t=2#h');
    inline();
    expect(black()).toBe(true);
    const css = [...document.head.querySelectorAll('style')].map((s) => s.textContent).join('');
    expect(css).toContain('html.bb-entry-black body{background-color:#000}');
  });

  it.each([
    ['без метки', '/?x=1', false],
    ['from — не landing', '/?from=bot', false],
    ['reduced motion', '/?from=landing', true],
  ])('index.html: %s — фон как обычно', (_, url, reduced) => {
    reduce = reduced;
    go(url);
    inline();
    expect(black()).toBe(false);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('тёмная: чёрный держится, пока #root скрыт, и снимается с ожиданием', async () => {
    go('/?from=landing');
    inline();
    const { captureLandingEntry, releaseLandingEntry } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(black()).toBe(true);
    releaseLandingEntry();
    expect(black()).toBe(false);
  });

  it('тёмная: снимается и по таймауту 600 мс', async () => {
    go('/?from=landing');
    inline();
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(600);
    expect(black()).toBe(false);
  });

  it('светлая: снимается, как только чёрная накладка на месте', async () => {
    document.documentElement.className = 'light';
    go('/?from=landing');
    inline();
    const { captureLandingEntry } = await entry();
    expect(captureLandingEntry(window)).toBe('light');
    expect(veil()).not.toBeNull();
    expect(black()).toBe(false);
  });

  it('входа нет (reduced motion, без метки): класс снят, если стоял', async () => {
    go('/?from=landing');
    inline();
    reduce = true;
    const { captureLandingEntry } = await entry();
    expect(captureLandingEntry(window)).toBeNull();
    expect(black()).toBe(false);
  });
});

describe('blackbird.css: числа входа', () => {
  const rule = (selector: string) => {
    // последнее правило с этим селектором (первое может быть общим с другим)
    const at = cssSource.lastIndexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return cssSource.slice(at, cssSource.indexOf('}', at));
  };

  it('#root скрыт при bb-entry и проявляется за 400 мс', () => {
    expect(rule('html.bb-entry #root')).toMatch(/opacity: 0;/);
    expect(rule('html.bb-entry-in #root')).toMatch(/transition: opacity 0\.4s/);
  });

  it('полоса шапки лендинга (0..72 px) закрыта и проявляется вместе с содержимым', () => {
    const band = rule('html.bb-entry-in .bb-globe-layer::after');
    expect(cssSource).toMatch(
      /html\.bb-entry \.bb-globe-layer::after,\s*html\.bb-entry-in \.bb-globe-layer::after \{[^}]*height: 72px;/,
    );
    expect(band).toMatch(/opacity: 0;/);
    expect(band).toMatch(/transition: opacity 0\.4s/);
  });

  it('глобус входа — без проявления 0,6 с', () => {
    expect(rule('.bb-globe-layer.bb-globe-layer--instant')).toMatch(/transition: none;/);
  });

  it('накладка светлой темы: чёрная, гаснет за 400 мс', () => {
    expect(rule('.bb-entry-veil')).toMatch(/background-color: #000;/);
    const out = rule('.bb-entry-veil.is-out');
    expect(out).toMatch(/opacity: 0;/);
    expect(out).toMatch(/transition: opacity 0\.4s/);
  });
});
