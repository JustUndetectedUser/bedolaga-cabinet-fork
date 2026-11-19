// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import htmlSource from '../../../../index.html?raw';

/**
 * Слой глобуса на «Главной» и экране входа. Модуль подменён: проверяется
 * обёртка. loadGlobe → null — ничего; успех — один .bb-globe-layer прямо в
 * body (декоративный, aria-hidden) и BBGlobe с опциями кабинета; телефон —
 * 30 кадров/с и порог проверки 28, ПК — без предела и 55; смена темы —
 * setColors без второго глобуса; уход со страницы — destroy (после короткой
 * паузы: вход → «Главная» передаёт тот же глобус без рывка, и скелетон
 * «Главной» держит его, пока грузятся данные, сам глобус не создавая);
 * StrictMode — один слой; Telegram «deactivated» и экран блокировки — глобус
 * уезжает за экран (модуль не рисует вне экрана).
 */

const { loadGlobeMock } = vi.hoisted(() => ({ loadGlobeMock: vi.fn() }));
vi.mock('./loadGlobe', () => ({ loadGlobe: (...a: unknown[]) => loadGlobeMock(...a) }));

interface Options {
  [key: string]: unknown;
  onReady: () => void;
  focusX: (w: number, h: number) => number;
  focusY: (w: number, h: number) => number;
  zoom: (w: number, h: number) => number;
}

const instances: {
  root: HTMLElement;
  options: Options;
  setColors: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  /** как модуль, когда globe-data.json не загрузился: failed и пустой корень */
  fail: () => void;
}[] = [];
const ctor = vi.fn();
/** Как модуль с точками суши на GPU (WebGL): свойство gpu следующих глобусов. */
let gpuDots = false;

class FakeGlobe {
  setColors = vi.fn();
  destroy = vi.fn();
  resume = vi.fn();
  still = false;
  failed = false;
  gpu = gpuDots;
  constructor(root: HTMLElement, options: Options) {
    ctor(root, options);
    root.appendChild(document.createElement('canvas'));
    const fail = () => {
      this.failed = true;
      root.replaceChildren();
    };
    instances.push({
      root,
      options,
      setColors: this.setColors,
      destroy: this.destroy,
      resume: this.resume,
      fail,
    });
  }
}

const cabinetView = (w: number, h: number) =>
  w >= 1024
    ? { focusX: 0.75, focusY: 0.55, zoom: w / 4 + 260 }
    : { focusX: 0.62, focusY: 0.49, zoom: h / 2 };

const LOADED = {
  BBGlobe: FakeGlobe,
  cabinetView,
  servers: { DE: { name: 'Германия', region: 'eu' } },
  dataUrl: '/bb-globe/globe-data.json?v=abc',
};

beforeEach(() => {
  vi.resetModules();
  instances.length = 0;
  gpuDots = false;
  ctor.mockReset();
  loadGlobeMock.mockReset();
  loadGlobeMock.mockResolvedValue(LOADED);
  document.documentElement.className = 'dark';
  document.body.style.backgroundColor = 'rgb(0, 0, 0)';
  document.body.style.color = 'rgb(245, 245, 245)';
  vi.stubGlobal('innerWidth', 1440);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.removeAttribute('style');
  document.documentElement.className = '';
});

type Globe = React.ComponentType<{ onReady?: () => void; keepOnly?: boolean; busy?: boolean }>;
/** Пределы входа с лендинга (landingEntry.ts): от начала документа, мс. */
const ENTRY_CAP = 5000;
const GLOBE_LATE = 1500;

