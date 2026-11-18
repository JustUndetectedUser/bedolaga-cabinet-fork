import { useEffect, useRef, useState } from 'react';

import type { BBGlobeInstance, GlobeColors } from './bbGlobe';
import { claimEarlyLayer } from './earlyGlobe';
import { globeColors } from './globeColors';
import { landingEntryPending, landingSpinFrom, releaseLandingEntry } from './landingEntry';
import { type LoadedGlobe, loadGlobe } from './loadGlobe';

/** Окно меньше 1024 px по ширине — телефонный вид: не больше 30 кадров/с (cabinetView меняет вид там же). */
const PHONE_BELOW = 1024;
/** Сколько ушедшая страница держит глобус для следующей («Вход» → «Главная»). */
const HANDOVER_MS = 300;

interface Layer {
  el: HTMLDivElement;
  globe: BBGlobeInstance;
  ready: boolean;
  dead: boolean;
  users: number;
  readyCbs: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  stop: () => void;
}

// Один слой на страницу, не React-портал: после входа «Главная» монтирует свой
// CabinetGlobe, а глобус стоит на месте без рывка — тот же холст, а не новый,
// который бы заново грузил данные и проявлялся.
let shared: Layer | null = null;
// Разрешённый loadGlobe: следующая страница берёт слой в том же коммите, в
// котором предыдущая его отпускает (без кадра без глобуса).
let known: LoadedGlobe | null = null;
// Данные глобуса не загрузились: до перезагрузки страницы глобуса нет.
let broken = false;

const isDark = () => !document.documentElement.classList.contains('light');
const sameColors = (a: GlobeColors, b: GlobeColors) =>
  a.dot === b.dot && a.ring === b.ring && a.rain === b.rain && a.fade === b.fade;

/**
 * Глобус кабинета (параметры повторяет инлайн-скрипт index.html для входа с
 * лендинга: менять вместе, их равенство проверяет CabinetGlobeImpl.test.tsx).
 */
function createLayer(g: LoadedGlobe): Layer | null {
  const el = document.createElement('div');
  el.className = 'bb-globe-layer';
  // Украшение: модуль и с labels: false строит список стран для экранного
  // диктора — здесь он лишний.
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const phone = window.innerWidth < PHONE_BELOW;
  const colors = globeColors(isDark(), document.body);
  const view = (k: 'focusX' | 'focusY' | 'zoom') => (w: number, h: number) =>
    g.cabinetView(w, h)[k];
  let layer: Layer | null = null;
  try {
    const globe = new g.BBGlobe(el, {
      dataUrl: g.dataUrl,
      servers: g.servers,
      spin: 5,
      // Пришли с лендинга: вращение дальше с его долготы (иначе — от часов).
      spinFrom: landingSpinFrom(),
      tilt: 30,
      labels: false,
      nav: 'none',
      maxFps: phone ? 30 : 0,
      // Вращение — только если устройство держит частоту: с пределом 30 кадров/с
      // порог 28, без предела (ПК) — 55; иначе один неподвижный кадр.
      spinGate: { frames: 30, medianMs: 8, minFps: phone ? 28 : 55, recheckMs: 5000 },
      colors,
      // Размер — по коробке самого слоя (fixed, inset: 0): те же числа, что
      // лендинг берёт из clientWidth/clientHeight для перелёта.
      focusX: view('focusX'),
      focusY: view('focusY'),
      zoom: view('zoom'),
      // первый кадр приходит не раньше данных — слой к тому времени обвязан
      onReady: () => {
        if (layer) markReady(layer);
      },
    });
    layer = wrapLayer(el, globe, colors);
  } catch {
    el.remove();
    releaseLandingEntry();
    return null;
  }
  return layer;
}

/**
 * Слой, который инлайн-скрипт index.html построил до страницы (вход с лендинга):
 * тот же холст, без второй загрузки. Не загрузил данные — как сегодня: глобуса
 * нет до перезагрузки.
 */
