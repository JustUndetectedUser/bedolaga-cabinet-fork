// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BBGlobeInstance } from './bbGlobe';

/**
 * BlackBird: возврат на лендинг (решение владельца, спецификация 18.11, выкатка 3).
 * Логотип на «Главной» в браузере: интерфейс кабинета гаснет (html.bb-leaving,
 * blackbird.css), глобус остаётся и вращается, переход на лендинг — сразу, с
 * меткой &from=cabinet&lon=&t=&pose=x,y,R,lat (лендинг: assets/return.js роли
 * landing). Переход встал — Esc, а после STUCK_MS касание, нажатие или колесо
 * возвращают кабинет; «Назад» из кэша страниц — тоже.
 */

const NOW = 1_700_000_000_000;
let now = NOW;
let reduce = false;
const assign = vi.fn();

beforeEach(() => {
  vi.resetModules();
  now = NOW;
  reduce = false;
  assign.mockReset();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('location', { ...window.location, assign });
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion: reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.body.innerHTML = '';
});

const mod = () => import('./landingReturn');

/** Слой глобуса: коробка в окне и глобус (центр в корне, вид). */
function layerAt(
  box: { left: number; top: number },
  g: { cx?: number; cy?: number; view?: { lon: number; lat: number; R: number } | null },
  shown = () => true,
) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left: box.left,
      top: box.top,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  const globe = { still: false, setColors() {}, destroy() {}, ...g } as unknown as BBGlobeInstance;
  return { el, globe, shown };
}

const AT_HOME = { cx: 960, cy: 361.94, view: { lon: 370.123, lat: 30, R: 580 } };
const MARK = '&from=cabinet&lon=10.12&t=1700000000000&pose=960.0,361.9,580.0,30.00';

describe('returnMark', () => {
  it("the pose of the layer's globe in the window, lon wrapped, numbers fixed", async () => {
    const { setReturnLayer, returnMark } = await mod();
    setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME));
    expect(returnMark(NOW)).toBe(MARK);
    // слой не в начале окна: поза в окне
    setReturnLayer(
      layerAt({ left: 10, top: -5 }, { ...AT_HOME, view: { lon: -190, lat: -12.345, R: 400 } }),
    );
    expect(returnMark(NOW)).toBe(
      '&from=cabinet&lon=170.00&t=1700000000000&pose=970.0,356.9,400.0,-12.35',
    );
  });

  it('the globe stood still (its device check stopped the spin): &still=1, the landing does not turn it either', async () => {
    const { setReturnLayer, returnMark } = await mod();
    setReturnLayer(layerAt({ left: 0, top: 0 }, { ...AT_HOME, still: true } as never));
    expect(returnMark(NOW)).toBe(`${MARK}&still=1`);
  });

  it('empty without a layer, not shown (quiet, not ready, paused), without view, with NaN', async () => {
    const { setReturnLayer, returnMark } = await mod();
    expect(returnMark(NOW)).toBe('');
    setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME, () => false));
    expect(returnMark(NOW)).toBe('');
    setReturnLayer(layerAt({ left: 0, top: 0 }, { cx: 1, cy: 2 }));
    expect(returnMark(NOW), 'старый модуль: вида нет').toBe('');
    setReturnLayer(layerAt({ left: 0, top: 0 }, { ...AT_HOME, view: null }));
    expect(returnMark(NOW)).toBe('');
    setReturnLayer(layerAt({ left: 0, top: 0 }, { ...AT_HOME, cx: Number.NaN }));
    expect(returnMark(NOW)).toBe('');
    setReturnLayer(layerAt({ left: 0, top: 0 }, { ...AT_HOME, view: { lon: 1, lat: 2, R: 0 } }));
    expect(returnMark(NOW), 'R не больше 0').toBe('');
    setReturnLayer(null);
    expect(returnMark(NOW)).toBe('');
  });
});

describe('leaveForLanding', () => {
  const HREF = 'https://landing.example/?theme=dark';
  const html = () => document.documentElement.classList;

  it('bb-leaving on <html> and assign(href + mark) at once', async () => {
    const { setReturnLayer, leaveForLanding } = await mod();
    setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME));
    leaveForLanding(HREF);
    expect(html().contains('bb-leaving')).toBe(true);
    expect(assign).toHaveBeenCalledWith(HREF + MARK);
  });

  it('reduced motion or no mark -> assign(href) as is, no class', async () => {
    let m = await mod();
    m.leaveForLanding(HREF);
    expect(assign).toHaveBeenLastCalledWith(HREF);
    expect(html().contains('bb-leaving')).toBe(false);
    reduce = true;
    vi.resetModules();
    m = await mod();
    m.setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME));
    m.leaveForLanding(HREF);
    expect(assign).toHaveBeenLastCalledWith(HREF);
    expect(html().contains('bb-leaving')).toBe(false);
  });

  it('stuck: Escape brings the cabinet back; a press before STUCK_MS does not, after it does', async () => {
    const { setReturnLayer, leaveForLanding, STUCK_MS } = await mod();
    expect(STUCK_MS).toBe(2500);
    setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME));
    leaveForLanding(HREF);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(html().contains('bb-leaving')).toBe(false);

    leaveForLanding(HREF);
    expect(html().contains('bb-leaving')).toBe(true);
    now += STUCK_MS - 1;
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('wheel'));
    expect(html().contains('bb-leaving'), 'глобус ещё «загрузка»').toBe(true);
    now += 1;
    document.dispatchEvent(new Event('touchstart'));
    expect(html().contains('bb-leaving')).toBe(false);
    // после возврата нажатия ничего не трогают
    html().add('bb-leaving');
    document.dispatchEvent(new Event('pointerdown'));
    expect(html().contains('bb-leaving')).toBe(true);
  });

  it('pageshow persisted: bb-leaving goes', async () => {
    const { setReturnLayer, leaveForLanding } = await mod();
    setReturnLayer(layerAt({ left: 0, top: 0 }, AT_HOME));
    leaveForLanding(HREF);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(html().contains('bb-leaving')).toBe(true);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(html().contains('bb-leaving')).toBe(false);
  });
});

describe('blackbird.css: уход на лендинг', () => {
  const css = readFileSync(join(import.meta.dirname, '../../../styles/blackbird.css'), 'utf-8');

  it('#root гаснет за 0,3 с и не ловит нажатий', () => {
    expect(css).toMatch(
      /html\.bb-leaving #root \{\s*opacity: 0;\s*pointer-events: none;\s*transition: opacity 0\.3s ease;\s*\}/,
    );
  });

  it('телефон: глобус в полную яркость за 0,3 с', () => {
    expect(css).toMatch(
      /@media \(max-width: 1023px\) \{\s*html\.bb-leaving \.bb-globe-layer\.is-ready \{\s*opacity: 1;\s*transition: opacity 0\.3s ease;\s*\}/,
    );
  });

  it('ПК: полоса 72 px цвета фона слоя проявляется за 0,3 с (у лендинга глобус под шапкой)', () => {
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{\s*html\.bb-leaving \.bb-globe-layer::after \{\s*content: "";\s*position: absolute;\s*top: 0;\s*left: 0;\s*right: 0;\s*height: 72px;\s*background-color: inherit;\s*animation: bb-leave-band 0\.3s ease both;\s*\}/,
    );
    expect(css).toMatch(
      /@keyframes bb-leave-band \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}/,
    );
  });
});