/** Дождаться динамических import() и разобрать цепочку промисов за ними (несколько кругов: import → then → import). */
async function settle() {
  for (let round = 0; round < 3; round++) {
    await vi.dynamicImportSettled();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
}

async function mount(ui?: (G: Globe) => React.ReactElement) {
  const { CabinetGlobe } = await import('./CabinetGlobeImpl');
  const view = render(ui ? ui(CabinetGlobe) : <CabinetGlobe />);
  // loadGlobe — промис: даём ему разрешиться и React — отрисовать. Вход с
  // лендинга грузит модули динамически в том же графе: под нагрузкой (CI) их
  // загрузка занимает больше микрозадач, чем фиксированный счёт, поэтому ждём
  // сами загрузки (vi.dynamicImportSettled), а потом разбираем цепочку промисов.
  await act(settle);
  return { ...view, CabinetGlobe };
}

const layers = () => document.querySelectorAll('.bb-globe-layer');

describe('CabinetGlobe', () => {
  it('loadGlobe → null: ничего не рисует', async () => {
    loadGlobeMock.mockResolvedValue(null);
    const { container } = await mount();
    expect(container.innerHTML).toBe('');
    expect(layers()).toHaveLength(0);
    expect(ctor).not.toHaveBeenCalled();
    expect(document.body.classList.contains('bb-globe-on')).toBe(false);
  });

  it('успех: один декоративный слой в body и глобус с опциями кабинета', async () => {
    const { container } = await mount();
    expect(container.innerHTML).toBe('');
    expect(layers()).toHaveLength(1);
    const layer = layers()[0] as HTMLElement;
    expect(layer.parentElement).toBe(document.body);
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(ctor).toHaveBeenCalledTimes(1);
    const [root, options] = ctor.mock.calls[0] as [HTMLElement, Options];
    expect(root).toBe(layer);
    expect(options).toMatchObject({
      spin: 5,
      tilt: 30,
      labels: false,
      nav: 'none',
      maxFps: 0,
      spinGate: { frames: 30, medianMs: 8, minFps: 55, recheckMs: 5000 },
      dataUrl: '/bb-globe/globe-data.json?v=abc',
      servers: LOADED.servers,
      colors: { dot: '#ffffff', ring: '#ffffff', rain: '#ffffff', fade: 'rgb(0, 0, 0)' },
    });
    // положение — cabinetView от размера самого слоя
    expect(options.focusX(1440, 900)).toBe(0.75);
    expect(options.focusY(1440, 900)).toBe(0.55);
    expect(options.zoom(1440, 900)).toBe(620);
    expect(options.zoom(390, 844)).toBe(422);
  });

  it('ширина 390: не больше 30 кадров/с, порог проверки устройства 28', async () => {
    vi.stubGlobal('innerWidth', 390);
    await mount();
    expect(ctor.mock.calls[0][1]).toMatchObject({
      maxFps: 30,
      spinGate: { frames: 30, medianMs: 8, minFps: 28, recheckMs: 5000 },
    });
  });

  it('onReady: слой проявляется, тень под колонкой включается, колбэк страницы вызван', async () => {
    const onReady = vi.fn();
    await mount((G) => <G onReady={onReady} />);
    const layer = layers()[0];
    expect(layer.classList.contains('is-ready')).toBe(false);
    expect(document.body.classList.contains('bb-globe-on')).toBe(false);
    act(() => instances[0].options.onReady());
    expect(layer.classList.contains('is-ready')).toBe(true);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('смена темы: setColors с тёмными точками, второго глобуса нет', async () => {
    await mount();
    document.body.style.backgroundColor = 'rgb(229, 231, 235)';
    document.body.style.color = 'rgb(17, 24, 39)';
    document.documentElement.className = 'light';
    // MutationObserver — микрозадача
    await act(settle);
    expect(instances[0].setColors).toHaveBeenCalledWith({
      dot: 'rgb(17, 24, 39)',
      ring: 'rgba(17, 24, 39, 0.85)',
      rain: 'rgba(17, 24, 39, 0.6)',
      fade: 'rgb(229, 231, 235)',
    });
    expect(ctor).toHaveBeenCalledTimes(1);
    // атрибут поменялся, а цвета те же — повторно не перекрашивает
    document.documentElement.setAttribute('style', '--x: 1');
    await act(settle);
    expect(instances[0].setColors).toHaveBeenCalledTimes(1);
  });

  it('размонтирование: слой прячется до следующего кадра, destroy и удаление после паузы', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { unmount } = await mount();
    act(() => instances[0].options.onReady());
    unmount();
    // микрозадача: раньше отрисовки, но после эффектов страницы, которая может забрать слой
    await act(settle);
    const layer = layers()[0];
    expect(layer.classList.contains('bb-globe-layer--parked')).toBe(true);
    expect(document.body.classList.contains('bb-globe-on')).toBe(false);
    expect(instances[0].destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('вход → «Главная»: следующая страница берёт тот же глобус, без нового и без destroy', async () => {
    const { rerender, CabinetGlobe } = await mount((G) => <G key="login" />);
    act(() => instances[0].options.onReady());
    const onReady = vi.fn();
    // в том же коммите, без ожидания loadGlobe: ни одного кадра со спрятанным слоем
    rerender(<CabinetGlobe key="home" onReady={onReady} />);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].classList.contains('bb-globe-layer--parked')).toBe(false);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instances[0].destroy).not.toHaveBeenCalled();
    // глобус уже нарисован: onReady новой страницы — сразу
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('StrictMode: ровно один слой и один живой глобус', async () => {
    await mount((G) => (
      <StrictMode>
        <G />
      </StrictMode>
    ));
    expect(layers()).toHaveLength(1);
    expect(layers()[0].querySelectorAll('canvas')).toHaveLength(1);
    const alive = instances.filter((i) => i.destroy.mock.calls.length === 0);
    expect(alive).toHaveLength(1);
  });

  it('конструктор упал: ни слоя, ни ошибки наружу', async () => {
    loadGlobeMock.mockResolvedValue({
      ...LOADED,
      BBGlobe: class {
        constructor() {
          throw new Error('no 2d context');
        }
      },
    });
    const { container } = await mount();
    expect(container.innerHTML).toBe('');
    expect(layers()).toHaveLength(0);
  });

  it('данные не загрузились (модуль уничтожил себя): слоя нет, тени нет, повторно не создаётся', async () => {
    const { rerender, CabinetGlobe } = await mount((G) => <G key="a" />);
    await act(async () => instances[0].fail());
    expect(layers()).toHaveLength(0);
    expect(document.body.classList.contains('bb-globe-on')).toBe(false);
    rerender(<CabinetGlobe key="b" />);
    await act(settle);
    expect(layers()).toHaveLength(0);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('вход → скелетон «Главной» → её содержимое: тот же слой, ни разу не спрятан', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender, CabinetGlobe } = await mount((G) => <G key="login" />);
    act(() => instances[0].options.onReady());
    const layer = layers()[0];
    // каждая смена класса со старым значением: спрятать и показать в одном проходе тоже видно
    const classes: string[] = [];
    const watch = new MutationObserver((records) => {
      for (const r of records) classes.push(r.oldValue ?? '');
      classes.push(layer.className);
    });
    watch.observe(layer, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    // «Главная» в DashboardLite: скелетон и содержимое — один и тот же CabinetGlobe, keepOnly снимается
    rerender(<CabinetGlobe key="home" keepOnly />);
    await act(settle);
    vi.advanceTimersByTime(250);
    rerender(<CabinetGlobe key="home" />);
    await act(settle);
    vi.advanceTimersByTime(1000);
    await act(settle);
    watch.disconnect();
    expect(classes.filter((c) => c.includes('bb-globe-layer--parked'))).toEqual([]);
    expect(layers()).toHaveLength(1);
    expect(layers()[0]).toBe(layer);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instances[0].destroy).not.toHaveBeenCalled();
    expect(loadGlobeMock).toHaveBeenCalledTimes(1);
  });

  it('скелетон без готового глобуса: слой не создаёт и ничего не грузит; содержимое — как обычно', async () => {
    const { rerender, CabinetGlobe } = await mount((G) => <G key="home" keepOnly />);
    expect(layers()).toHaveLength(0);
    expect(loadGlobeMock).not.toHaveBeenCalled();
    expect(ctor).not.toHaveBeenCalled();
    // данные пришли: тот же компонент без keepOnly грузит и строит глобус
    rerender(<CabinetGlobe key="home" />);
    await act(settle);
    expect(loadGlobeMock).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
  });

  it('скелетон держит уже спрятанный слой (страница без глобуса между ними, меньше 300 мс)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender, CabinetGlobe } = await mount((G) => <G key="a" />);
    act(() => instances[0].options.onReady());
    rerender(<div key="loader" />);
    await act(settle);
    expect(layers()[0].classList.contains('bb-globe-layer--parked')).toBe(true);
    vi.advanceTimersByTime(200);
    rerender(<CabinetGlobe key="b" keepOnly />);
    await act(settle);
    vi.advanceTimersByTime(1000);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].classList.contains('bb-globe-layer--parked')).toBe(false);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instances[0].destroy).not.toHaveBeenCalled();
  });

  it('Telegram deactivated/activated: слой уезжает за экран и возвращается', async () => {
    const handlers: Record<string, () => void> = {};
    const offEvent = vi.fn();
    vi.stubGlobal('Telegram', {
      WebApp: { onEvent: (e: string, cb: () => void) => (handlers[e] = cb), offEvent },
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { unmount } = await mount();
    const layer = layers()[0];
    act(() => handlers.deactivated());
    expect(layer.classList.contains('bb-globe-layer--paused')).toBe(true);
    act(() => handlers.activated());
    expect(layer.classList.contains('bb-globe-layer--paused')).toBe(false);
    unmount();
    vi.advanceTimersByTime(300);
    expect(offEvent).toHaveBeenCalledWith('deactivated', handlers.deactivated);
    expect(offEvent).toHaveBeenCalledWith('activated', handlers.activated);
  });

  // BlockingOverlay (App.tsx) — непрозрачный экран поверх страницы, а вход или
  // «Главная» под ним держат глобус: IntersectionObserver перекрытия не видит.
  // Слой уезжает за экран (модуль не рисует), снят — возвращается (вращение
  // дальше с того места, где стояло, — это модуль).
  it('экран блокировки: слой уезжает за экран, пока он есть; снят — возвращается', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { unmount } = await mount();
    const { useBlockingStore } = await import('../../../store/blocking');
    const layer = layers()[0];
    const paused = () => layer.classList.contains('bb-globe-layer--paused');
    expect(paused()).toBe(false);
    act(() => useBlockingStore.getState().setMaintenance({ message: 'Технические работы' }));
    expect(paused()).toBe(true);
    act(() => useBlockingStore.getState().setBackendUnavailable());
    expect(paused()).toBe(true);
    act(() => useBlockingStore.getState().clearBlocking());
    expect(paused()).toBe(false);
    unmount();
    vi.advanceTimersByTime(300);
    expect(layers()).toHaveLength(0);
    // после destroy подписки нет: смена экрана блокировки слою ничего не делает
    act(() => useBlockingStore.getState().setBlacklisted({ message: 'x' }));
    expect(paused()).toBe(false);
    act(() => useBlockingStore.getState().clearBlocking());
  });

  it('экран блокировки уже есть, когда слой создаётся: сразу за экраном', async () => {
    const { useBlockingStore } = await import('../../../store/blocking');
    useBlockingStore.getState().setChannelSubscription({ message: 'Подпишитесь' });
    await mount();
    expect(layers()[0].classList.contains('bb-globe-layer--paused')).toBe(true);
    act(() => useBlockingStore.getState().clearBlocking());
    expect(layers()[0].classList.contains('bb-globe-layer--paused')).toBe(false);
  });

  it('Telegram deactivated и экран блокировки вместе: слой на месте, только когда сняты оба', async () => {
    const handlers: Record<string, () => void> = {};
    vi.stubGlobal('Telegram', {
      WebApp: { onEvent: (e: string, cb: () => void) => (handlers[e] = cb), offEvent: vi.fn() },
    });
    await mount();
    const { useBlockingStore } = await import('../../../store/blocking');
    const layer = layers()[0];
    const paused = () => layer.classList.contains('bb-globe-layer--paused');
    act(() => handlers.deactivated());
    act(() => useBlockingStore.getState().setMaintenance({ message: 'x' }));
    act(() => handlers.activated());
    expect(paused()).toBe(true);
    act(() => handlers.deactivated());
    act(() => useBlockingStore.getState().clearBlocking());
    expect(paused()).toBe(true);
    act(() => handlers.activated());
    expect(paused()).toBe(false);
  });
});

describe('CabinetGlobe: вход с лендинга (landingEntry)', () => {
  const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
  const html = () => document.documentElement.classList;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
  });

  async function capture() {
    const { captureLandingEntry } = await import('./landingEntry');
    // второй аргумент — сколько прошло от начала документа (performance.now() здесь настоящий)
    expect(captureLandingEntry(window, 0)).toBe('dark');
  }

  it('глобус входа продолжает вращение лендинга: spinFrom из метки', async () => {
    await capture();
    await mount();
    expect(ctor.mock.calls[0][1]).toMatchObject({ spinFrom: { lon: 40.5, at: NOW - 300 } });
  });

  it('без входа: spinFrom нет (долгота от часов)', async () => {
    await mount();
    expect((ctor.mock.calls[0][1] as Options).spinFrom ?? null).toBeNull();
  });

  it('нарисован во время ожидания: появляется сразу (без проявления 0,6 с), #root проявляется', async () => {
    await capture();
    const onReady = vi.fn();
    await mount((G) => <G onReady={onReady} />);
    const layer = layers()[0];
    expect(html().contains('bb-entry')).toBe(true);
    // «сразу» стоит в расчёте стилей до снятия ожидания (его делает releaseLandingEntry) и снимается с ним
    const seen: string[] = [];
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      if (el === layer) seen.push(layer.className);
      return real(el, pseudo);
    });
    act(() => instances[0].options.onReady());
    expect(seen[0]).toContain('bb-globe-layer--instant');
    expect(seen[0]).toContain('is-ready');
    expect(layer.classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(layer.classList.contains('is-ready')).toBe(true);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('StrictMode: onReady страницы дважды — ожидание снято один раз, без ошибок', async () => {
    await capture();
    await mount((G) => (
      <StrictMode>
        <G />
      </StrictMode>
    ));
    act(() => instances[0].options.onReady());
    expect(html().contains('bb-entry')).toBe(false);
    expect(layers()).toHaveLength(1);
  });

  it('опоздал (позже 1,5 с от начала документа): #root уже виден, глобус проявляется как обычно', async () => {
    await capture();
    await mount();
    vi.advanceTimersByTime(GLOBE_LATE);
    expect(html().contains('bb-entry')).toBe(false);
    act(() => instances[0].options.onReady());
    expect(layers()[0].classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
  });

  it('скелетон «Главной» во время входа глобус не строит и ожидание не снимает; её содержимое — строит и снимает', async () => {
    await capture();
    const view = await mount((G) => <G keepOnly />);
    expect(ctor).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(0);
    expect(html().contains('bb-entry')).toBe(true);
    const G = view.CabinetGlobe as Globe;
    view.rerender(<G />);
    await act(settle);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(html().contains('bb-entry')).toBe(true);
    act(() => instances[0].options.onReady());
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('полная «Главная» ещё грузит данные (busy): глобус строится, но его кадр ожидание не снимает; данные пришли — снято', async () => {
    await capture();
    const onReady = vi.fn();
    const view = await mount((G) => <G busy onReady={onReady} />);
    expect(ctor).toHaveBeenCalledTimes(1);
    act(() => instances[0].options.onReady());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
    expect(html().contains('bb-entry')).toBe(true);
    const G = view.CabinetGlobe as Globe;
    view.rerender(<G busy={false} onReady={onReady} />);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('busy без входа с лендинга ничего не меняет', async () => {
    const view = await mount((G) => <G busy />);
    act(() => instances[0].options.onReady());
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
    const G = view.CabinetGlobe as Globe;
    view.rerender(<G busy={false} />);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(html().contains('bb-entry-in')).toBe(false);
  });

  it('скелетон после входа (ожидание снято) — снова только держит', async () => {
    await capture();
    vi.advanceTimersByTime(GLOBE_LATE);
    await mount((G) => <G keepOnly />);
    expect(ctor).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(0);
  });

  it('данные не загрузились во время входа: ожидание снято сразу', async () => {
    await capture();
    await mount();
    await act(async () => instances[0].fail());
    expect(layers()).toHaveLength(0);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('конструктор упал во время входа: ожидание снято сразу', async () => {
    loadGlobeMock.mockResolvedValue({
      ...LOADED,
      BBGlobe: class {
        constructor() {
          throw new Error('no 2d context');
        }
      },
    });
    await capture();
    await mount();
    expect(layers()).toHaveLength(0);
    expect(html().contains('bb-entry')).toBe(false);
  });
});

describe('ранний глобус: index.html строит слой до React (вход с лендинга, тёмная тема)', () => {
  const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
  const CONFIG = { v: 'abc', servers: LOADED.servers };
  const html = () => document.documentElement.classList;
  const fetchMock = vi.fn();
  const importMock = vi.fn();
  type Early = {
    base: string;
    load: Promise<unknown>;
    layer: { el: HTMLElement; ready: boolean } | null;
    dropped: boolean;
    adopted: boolean;
  };
  const early = () => (window as unknown as { __bbGlobeEarly?: Early }).__bbGlobeEarly;

  /** Инлайн-скрипт index.html с базой /bb-globe/ и подменённым import(). */
  function inline() {
    const match = htmlSource.match(/<script data-hint="landing-entry">([\s\S]*?)<\/script>/);
    if (!match) throw new Error('index.html: нет инлайн-скрипта data-hint="landing-entry"');
    const src = match[1]
      .replace("'%VITE_GLOBE_BASE%'", "'/bb-globe/'")
      .replace(/\bimport\(/g, '__import(');
    new Function('__import', src)(importMock);
  }

  const flush = settle;

  /** Через сколько после первой отрисовки приложения ранний глобус строится сам (index.html). */
  const DRAW_DELAY = 250;

  /** Инлайн-скрипт на странице, где приложение уже отрисовалось (первый узел в #root), и задержка прошла. */
  async function inlineBuilt(url = `/?from=landing&lon=40.5&t=${NOW - 300}`) {
    rendered();
    history.replaceState(null, '', url);
    inline();
    await act(flush);
    act(() => {
      vi.advanceTimersByTime(DRAW_DELAY);
    });
  }

  /** #root с первым узлом приложения. */
  function rendered() {
    let root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root';
      document.body.prepend(root);
    }
    if (!root.firstChild) root.appendChild(document.createElement('main'));
  }

  async function capture() {
    const { captureLandingEntry } = await import('./landingEntry');
    // второй аргумент — сколько прошло от начала документа (performance.now() здесь настоящий)
    return captureLandingEntry(window, 0);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(CONFIG), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    importMock.mockReset();
    importMock.mockResolvedValue({ BBGlobe: FakeGlobe, cabinetView });
  });

  afterEach(() => {
    delete (window as unknown as { __bbGlobeEarly?: Early }).__bbGlobeEarly;
    for (const el of document.head.querySelectorAll('style, link')) el.remove();
    history.replaceState(null, '', '/');
  });

  it('до первой отрисовки приложения — только сеть: config, модуль и данные грузятся, глобус не строится', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.prepend(root);
    history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
    inline();
    await act(flush);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(document.head.querySelector('link[rel="preload"]')).not.toBeNull();
    expect(ctor).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(0);
    // приложение отрисовалось — страницы с глобусом нет DRAW_DELAY: глобус строится сам
    root.appendChild(document.createElement('main'));
    await act(flush);
    vi.advanceTimersByTime(DRAW_DELAY - 1);
    expect(ctor).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
  });

  it('вход кончился раньше задержки, страницы нет: сам не строится; страница позже — строится при ней', async () => {
    rendered();
    history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
    inline();
    await act(flush);
    const { captureLandingEntry, releaseLandingEntry } = await import('./landingEntry');
    captureLandingEntry(window, 0);
    releaseLandingEntry();
    vi.advanceTimersByTime(DRAW_DELAY);
    expect(ctor).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(0);
    await mount();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(early()?.adopted).toBe(true);
  });

  it('страница с глобусом пришла раньше: слой строится при ней (всё уже загружено), один', async () => {
    rendered();
    history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
    inline();
    await act(flush);
    expect(ctor).not.toHaveBeenCalled();
    expect(await capture()).toBe('dark');
    const onReady = vi.fn();
    await mount((G) => <G onReady={onReady} />);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
    expect(early()?.adopted).toBe(true);
    expect(early()?.layer?.el).toBe(layers()[0]);
    // кадр — после страницы: ожидание снимает он
    expect(html().contains('bb-entry')).toBe(true);
    act(() => instances[0].options.onReady());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(html().contains('bb-entry')).toBe(false);
    // задержка прошла — второго глобуса нет
    vi.advanceTimersByTime(DRAW_DELAY);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
  });

  it('метка: config.json, модуль и слой сразу; слой декоративный, в body', async () => {
    await inlineBuilt();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/bb-globe/config.json');
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(importMock).toHaveBeenCalledWith('/bb-globe/bb-globe.js?v=abc');
    // данные — параллельно с модулем, предзагрузкой в том же режиме, что fetch() модуля
    const data = document.head.querySelector<HTMLLinkElement>('link[rel="preload"]');
    expect(data?.getAttribute('href')).toBe('/bb-globe/globe-data.json?v=abc');
    expect(data?.getAttribute('as')).toBe('fetch');
    expect(data?.getAttribute('crossorigin')).toBe('anonymous');
    // ~78 КБ: на узком канале не отнимают полосу у бандла (тот — с высоким приоритетом)
    expect(data?.getAttribute('fetchpriority')).toBe('low');
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
    const layer = layers()[0] as HTMLElement;
    expect(layer.parentElement).toBe(document.body);
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(early()?.layer?.el).toBe(layer);
  });

  it.each([1440, 390])(
    'ширина %i: параметры глобуса — те же, что строит CabinetGlobe',
    async (w) => {
      vi.stubGlobal('innerWidth', w);
      await inlineBuilt();
      const [, a] = ctor.mock.calls[0] as [HTMLElement, Options];
      // тот же вход, но слой строит React
      expect(await capture()).toBe('dark');
      delete (window as unknown as { __bbGlobeEarly?: Early }).__bbGlobeEarly;
      document.body.innerHTML = '';
      await mount();
      const [, b] = ctor.mock.calls[1] as [HTMLElement, Options];
      const plain = (o: Options) =>
        Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function'));
      // ранний ждёт страницу (hold) и продолжает перелёт лендинга (arrive: в этой
      // метке его нет), остальное — то же
      const { hold, arrive, ...rest } = plain(a);
      expect(hold).toBe(true);
      expect(arrive).toBeNull();
      expect(b.hold).toBeUndefined();
      expect(b.arrive).toBeUndefined();
      expect(rest).toEqual(plain(b));
      expect(Object.keys(a).sort()).toEqual([...Object.keys(b), 'hold', 'arrive'].sort());
      for (const [x, y] of [
        [1440, 900],
        [390, 844],
      ]) {
        for (const k of ['focusX', 'focusY', 'zoom'] as const) expect(a[k](x, y)).toBe(b[k](x, y));
      }
      expect(a.spinFrom).toEqual({ lon: 40.5, at: NOW - 300 });
    },
  );

  describe('перелёт лендинга (fly в метке)', () => {
    const FLY = 'fly=1181.0,567.4,840.0,49.00,600';
    /** Ответ кабинета начал приходить на 180-й мс навигации, сейчас 400-я: лендинг перестал рисовать 220 мс назад. */
    function navigated(responseStart: number | null = 180, now = 400) {
      vi.spyOn(performance, 'now').mockReturnValue(now);
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
        responseStart === null ? [] : ([{ responseStart }] as unknown as PerformanceEntryList),
      );
    }
    const arrive = () => (ctor.mock.calls[0][1] as Options).arrive;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('arrive: где стоял глобус лендинга, когда начался перелёт и когда лендинг перестал рисовать', async () => {
      navigated();
      await inlineBuilt(`/?from=landing&lon=40.5&t=${NOW - 300}&${FLY}`);
      expect(arrive()).toEqual({
        x: 1181,
        y: 567.4,
        R: 840,
        lat: 49,
        at: NOW - 300,
        ms: 600,
        cut: NOW - 220,
      });
      expect((ctor.mock.calls[0][1] as Options).spinFrom).toEqual({ lon: 40.5, at: NOW - 300 });
    });

    it.each([
      ['четыре числа', 'fly=1181.0,567.4,840.0,49.00'],
      ['шесть чисел', 'fly=1,2,3,4,5,6'],
      ['не число', 'fly=1181.0,abc,840.0,49.00,600'],
      ['пустое число', 'fly=1181.0,,840.0,49.00,600'],
      ['радиус 0', 'fly=1181.0,567.4,0,49.00,600'],
      ['длительность 0', 'fly=1181.0,567.4,840.0,49.00,0'],
      ['пусто', 'fly='],
    ])('%s: перелёта нет (глобус сразу на месте), вращение — как раньше', async (_, fly) => {
      navigated();
      await inlineBuilt(`/?from=landing&lon=40.5&t=${NOW - 300}&${fly}`);
      expect(arrive()).toBeNull();
      expect((ctor.mock.calls[0][1] as Options).spinFrom).toEqual({ lon: 40.5, at: NOW - 300 });
    });

    it('без lon и t перелёт не продолжить: arrive нет', async () => {
      navigated();
      await inlineBuilt(`/?from=landing&${FLY}`);
      expect(arrive()).toBeNull();
    });

    it.each([
      ['нет записи о навигации', null],
      ['ответ ещё не отмечен', 0],
    ])('%s: когда лендинг перестал рисовать, неизвестно — arrive нет', async (_, responseStart) => {
      navigated(responseStart);
      await inlineBuilt(`/?from=landing&lon=40.5&t=${NOW - 300}&${FLY}`);
      expect(arrive()).toBeNull();
    });

    it('точки на GPU: глобус не ждёт страницу — hold снят сразу, до первого кадра', async () => {
      gpuDots = true;
      navigated();
      await inlineBuilt(`/?from=landing&lon=40.5&t=${NOW - 300}&${FLY}`);
      expect(instances[0].options.hold).toBe(true);
      expect(instances[0].resume).toHaveBeenCalledTimes(1);
    });

    it('без GPU: стоит до страницы, как раньше', async () => {
      navigated();
      await inlineBuilt(`/?from=landing&lon=40.5&t=${NOW - 300}&${FLY}`);
      expect(instances[0].resume).not.toHaveBeenCalled();
    });

    it('точки на GPU, конец входа, страница слой не забрала: погасший уезжает за экран; забрала — на месте', async () => {
      gpuDots = true;
      await inlineBuilt();
      act(() => instances[0].options.onReady());
      await capture();
      const layer = layers()[0];
      vi.advanceTimersByTime(ENTRY_CAP);
      expect(layer.classList.contains('is-ready')).toBe(false);
      // гаснет переходом прозрачности (0,6 с) — за экран только после него
      expect(layer.classList.contains('bb-globe-layer--paused')).toBe(false);
      vi.advanceTimersByTime(700);
      expect(layer.classList.contains('bb-globe-layer--paused')).toBe(true);
      await mount();
      expect(layers()[0]).toBe(layer);
      expect(layer.classList.contains('bb-globe-layer--paused')).toBe(false);
      expect(layer.classList.contains('is-ready')).toBe(true);
    });

    it('точки на GPU, страница забрала слой до конца угасания: за экран он не уезжает', async () => {
      gpuDots = true;
      await inlineBuilt();
      act(() => instances[0].options.onReady());
      await capture();
      vi.advanceTimersByTime(ENTRY_CAP);
      await mount();
      vi.advanceTimersByTime(700);
      expect(layers()[0].classList.contains('bb-globe-layer--paused')).toBe(false);
    });

    it('без GPU погасший слой остаётся на месте (он и так не рисует: hold)', async () => {
      await inlineBuilt();
      act(() => instances[0].options.onReady());
      await capture();
      vi.advanceTimersByTime(ENTRY_CAP + 700);
      expect(layers()[0].classList.contains('bb-globe-layer--paused')).toBe(false);
    });
  });

  it('не «/» и не «/login»: глобус не строится (чёрная первая отрисовка — да)', async () => {
    await inlineBuilt('/subscriptions?from=landing');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(early()).toBeUndefined();
    expect(html().contains('bb-entry-black')).toBe(true);
  });

  it.each([
    ['без метки', '/?x=1', 'dark', false],
    ['светлая тема', '/?from=landing', 'light', false],
    ['reduced motion', '/?from=landing', 'dark', true],
  ])('%s: ничего не грузит и не строит', async (_, url, theme, reduced) => {
    document.documentElement.className = theme;
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced, media: q }));
    await inlineBuilt(url);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(importMock).not.toHaveBeenCalled();
    expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
    expect(early()).toBeUndefined();
    expect(layers()).toHaveLength(0);
  });

  it.each([
    ['lon пустой', `/?from=landing&lon=&t=${NOW}`],
    ['t на 10 мин + 1 мс назад', `/?from=landing&lon=12&t=${NOW - 600_001}`],
    ['без lon и t', '/?from=landing'],
  ])('%s: глобус строится, вращение от часов', async (_, url) => {
    await inlineBuilt(url);
    expect((ctor.mock.calls[0][1] as Options).spinFrom).toBeNull();
  });

  it('config.json 404 или неверный: слоя нет, загрузка — null', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }));
    await inlineBuilt();
    expect(layers()).toHaveLength(0);
    expect(await early()?.load).toBeNull();
    document.body.innerHTML = '';
    delete (window as unknown as { __bbGlobeEarly?: Early }).__bbGlobeEarly;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ v: '', servers: {} }), { status: 200 }),
    );
    await inlineBuilt();
    expect(layers()).toHaveLength(0);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('конструктор упал: слоя нет', async () => {
    importMock.mockResolvedValue({
      BBGlobe: class {
        constructor() {
          throw new Error('no 2d context');
        }
      },
      cabinetView,
    });
    await inlineBuilt();
    expect(layers()).toHaveLength(0);
    expect(early()?.layer).toBeNull();
  });

  it('нарисован до бандла: сразу виден, без проявления', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    const layer = layers()[0];
    expect(layer.classList.contains('is-ready')).toBe(true);
    expect(layer.classList.contains('bb-globe-layer--instant')).toBe(true);
    expect(early()?.layer?.ready).toBe(true);
  });

  it('React берёт готовый слой: тот же холст, без второго глобуса; ожидание снято', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    const layer = layers()[0];
    const canvas = layer.querySelector('canvas');
    expect(await capture()).toBe('dark');
    expect(html().contains('bb-entry')).toBe(true);
    const onReady = vi.fn();
    await mount((G) => <G onReady={onReady} />);
    expect(layers()).toHaveLength(1);
    expect(layers()[0]).toBe(layer);
    expect(layer.querySelector('canvas')).toBe(canvas);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(html().contains('bb-entry')).toBe(false);
    expect(early()?.adopted).toBe(true);
    // страница забрала: вращение — дальше
    expect(instances[0].resume).toHaveBeenCalled();
    expect(layer.classList.contains('is-ready')).toBe(true);
  });

  it('конец входа (предел 5 с), страница не забрала слой: он гаснет и ждёт; забрала позже — виден снова', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    await capture();
    const layer = layers()[0];
    vi.advanceTimersByTime(ENTRY_CAP);
    expect(html().contains('bb-entry')).toBe(false);
    // не скачком: убираются классы, остаётся переход прозрачности слоя (0,6 с)
    expect(layer.classList.contains('is-ready')).toBe(false);
    expect(layer.classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(instances[0].resume).not.toHaveBeenCalled();
    expect(layer.isConnected).toBe(true);
    await mount();
    expect(layers()[0]).toBe(layer);
    expect(layer.classList.contains('is-ready')).toBe(true);
    expect(instances[0].resume).toHaveBeenCalled();
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('конец входа до первого кадра, страницы нет: кадр не показывает слой', async () => {
    await inlineBuilt();
    await capture();
    vi.advanceTimersByTime(GLOBE_LATE);
    expect(html().contains('bb-entry')).toBe(false);
    act(() => instances[0].options.onReady());
    expect(layers()[0].classList.contains('is-ready')).toBe(false);
  });

  it('слой ещё рисуется при монтировании: его первый кадр снимает ожидание', async () => {
    await inlineBuilt();
    await capture();
    const onReady = vi.fn();
    await mount((G) => <G onReady={onReady} />);
    expect(onReady).not.toHaveBeenCalled();
    expect(html().contains('bb-entry')).toBe(true);
    act(() => instances[0].options.onReady());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
    // ожидание снято этим же кадром: «сразу» больше не стоит (переходы после входа — обычные)
    expect(layers()[0].classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(html().contains('bb-entry')).toBe(false);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(early()?.adopted).toBe(true);
  });

  it('смена темы: setColors у того же глобуса', async () => {
    await inlineBuilt();
    await capture();
    await mount();
    document.body.style.backgroundColor = 'rgb(229, 231, 235)';
    document.body.style.color = 'rgb(17, 24, 39)';
    document.documentElement.className = 'light';
    await act(settle);
    expect(instances[0].setColors).toHaveBeenCalledWith({
      dot: 'rgb(17, 24, 39)',
      ring: 'rgba(17, 24, 39, 0.85)',
      rain: 'rgba(17, 24, 39, 0.6)',
      fade: 'rgb(229, 231, 235)',
    });
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(early()?.adopted).toBe(true);
  });

  it('уход со страницы: спрятан до кадра, destroy и удаление через 300 мс', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    await capture();
    const { unmount } = await mount();
    unmount();
    await act(settle);
    expect(layers()[0].classList.contains('bb-globe-layer--parked')).toBe(true);
    expect(instances[0].destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('StrictMode: один слой, ранний глобус жив', async () => {
    await inlineBuilt();
    await capture();
    await mount((G) => (
      <StrictMode>
        <G />
      </StrictMode>
    ));
    vi.advanceTimersByTime(1000);
    expect(layers()).toHaveLength(1);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instances[0].destroy).not.toHaveBeenCalled();
    expect(early()?.adopted).toBe(true);
  });

  it('скелетон «Главной» во время входа держит ранний слой, но ожидание не снимает; её содержимое — снимает', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    await capture();
    const view = await mount((G) => <G keepOnly />);
    expect(layers()).toHaveLength(1);
    expect(early()?.adopted).toBe(true);
    expect(html().contains('bb-entry')).toBe(true);
    // скелетон забрал слой: глобус не стоит (resume), он и есть загрузка
    expect(instances[0].resume).toHaveBeenCalled();
    const G = view.CabinetGlobe as Globe;
    view.rerender(<G />);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
    expect(layers()).toHaveLength(1);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('предел входа при скелетоне: слой забран — остаётся на экране и вращается', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    await capture();
    await mount((G) => <G keepOnly />);
    vi.advanceTimersByTime(ENTRY_CAP);
    expect(html().contains('bb-entry')).toBe(false);
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
  });

  it('скелетон «Главной» после входа (keepOnly) держит ранний слой', async () => {
    await inlineBuilt();
    act(() => instances[0].options.onReady());
    await capture();
    vi.advanceTimersByTime(ENTRY_CAP);
    await mount((G) => <G keepOnly />);
    expect(layers()).toHaveLength(1);
    expect(early()?.adopted).toBe(true);
    expect(document.body.classList.contains('bb-globe-on')).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('данные раннего не загрузились: не берётся, глобуса нет (как сегодня), ожидание снято', async () => {
    await inlineBuilt();
    await capture();
    instances[0].fail();
    await mount();
    expect(layers()).toHaveLength(0);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('ранний брошен (никто не взял): CabinetGlobe строит свой, как сегодня', async () => {
    await inlineBuilt();
    await capture();
    const { dropEarlyLayer } = await import('./earlyGlobe');
    dropEarlyLayer();
    expect(layers()).toHaveLength(0);
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    await mount();
    expect(ctor).toHaveBeenCalledTimes(2);
    expect(layers()).toHaveLength(1);
  });
});