function adoptEarly(): Layer | null {
  const early = claimEarlyLayer();
  if (!early) return null;
  if (early.globe.failed) {
    broken = true;
    early.el.remove();
    releaseLandingEntry();
    return null;
  }
  const layer = wrapLayer(early.el, early.globe, early.colors);
  // is-ready (и «сразу, без проявления») он ставит себе сам; погашенный на конце
  // входа (страница опоздала) проявляется снова
  layer.ready = early.ready;
  if (early.ready) early.el.classList.add('is-ready');
  early.onReady = () => markReady(layer);
  // построен с hold: страница на месте — вращение дальше, с того места, где стоял
  early.globe.resume?.();
  return layer;
}

/** Первый кадр глобуса: слой проявляется, страницы узнают. */
function markReady(layer: Layer) {
  layer.ready = true;
  // Вход с лендинга: #root ещё скрыт, глобус лендинга только что стоял на
  // этом месте — появиться сразу, без проявления.
  if (landingEntryPending()) layer.el.classList.add('bb-globe-layer--instant');
  layer.el.classList.add('is-ready');
  if (layer.users > 0) document.body.classList.add('bb-globe-on');
  for (const cb of layer.readyCbs) cb();
}

/** Обвязка слоя: сбой данных, смена темы, свёрнутый Mini App. */
function wrapLayer(el: HTMLDivElement, globe: BBGlobeInstance, built: GlobeColors): Layer {
  let colors = built;
  const layer: Layer = {
    el,
    globe,
    ready: false,
    dead: false,
    users: 0,
    readyCbs: new Set(),
    timer: undefined,
    stop: () => {},
  };

  // Данные не загрузились: модуль сам себя уничтожил (failed) и очистил корень.
  // Пустой слой убираем целиком: без него страница ровно как без глобуса.
  const failObserver = new MutationObserver(() => {
    if (!layer.globe.failed) return;
    broken = true;
    destroyLayer(layer);
    releaseLandingEntry();
  });
  failObserver.observe(el, { childList: true });

  // Тема: класс light/dark на <html>, палитра оператора — переменные в его style.
  // Сразу — тоже: ранний слой построен до страницы, тема с тех пор могла смениться.
  const recolor = () => {
    const next = globeColors(isDark(), document.body);
    if (sameColors(next, colors)) return;
    colors = next;
    layer.globe.setColors(next);
  };
  recolor();
  const themeObserver = new MutationObserver(recolor);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  // Свёрнутый Mini App: вкладка может остаться «видимой», а кадры идти. Модуль
  // не рисует вне экрана (IntersectionObserver), поэтому слой уезжает за экран;
  // размер не меняется — без перерасчёта, по возвращении вращение догоняет.
  const tg = window.Telegram?.WebApp;
  const pause = () => el.classList.add('bb-globe-layer--paused');
  const resume = () => el.classList.remove('bb-globe-layer--paused');
  tg?.onEvent?.('deactivated', pause);
  tg?.onEvent?.('activated', resume);

  layer.stop = () => {
    failObserver.disconnect();
    themeObserver.disconnect();
    tg?.offEvent?.('deactivated', pause);
    tg?.offEvent?.('activated', resume);
  };
  return layer;
}

function destroyLayer(layer: Layer) {
  if (layer.dead) return;
  layer.dead = true;
  clearTimeout(layer.timer);
  if (shared === layer) shared = null;
  document.body.classList.remove('bb-globe-on');
  layer.stop();
  try {
    layer.globe.destroy();
  } catch {
    // уже уничтожен (данные не загрузились) — убирать нечего
  }
  layer.el.remove();
}

/** Взять слой (создать при первом); вернуть — отпустить. */
function acquire(g: LoadedGlobe, onReady: () => void): (() => void) | null {
  if (broken) return null;
  // ранний слой (вход с лендинга) — если он есть; иначе новый
  shared ??= adoptEarly() ?? (broken ? null : createLayer(g));
  return shared ? take(shared, onReady) : null;
}

