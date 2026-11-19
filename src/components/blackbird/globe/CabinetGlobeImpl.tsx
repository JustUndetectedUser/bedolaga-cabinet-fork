import { useEffect, useRef, useState } from 'react';

import { useBlockingStore } from '../../../store/blocking';
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
  // BlackBird: из них «громкие» (не quiet: «Главная», вход); нет ни одной — слой приглушён
  loud: number;
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

/**
 * BlackBird: body.bb-globe-quiet — у слоя только рабочие страницы (quiet), он
 * приглушён (blackbird.css); есть «Главная» или вход — в полную силу.
 */
function syncQuiet(layer: Layer) {
  document.body.classList.toggle(
    'bb-globe-quiet',
    layer.ready && !layer.dead && layer.users > 0 && layer.loud === 0,
  );
}

/** Первый кадр глобуса: слой проявляется, страницы узнают. */
function markReady(layer: Layer) {
  layer.ready = true;
  // Вход с лендинга: #root ещё скрыт, глобус лендинга только что стоял на
  // этом месте — появиться сразу, без проявления.
  if (landingEntryPending()) layer.el.classList.add('bb-globe-layer--instant');
  layer.el.classList.add('is-ready');
  if (layer.users > 0) document.body.classList.add('bb-globe-on');
  syncQuiet(layer);
  for (const cb of layer.readyCbs) cb();
}

