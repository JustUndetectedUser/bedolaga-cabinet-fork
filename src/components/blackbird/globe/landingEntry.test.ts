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
 * момент нажатия). Тёмная тема: #root скрыт (bb-entry), на экране глобус как
 * загрузка, пока страница не готова (releaseLandingEntry зовёт она), но не
 * дольше 5 с от начала документа; глобуса нет на экране через 1,5 с — не ждём.
 * Потом содержимое проявляется за 400 мс (bb-entry-in).
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

const entry = () => import('./landingEntry');
/** Глобус на экране: слой с первым кадром (класс ставит CabinetGlobe или index.html). */
const readyLayer = (cls = 'bb-globe-layer is-ready') => {
  const el = document.createElement('div');
  el.className = cls;
  document.body.appendChild(el);
  return el;
};
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

  it('fly (перелёт глобуса для index.html) — тоже метка: убирается', async () => {
    go(`/?from=landing&lon=-3.5&t=${NOW}&fly=1181.0,567.4,840.0,49.00,600&x=1`);
    const { captureLandingEntry, landingSpinFrom } = await entry();
    expect(captureLandingEntry(window)).toBe('dark');
    expect(here()).toBe('/?x=1');
    expect(landingSpinFrom()).toEqual({ lon: -3.5, at: NOW });
  });

  it('глобус начинает грузиться сразу', async () => {
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    await vi.advanceTimersByTimeAsync(0);
    expect(loadGlobeMock).toHaveBeenCalledTimes(1);
  });

  it('предел: 5 с от начала документа, затем проявление за 400 мс', async () => {
    go('/?from=landing');
    readyLayer();
    const { captureLandingEntry, landingEntryPending, ENTRY_CAP_MS } = await entry();
    expect(ENTRY_CAP_MS).toBe(5000);
    captureLandingEntry(window);
    vi.advanceTimersByTime(4999);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(landingEntryPending()).toBe(false);
    vi.advanceTimersByTime(600);
    expect(html().contains('bb-entry-in')).toBe(false);
  });

  it('предел считается от начала документа: вход в 1200 мс — снятие ровно через 3800 мс', async () => {
    go('/?from=landing');
    readyLayer();
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window, 1200);
    vi.advanceTimersByTime(3799);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('начало документа — первый байт ответа кабинета: время до него (редиректы, сервер) в счёт не идёт', async () => {
    go('/?from=landing');
    readyLayer();
    // performance.now() считает от начала навигации (нажатие на лендинге); ответ кабинета начался на 400-й мс
    vi.spyOn(performance, 'now').mockReturnValue(1600);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { responseStart: 400 },
    ] as unknown as PerformanceEntryList);
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(3799);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it.each([
    ['записи о навигации нет', []],
    ['ответ не отмечен', [{ responseStart: 0 }]],
  ])('начало документа неизвестно (%s): счёт от начала навигации', async (_, entries) => {
    go('/?from=landing');
    readyLayer();
    vi.spyOn(performance, 'now').mockReturnValue(1600);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
      entries as unknown as PerformanceEntryList,
    );
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(3399);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('глобуса нет на экране через 1,5 с от начала документа: ожидание снято, интерфейс как есть', async () => {
    for (const cls of [null, 'bb-globe-layer']) {
      vi.resetModules();
      document.documentElement.className = 'dark';
      document.body.innerHTML = '<div id="root"></div>';
      go('/?from=landing');
      // слоя нет вовсе; слой есть, но первого кадра ещё не было (без is-ready)
      if (cls) readyLayer(cls);
      const { captureLandingEntry, GLOBE_LATE_MS } = await entry();
      expect(GLOBE_LATE_MS).toBe(1500);
      captureLandingEntry(window, 1200);
      vi.advanceTimersByTime(299);
      expect(html().contains('bb-entry'), String(cls)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(html().contains('bb-entry'), String(cls)).toBe(false);
      expect(html().contains('bb-entry-in'), String(cls)).toBe(true);
    }
  });

  it('глобус на экране к 1,5 с: ждём дальше (готовую страницу или предел)', async () => {
    go('/?from=landing');
    readyLayer();
    const { captureLandingEntry, landingEntryPending } = await entry();
    captureLandingEntry(window, 1200);
    vi.advanceTimersByTime(300);
    expect(html().contains('bb-entry')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(landingEntryPending()).toBe(true);
  });

  it('бандл пришёл позже 1,5 с от начала документа, глобуса на экране нет: не ждём вовсе', async () => {
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window, 2400);
    vi.advanceTimersByTime(0);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('«Назад» в кабинет из кэша страниц (pageshow, persisted), пока ожидание не снято: интерфейс сразу', async () => {
    go('/?from=landing');
    readyLayer();
    const { captureLandingEntry, landingEntryPending } = await entry();
    captureLandingEntry(window);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(landingEntryPending()).toBe(true);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(landingEntryPending()).toBe(false);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('releaseLandingEntry: слой глобуса теряет «сразу, без проявления» — после расчёта стилей «до»', async () => {
    go('/?from=landing');
    const layer = readyLayer('bb-globe-layer is-ready bb-globe-layer--instant');
    const { captureLandingEntry, releaseLandingEntry } = await entry();
    captureLandingEntry(window);
    // Класс и первый кадр могли встать в этой же задаче: без расчёта стилей с
    // «сразу» слой проявлялся бы 0,6 с, а на телефоне не было бы перехода к 0.6.
    const seen: string[] = [];
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      if (el === layer) seen.push(`${layer.className} | ${document.documentElement.className}`);
      return real(el, pseudo);
    });
    releaseLandingEntry();
    expect(seen).toEqual(['bb-globe-layer is-ready bb-globe-layer--instant | dark bb-entry']);
    expect(layer.className).toBe('bb-globe-layer is-ready');
  });

  it('releaseLandingEntry раньше предела снимает сразу; повторный вызов безопасен', async () => {
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

  it('тёмная: снимается и без глобуса (1,5 с), и по пределу (5 с)', async () => {
    go('/?from=landing');
    inline();
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(1500);
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

describe('ранний слой index.html, который никто не взял', () => {
  const setEarly = () => {
    const el = document.createElement('div');
    el.className = 'bb-globe-layer';
    document.body.appendChild(el);
    el.classList.add('is-ready', 'bb-globe-layer--instant');
    const destroy = vi.fn();
    const resume = vi.fn();
    const early = {
      base: '/bb-globe/',
      load: Promise.resolve(null),
      layer: {
        el,
        globe: { destroy, resume },
        ready: true,
        onReady: null,
        colors: {},
        faded: false,
      },
      dropped: false,
      adopted: false,
    };
    (window as unknown as { __bbGlobeEarly?: unknown }).__bbGlobeEarly = early;
    return { el, destroy, resume, early };
  };

  afterEach(() => {
    delete (window as unknown as { __bbGlobeEarly?: unknown }).__bbGlobeEarly;
  });

  it('убирается через EARLY_HOLD_MS после входа (страница без глобуса)', async () => {
    const { el, destroy, early } = setEarly();
    go('/?from=landing');
    const { captureLandingEntry, EARLY_HOLD_MS } = await entry();
    // дольше предела входа (5 с): на пределе слой ещё может забрать опоздавшая страница
    expect(EARLY_HOLD_MS).toBe(7000);
    captureLandingEntry(window);
    vi.advanceTimersByTime(EARLY_HOLD_MS - 1);
    expect(el.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.isConnected).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(early.dropped).toBe(true);
    expect(early.layer).toBeNull();
  });

  it('конец ожидания, не взят: гаснет (без скачка), не вращается, но остаётся до EARLY_HOLD_MS', async () => {
    const { el, destroy, resume, early } = setEarly();
    go('/?from=landing');
    const { captureLandingEntry } = await entry();
    captureLandingEntry(window);
    vi.advanceTimersByTime(5000);
    expect(el.classList.contains('is-ready')).toBe(false);
    expect(el.classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(early.layer?.faded).toBe(true);
    expect(resume).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(el.isConnected).toBe(true);
  });

  it('конец ожидания, взят: вращается дальше, виден', async () => {
    const { el, resume, early } = setEarly();
    go('/?from=landing');
    const { captureLandingEntry, releaseLandingEntry } = await entry();
    captureLandingEntry(window);
    early.adopted = true;
    releaseLandingEntry();
    expect(resume).toHaveBeenCalled();
    expect(el.classList.contains('is-ready')).toBe(true);
  });

  it('взятый React не трогается', async () => {
    const { el, destroy, early } = setEarly();
    go('/?from=landing');
    const { captureLandingEntry, EARLY_HOLD_MS } = await entry();
    captureLandingEntry(window);
    early.adopted = true;
    vi.advanceTimersByTime(EARLY_HOLD_MS);
    expect(el.isConnected).toBe(true);
    expect(destroy).not.toHaveBeenCalled();
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

  it('полоса шапки лендинга (0..72 px, только от 1024 px) закрыта первым кадром и гаснет за 0,4 с, как только глобус нарисован', () => {
    const desktop = cssSource.slice(
      cssSource.indexOf(
        '@media (min-width: 1024px) {\n  html.bb-entry-black .bb-globe-layer::after',
      ),
    );
    expect(desktop).toMatch(
      /^@media \(min-width: 1024px\) \{\s*html\.bb-entry-black \.bb-globe-layer::after,\s*html\.bb-entry-in \.bb-globe-layer::after \{[^}]*height: 72px;/,
    );
    // гаснет не с содержимым (оно может прийти через секунды), а с первым кадром глобуса
    expect(desktop).toMatch(
      /html\.bb-entry-black \.bb-globe-layer\.is-ready::after,\s*html\.bb-entry-in \.bb-globe-layer::after \{\s*opacity: 0;\s*transition: opacity 0\.4s ease-out;\s*\}/,
    );
    // вне медиа-запроса полосы нет: у телефона лендинг отдаёт глобус слоем на всё окно, без шапки над ним
    const outside = cssSource.replace(
      /@media \(min-width: 1024px\) \{\s*html\.bb-entry-black \.bb-globe-layer::after[\s\S]*?\n\}\n/,
      '',
    );
    expect(outside).not.toMatch(/bb-globe-layer::after/);
  });

  it('содержимое появляется с подъёмом 12 px за 0,4 с (колонка, не закреплённая шапка)', () => {
    expect(rule('html.bb-entry-in .bb-globe-shade')).toMatch(
      /animation: bb-entry-rise 0\.4s cubic-bezier\(0\.2, 0, 0, 1\) both;/,
    );
    expect(cssSource).toMatch(
      /@keyframes bb-entry-rise \{\s*from \{\s*transform: translateY\(12px\);\s*\}\s*to \{\s*transform: none;\s*\}\s*\}/,
    );
  });

  it('телефон: пока идёт вход, глобус в полную яркость; после — приглушается до 0.6 за 0,4 с', () => {
    const phone = cssSource.slice(
      cssSource.lastIndexOf(
        '@media (max-width: 1023px) {\n  html.bb-entry .bb-globe-layer.is-ready',
      ),
    );
    expect(phone).toMatch(
      /^@media \(max-width: 1023px\) \{\s*html\.bb-entry \.bb-globe-layer\.is-ready,\s*html\.bb-entry-black \.bb-globe-layer\.is-ready \{\s*opacity: 1;\s*\}\s*html\.bb-entry-in \.bb-globe-layer\.is-ready \{\s*transition: opacity 0\.4s ease-out;\s*\}\s*\}/,
    );
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
