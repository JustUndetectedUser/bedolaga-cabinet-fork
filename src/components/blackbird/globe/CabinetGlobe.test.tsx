// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Слой глобуса на «Главной» и экране входа. Модуль подменён: проверяется
 * обёртка. loadGlobe → null — ничего; успех — один .bb-globe-layer прямо в
 * body (декоративный, aria-hidden) и BBGlobe с опциями кабинета; телефон —
 * 30 кадров/с и порог проверки 28, ПК — без предела и 55; смена темы —
 * setColors без второго глобуса; уход со страницы — destroy (после короткой
 * паузы: вход → «Главная» передаёт тот же глобус без рывка, и скелетон
 * «Главной» держит его, пока грузятся данные, сам глобус не создавая);
 * StrictMode — один слой; Telegram «deactivated» — глобус уезжает за экран
 * (модуль не рисует вне экрана).
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
  /** как модуль, когда globe-data.json не загрузился: failed и пустой корень */
  fail: () => void;
}[] = [];
const ctor = vi.fn();

class FakeGlobe {
  setColors = vi.fn();
  destroy = vi.fn();
  still = false;
  failed = false;
  constructor(root: HTMLElement, options: Options) {
    ctor(root, options);
    root.appendChild(document.createElement('canvas'));
    const fail = () => {
      this.failed = true;
      root.replaceChildren();
    };
    instances.push({ root, options, setColors: this.setColors, destroy: this.destroy, fail });
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

type Globe = React.ComponentType<{ onReady?: () => void; keepOnly?: boolean }>;

async function mount(ui?: (G: Globe) => React.ReactElement) {
  const { CabinetGlobe } = await import('./CabinetGlobe');
  const view = render(ui ? ui(CabinetGlobe) : <CabinetGlobe />);
  // loadGlobe — промис: даём ему разрешиться и React — отрисовать
  await act(async () => {});
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
    await act(async () => {});
    expect(instances[0].setColors).toHaveBeenCalledWith({
      dot: 'rgb(17, 24, 39)',
      ring: 'rgba(17, 24, 39, 0.85)',
      rain: 'rgba(17, 24, 39, 0.6)',
      fade: 'rgb(229, 231, 235)',
    });
    expect(ctor).toHaveBeenCalledTimes(1);
    // атрибут поменялся, а цвета те же — повторно не перекрашивает
    document.documentElement.setAttribute('style', '--x: 1');
    await act(async () => {});
    expect(instances[0].setColors).toHaveBeenCalledTimes(1);
  });

  it('размонтирование: слой прячется до следующего кадра, destroy и удаление после паузы', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { unmount } = await mount();
    act(() => instances[0].options.onReady());
    unmount();
    // микрозадача: раньше отрисовки, но после эффектов страницы, которая может забрать слой
    await act(async () => {});
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
    await act(async () => {});
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
    await act(async () => {});
    vi.advanceTimersByTime(250);
    rerender(<CabinetGlobe key="home" />);
    await act(async () => {});
    vi.advanceTimersByTime(1000);
    await act(async () => {});
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
    await act(async () => {});
    expect(loadGlobeMock).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
  });

  it('скелетон держит уже спрятанный слой (страница без глобуса между ними, меньше 300 мс)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender, CabinetGlobe } = await mount((G) => <G key="a" />);
    act(() => instances[0].options.onReady());
    rerender(<div key="loader" />);
    await act(async () => {});
    expect(layers()[0].classList.contains('bb-globe-layer--parked')).toBe(true);
    vi.advanceTimersByTime(200);
    rerender(<CabinetGlobe key="b" keepOnly />);
    await act(async () => {});
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
    expect(captureLandingEntry(window)).toBe('dark');
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
    act(() => instances[0].options.onReady());
    expect(layer.classList.contains('bb-globe-layer--instant')).toBe(true);
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

  it('опоздал (позже 600 мс): #root уже виден, глобус проявляется как обычно', async () => {
    await capture();
    await mount();
    vi.advanceTimersByTime(600);
    expect(html().contains('bb-entry')).toBe(false);
    act(() => instances[0].options.onReady());
    expect(layers()[0].classList.contains('bb-globe-layer--instant')).toBe(false);
    expect(layers()[0].classList.contains('is-ready')).toBe(true);
  });

  it('скелетон «Главной» во время входа создаёт глобус сам: ожидание не зависит от API', async () => {
    await capture();
    await mount((G) => <G keepOnly />);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(1);
  });

  it('скелетон после входа (ожидание снято) — снова только держит', async () => {
    await capture();
    vi.advanceTimersByTime(600);
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
