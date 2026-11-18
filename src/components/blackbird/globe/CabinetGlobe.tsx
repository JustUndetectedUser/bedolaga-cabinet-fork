import { useEffect, useRef, useState } from 'react';

import type { BBGlobeInstance, GlobeColors } from './bbGlobe';
import { globeColors } from './globeColors';
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

function createLayer(g: LoadedGlobe): Layer | null {
  const el = document.createElement('div');
  el.className = 'bb-globe-layer';
  // Украшение: модуль и с labels: false строит список стран для экранного
  // диктора — здесь он лишний.
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const phone = window.innerWidth < PHONE_BELOW;
  let colors = globeColors(isDark(), document.body);
  const layer: Layer = {
    el,
    globe: null as unknown as BBGlobeInstance,
    ready: false,
    dead: false,
    users: 0,
    readyCbs: new Set(),
    timer: undefined,
    stop: () => {},
  };
  try {
    layer.globe = new g.BBGlobe(el, {
      dataUrl: g.dataUrl,
      servers: g.servers,
      spin: 5,
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
      focusX: (w, h) => g.cabinetView(w, h).focusX,
      focusY: (w, h) => g.cabinetView(w, h).focusY,
      zoom: (w, h) => g.cabinetView(w, h).zoom,
      onReady: () => {
        layer.ready = true;
        el.classList.add('is-ready');
        if (layer.users > 0) document.body.classList.add('bb-globe-on');
        for (const cb of layer.readyCbs) cb();
      },
    });
  } catch {
    el.remove();
    return null;
  }

  // Данные не загрузились: модуль сам себя уничтожил (failed) и очистил корень.
  // Пустой слой убираем целиком: без него страница ровно как без глобуса.
  const failObserver = new MutationObserver(() => {
    if (!layer.globe.failed) return;
    broken = true;
    destroyLayer(layer);
  });
  failObserver.observe(el, { childList: true });

  // Тема: класс light/dark на <html>, палитра оператора — переменные в его style.
  const themeObserver = new MutationObserver(() => {
    const next = globeColors(isDark(), document.body);
    if (sameColors(next, colors)) return;
    colors = next;
    layer.globe.setColors(next);
  });
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
  shared ??= createLayer(g);
  const layer = shared;
  if (!layer) return null;
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
    // Страница ушла: спрятать сразу (на других страницах глобуса нет), убрать
    // чуть позже — если это был вход, «Главная» заберёт слой раньше.
    layer.el.classList.add('bb-globe-layer--parked');
    document.body.classList.remove('bb-globe-on');
    layer.timer = setTimeout(() => destroyLayer(layer), HANDOVER_MS);
  };
}

/**
 * BlackBird: глобус фоном «Главной» и экрана входа (макет D2). Сам в дереве
 * ничего не рисует: слой .bb-globe-layer живёт в body под содержимым. Без
 * VITE_GLOBE_BASE и при любом сбое (config.json, модуль, данные, конструктор)
 * глобуса нет — страница как без него. onReady — после первого кадра глобуса
 * (сразу, если он уже нарисован).
 */
export function CabinetGlobe({ onReady }: { onReady?: () => void }): null {
  const [globe, setGlobe] = useState<LoadedGlobe | null>(() => known);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    if (globe) return;
    let alive = true;
    loadGlobe().then((g) => {
      if (!g) return;
      known = g;
      if (alive) setGlobe(g);
    });
    return () => {
      alive = false;
    };
  }, [globe]);

  useEffect(() => {
    if (!globe) return;
    const release = acquire(globe, () => onReadyRef.current?.());
    return release ?? undefined;
  }, [globe]);

  return null;
}
