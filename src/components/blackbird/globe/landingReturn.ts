import type { BBGlobeInstance } from './bbGlobe';

/**
 * BlackBird: возврат на лендинг с глобусом (спецификация 18.11, выкатка 3).
 * Логотип на «Главной» в браузере (useLogoClick): если глобус на экране —
 * интерфейс кабинета гаснет за LEAVE_MS (html.bb-leaving, blackbird.css: #root
 * прозрачен, на телефоне глобус в полную яркость, на ПК сверху полоса 72 px
 * цвета фона — у лендинга глобус начинается под шапкой), глобус остаётся и
 * вращается, а переход на лендинг начинается сразу, с меткой:
 * &from=cabinet&lon=<долгота вида, −180…180, 2 знака>&t=<Date.now() клика>
 * &pose=<x>,<y>,<R>,<lat> (центр и радиус глобуса в px окна, 1 знак; широта
 * вида, 2 знака). Лендинг (assets/return.js и init.js роли landing) открывается
 * с глобусом на том же месте, тот садится на место лендинга, потом появляется
 * страница.
 *
 * Без метки (глобуса нет на экране, не нарисован, рабочая страница, экран
 * блокировки, старый модуль без вида) и при «уменьшить движение» — обычный
 * переход, только с темой (как до выкатки 3).
 *
 * Переход встал (сеть, лендинг не отвечает): Esc сразу, а касание, нажатие или
 * колесо — через STUCK_MS после клика (до того глобус на экране — «загрузка»)
 * возвращают кабинет; «Назад» из кэша страниц — тоже.
 *
 * Модуль маленький и в стартовом бандле (его зовёт шапка): CabinetGlobeImpl и
 * loadGlobe отсюда не импортируются, слой регистрирует сам CabinetGlobeImpl
 * (setReturnLayer).
 */

/** Слой глобуса кабинета для метки: глобус, его корень и «виден ли он сейчас как фон «Главной»». */
export interface ReturnLayer {
  globe: BBGlobeInstance;
  el: HTMLElement;
  /** нарисован, не уничтожен, есть громкая страница («Главная», вход), не за экраном */
  shown: () => boolean;
}

/** Угасание интерфейса (blackbird.css, html.bb-leaving #root). */
export const LEAVE_MS = 300;
/** Раньше этого нажатие на погасший кабинет его не возвращает: глобус на экране — загрузка (как у лендинга). */
export const STUCK_MS = 2500;

let current: ReturnLayer | null = null;
let stopLeaving: (() => void) | null = null;

/** Слой, который сейчас в документе (CabinetGlobeImpl: обвязан — свой, удалён — null). */
export function setReturnLayer(layer: ReturnLayer | null): void {
  current = layer;
}

const fixed = (n: number, d: number) => (Object.is(Math.round(n * 10 ** d), -0) ? 0 : n).toFixed(d);

/**
 * Метка возврата для глобуса на экране в момент now (Date.now()), или '' —
 * глобуса нет, он не виден как фон «Главной», вида нет или число не конечное.
 */
export function returnMark(now: number): string {
  const layer = current;
  if (!layer?.shown()) return '';
  const g = layer.globe as BBGlobeInstance & {
    cx?: number;
    cy?: number;
    view?: { lon: number; lat: number; R: number } | null;
  };
  const v = g.view;
  if (!v || typeof g.cx !== 'number' || typeof g.cy !== 'number') return '';
  const box = layer.el.getBoundingClientRect();
  const x = box.left + g.cx;
  const y = box.top + g.cy;
  const lon = (((v.lon % 360) + 540) % 360) - 180;
  if (![x, y, v.R, v.lat, lon, now].every(Number.isFinite) || !(v.R > 0)) return '';
  return `&from=cabinet&lon=${fixed(lon, 2)}&t=${Math.round(now)}&pose=${[x, y, v.R].map((n) => fixed(n, 1)).join(',')},${fixed(v.lat, 2)}`;
}

function reducedMotion(win: Window): boolean {
  try {
    return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Уйти на лендинг по href (адрес уже с темой): с глобусом на экране и без
 * «уменьшить движение» — интерфейс гаснет, адрес с меткой возврата; иначе —
 * обычный переход.
 */
export function leaveForLanding(href: string, win: Window = window): void {
  const mark = reducedMotion(win) ? '' : returnMark(Date.now());
  if (!mark) {
    win.location.assign(href);
    return;
  }
  stopLeaving?.();
  const doc = win.document;
  const html = doc.documentElement;
  const left = Date.now();
  html.classList.add('bb-leaving');
  const INPUT = ['pointerdown', 'touchstart', 'wheel'] as const;
  const back = () => {
    html.classList.remove('bb-leaving');
    stop();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') back();
  };
  const onInput = () => {
    if (Date.now() - left >= STUCK_MS) back();
  };
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) back();
  };
  const stop = () => {
    doc.removeEventListener('keydown', onKey);
    for (const type of INPUT) doc.removeEventListener(type, onInput);
    win.removeEventListener('pageshow', onShow);
    if (stopLeaving === stop) stopLeaving = null;
  };
  doc.addEventListener('keydown', onKey);
  for (const type of INPUT) doc.addEventListener(type, onInput, { passive: true });
  win.addEventListener('pageshow', onShow);
  stopLeaving = stop;
  win.location.assign(href + mark);
}