/**
 * Удержать слой, если он уже есть (скелетон «Главной»; ранний слой входа с
 * лендинга, пока loadGlobe ещё не ответил): новый не создаётся.
 */
function keep(onReady: () => void): (() => void) | null {
  if (!shared && !broken) shared = adoptEarly();
  return shared && !shared.dead ? take(shared, onReady) : null;
}

function take(layer: Layer, onReady: () => void): () => void {
  clearTimeout(layer.timer);
  layer.timer = undefined;
  layer.users += 1;
  layer.el.classList.remove('bb-globe-layer--parked');
  layer.readyCbs.add(onReady);
  if (layer.ready) {
    document.body.classList.add('bb-globe-on');
    onReady();
  }
  return () => {
    layer.readyCbs.delete(onReady);
    layer.users -= 1;
    if (layer.users > 0 || layer.dead) return;
    // Страница ушла. Следующая страница того же перехода берёт слой в тех же
    // эффектах React (вход → скелетон «Главной» → её содержимое): поэтому
    // спрятать — микрозадачей, ещё до отрисовки, и только если слой так никто
    // и не взял (на других страницах глобуса нет). Убрать — чуть позже: страница
    // с глобусом после короткой паузы (загрузчик) заберёт его раньше.
    queueMicrotask(() => {
      if (layer.users > 0 || layer.dead) return;
      layer.el.classList.add('bb-globe-layer--parked');
      document.body.classList.remove('bb-globe-on');
    });
    layer.timer = setTimeout(() => destroyLayer(layer), HANDOVER_MS);
  };
}

/**
 * BlackBird: глобус фоном «Главной» и экрана входа (макет D2). Сам в дереве
 * ничего не рисует: слой .bb-globe-layer живёт в body под содержимым. Без
 * VITE_GLOBE_BASE и при любом сбое (config.json, модуль, данные, конструктор)
 * глобуса нет — страница как без него. onReady — один раз, после первого кадра
 * глобуса (сразу, если он уже нарисован).
 *
 * keepOnly — для скелетона «Главной»: только удерживает слой, который уже
 * есть (пришли со входа — глобус стоит, пока грузятся данные), и ничего не
 * грузит и не создаёт (холодная загрузка — глобус после содержимого, как без
 * keepOnly на самом содержимом). Кроме входа с лендинга (landingEntry.ts): там
 * #root скрыт, пока глобус не нарисован, и скелетон строит его сам, не дожидаясь
 * ответа API.
 *
 * Первый кадр глобуса снимает ожидание входа с лендинга (releaseLandingEntry).
 * Слой, который на входе с лендинга построил до страницы инлайн-скрипт index.html
 * (earlyGlobe.ts), забирается как есть: тот же холст, без второй загрузки.
 */
export function CabinetGlobe({
  onReady,
  keepOnly: keepOnlyProp = false,
}: {
  onReady?: () => void;
  keepOnly?: boolean;
}): null {
  const [entry] = useState(landingEntryPending);
  const keepOnly = keepOnlyProp && !entry;
  const [globe, setGlobe] = useState<LoadedGlobe | null>(() => known);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  // Один раз на страницу: слой берётся заново, когда приходит loadGlobe (ранний
  // слой входа с лендинга сначала просто удерживается) или в StrictMode.
  const readyFired = useRef(false);

  useEffect(() => {
    if (globe || keepOnly) return;
    let alive = true;
    loadGlobe().then((g) => {
      if (!g) return;
      known = g;
      if (alive) setGlobe(g);
    });
    return () => {
      alive = false;
    };
  }, [globe, keepOnly]);

  useEffect(() => {
    const ready = () => {
      releaseLandingEntry();
      if (readyFired.current) return;
      readyFired.current = true;
      onReadyRef.current?.();
    };
    const release = keepOnly || !globe ? keep(ready) : acquire(globe, ready);
    return release ?? undefined;
  }, [globe, keepOnly]);

  return null;
}