/** Обвязка слоя: сбой данных, смена темы, свёрнутый Mini App, экран блокировки. */
function wrapLayer(el: HTMLDivElement, globe: BBGlobeInstance, built: GlobeColors): Layer {
  let colors = built;
  const layer: Layer = {
    el,
    globe,
    ready: false,
    dead: false,
    users: 0,
    loud: 0,
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
  // размер не меняется — без перерасчёта, по возвращении вращение идёт дальше
  // с того места, где стояло. Так же — пока есть экран блокировки (обслуживание,
  // бэкенд недоступен, подписка на канал, бан, удалённый аккаунт): BlockingOverlay
  // (App.tsx) закрывает всё непрозрачным слоем, а вход или «Главная» под ним
  // держат глобус, и перекрытия IntersectionObserver не видит.
  const tg = window.Telegram?.WebApp;
  let inactive = false;
  let blocked = useBlockingStore.getState().blockingType !== null;
  const sync = () => el.classList.toggle('bb-globe-layer--paused', inactive || blocked);
  const pause = () => {
    inactive = true;
    sync();
  };
  const resume = () => {
    inactive = false;
    sync();
  };
  tg?.onEvent?.('deactivated', pause);
  tg?.onEvent?.('activated', resume);
  const unblock = useBlockingStore.subscribe((state) => {
    blocked = state.blockingType !== null;
    sync();
  });
  sync();

  layer.stop = () => {
    failObserver.disconnect();
    themeObserver.disconnect();
    tg?.offEvent?.('deactivated', pause);
    tg?.offEvent?.('activated', resume);
    unblock();
  };
  return layer;
}

function destroyLayer(layer: Layer) {
  if (layer.dead) return;
  layer.dead = true;
  clearTimeout(layer.timer);
  // Класс на body — у слоя, который сейчас в документе: слой, уже вынутый из
  // него (страница пересобрана, тесты с новым экземпляром модуля), чужой класс
  // не трогает.
  const owned = shared === layer && layer.el.isConnected;
  if (shared === layer) shared = null;
  if (owned) document.body.classList.remove('bb-globe-on', 'bb-globe-quiet');
  layer.stop();
  try {
    layer.globe.destroy();
  } catch {
    // уже уничтожен (данные не загрузились) — убирать нечего
  }
  layer.el.remove();
}

/** Взять слой (создать при первом); вернуть — отпустить. quiet — рабочая страница (приглушённый фон). */
function acquire(g: LoadedGlobe, onReady: () => void, quiet = false): (() => void) | null {
  if (broken) return null;
  // ранний слой (вход с лендинга) — если он есть; иначе новый
  shared ??= adoptEarly() ?? (broken ? null : createLayer(g));
  return shared ? take(shared, onReady, quiet) : null;
}

/**
 * Удержать слой, если он уже есть (скелетон «Главной»; ранний слой входа с
 * лендинга, пока loadGlobe ещё не ответил): новый не создаётся.
 */
function keep(onReady: () => void, quiet = false): (() => void) | null {
  if (!shared && !broken) shared = adoptEarly();
  return shared && !shared.dead ? take(shared, onReady, quiet) : null;
}

function take(layer: Layer, onReady: () => void, quiet = false): () => void {
  clearTimeout(layer.timer);
  layer.timer = undefined;
  layer.users += 1;
  if (!quiet) layer.loud += 1;
  layer.el.classList.remove('bb-globe-layer--parked');
  layer.readyCbs.add(onReady);
  syncQuiet(layer);
  if (layer.ready) {
    document.body.classList.add('bb-globe-on');
    onReady();
  }
  return () => {
    layer.readyCbs.delete(onReady);
    layer.users -= 1;
    if (!quiet) layer.loud -= 1;
    syncQuiet(layer);
    if (layer.users > 0 || layer.dead) return;
    // Страница ушла. Следующая страница того же перехода берёт слой в тех же
    // эффектах React (вход → скелетон «Главной» → её содержимое): поэтому
    // спрятать — микрозадачей, ещё до отрисовки, и только если слой так никто
    // и не взял (на других страницах глобуса нет). Убрать — чуть позже: страница
    // с глобусом после короткой паузы (загрузчик) заберёт его раньше.
    queueMicrotask(() => {
      if (layer.users > 0 || layer.dead || !layer.el.isConnected) return;
      layer.el.classList.add('bb-globe-layer--parked');
      document.body.classList.remove('bb-globe-on', 'bb-globe-quiet');
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
 * есть (пришли со входа — глобус стоит, пока грузятся данные; вход с лендинга —
 * слой построил инлайн-скрипт index.html), и ничего не грузит и не создаёт
 * (холодная загрузка — глобус после содержимого, как без keepOnly на самом
 * содержимом).
 *
 * Вход с лендинга (landingEntry.ts): #root скрыт, на экране глобус как
 * загрузка, пока страница не готова. Готова — это страница без keepOnly и без
 * busy, у которой глобус нарисован: тогда ожидание снимается
 * (releaseLandingEntry) и содержимое проявляется уже с данными. Скелетон
 * (keepOnly) и страница, которая ещё грузит данные (busy: полная «Главная»,
 * у неё скелетон внутри), слой держат, но ожидание не снимают. Слой, который
 * построил инлайн-скрипт index.html (earlyGlobe.ts), забирается как есть: тот
 * же холст, без второй загрузки.
 *
 * quiet (BlackBird, 19.11) — фон рабочей страницы (все клиентские страницы,
 * кроме «Главной» и входа; ставит ProtectedRoute): тот же слой, то же место и
 * масштаб, но приглушённый (body.bb-globe-quiet, пока громких страниц нет), и
 * готовностью для входа с лендинга не считается.
 */
export function CabinetGlobe({
  onReady,
  keepOnly = false,
  busy = false,
  quiet = false,
}: {
  onReady?: () => void;
  keepOnly?: boolean;
  busy?: boolean;
  quiet?: boolean;
}): null {
  const [globe, setGlobe] = useState<LoadedGlobe | null>(() => known);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  // Один раз на страницу: слой берётся заново, когда приходит loadGlobe (ранний
  // слой входа с лендинга сначала просто удерживается) или в StrictMode.
  const readyFired = useRef(false);
  // Глобус этой страницы нарисован (для входа с лендинга: ждём ещё готовность страницы).
  const [drawn, setDrawn] = useState(false);

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
      setDrawn(true);
      if (readyFired.current) return;
      readyFired.current = true;
      onReadyRef.current?.();
    };
    const release = keepOnly || !globe ? keep(ready, quiet) : acquire(globe, ready, quiet);
    return release ?? undefined;
  }, [globe, keepOnly, quiet]);

  // Вход с лендинга: страница готова (не скелетон, данные есть) и глобус
  // нарисован — содержимое проявляется.
  const done = drawn && !keepOnly && !busy && !quiet;
  useEffect(() => {
    if (done) releaseLandingEntry();
  }, [done]);

  return null;
}
