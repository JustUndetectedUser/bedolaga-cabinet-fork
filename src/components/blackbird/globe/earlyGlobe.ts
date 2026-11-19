import type { BBGlobeInstance, GlobeColors, GlobeSpinGate } from './bbGlobe';

/**
 * BlackBird: глобус, который начал грузиться до бандла. При входе с лендинга в
 * тёмной теме инлайн-скрипт index.html (data-hint="landing-entry") сразу грузит
 * config.json, модуль и данные — первыми, с высоким приоритетом: здесь глобус и
 * есть загрузка (landingEntry.ts). По подсказке (config.json прошлого визита в
 * localStorage, ключ bb-globe-config-hint) модуль и данные запрашиваются, не
 * дожидаясь ответа на config.json. Слой .bb-globe-layer скрипт строит сам:
 * с точками на GPU (gpuDots() модуля; кадр дешёвый) — как только пришли файлы,
 * не дожидаясь приложения, и глобус сразу продолжает перелёт и вращение
 * лендинга; без GPU — после первой отрисовки приложения (первый узел в #root),
 * и после первого кадра глобус стоит (hold), пока его не заберёт страница.
 * Здесь — его описание и то, как его забирают:
 * loadGlobe берёт config и модуль (второго запроса нет), CabinetGlobe — сам слой
 * (тот же холст) и запускает вращение, landingEntry на конце входа гасит не
 * забранный и убирает его, если его так никто и не взял.
 */

/** Проявление слоя (blackbird.css, .bb-globe-layer: 0,6 с) и запас: погасший слой уезжает за экран после него. */
const UNCLAIMED_FADE_MS = 700;
/**
 * Глобус, построенный до приложения, работает без проверки устройства: пока
 * приложение запускается, кадры идут с опозданием, и проверка остановила бы его
 * ни за что. Она включается через столько после конца входа, когда слой у
 * страницы (содержимое проявилось за 0,4 с, запросы страницы разошлись).
 */
export const GATE_AFTER_MS = 1500;
/** Вход с лендинга кончился (settleEarlyLayer). */
let over = false;

/** Слой, построенный инлайн-скриптом. */
export interface EarlyLayer {
  el: HTMLDivElement;
  globe: BBGlobeInstance;
  /** цвета, с которыми глобус построен */
  colors: GlobeColors;
  /** первый кадр нарисован */
  ready: boolean;
  /** вызывается после первого кадра; ставит тот, кто забрал слой */
  onReady: (() => void) | null;
  /** погашен на конце входа: страница его не забрала (settleEarlyLayer) */
  faded: boolean;
  /** проверка устройства, без которой глобус построен (до приложения); null — построен с ней */
  gate?: GlobeSpinGate | null;
  /** проверка уже назначена (gateLater) */
  gated?: boolean;
}

/** Включить отложенную проверку устройства: вход кончился, слой у страницы. Один раз. */
function gateLater(early: EarlyGlobe, layer: EarlyLayer): void {
  const gate = layer.gate;
  if (!gate || layer.gated) return;
  layer.gated = true;
  setTimeout(() => {
    if (!early.dropped) layer.globe.checkDevice?.(gate);
  }, GATE_AFTER_MS);
}

export interface EarlyGlobe {
  /** VITE_GLOBE_BASE, с которой грузили */
  base: string;
  /**
   * config.json (или подсказка прошлого визита) и модуль как пришли (формат
   * модуля не проверен); null — не загрузились
   */
  load: Promise<{ config: unknown; mod: unknown } | null>;
  layer: EarlyLayer | null;
  /**
   * построить слой сейчас (всё загружено); без страницы он строится сам: с
   * точками на GPU сразу, без GPU через 250 мс после первой отрисовки приложения
   */
  build?: () => void;
  /** слой забрал CabinetGlobe */
  adopted: boolean;
  /** слой брошен: его никто не взял (landingEntry) */
  dropped: boolean;
}

/** Ранний глобус этой страницы или null (не вход с лендинга, светлая тема, сборка без глобуса). */
export function earlyGlobe(): EarlyGlobe | null {
  return (globalThis as { __bbGlobeEarly?: EarlyGlobe }).__bbGlobeEarly ?? null;
}

/**
 * Забрать слой (один раз): null — его нет (не загрузился, ещё грузится), уже
 * забран или брошен. Страница пришла раньше, чем слой построился сам, — строится
 * сейчас: его кадр — после её запуска, а не посреди.
 */
export function claimEarlyLayer(): EarlyLayer | null {
  const early = earlyGlobe();
  if (!early || early.adopted || early.dropped) return null;
  if (!early.layer) early.build?.();
  const layer = early.layer;
  if (!layer) return null;
  early.adopted = true;
  if (over) gateLater(early, layer);
  return layer;
}

/**
 * Конец ожидания входа (landingEntry: страница готова, ждать нечего или вышел предел). Глобус построен с hold:
 * после первого кадра стоит, чтобы не отнимать главный поток у запуска страницы. Слой, который страница (или
 * скелетон «Главной») уже забрала, вращается дальше (resume: забравший уже вызвал — повтор ничего не делает).
 * Не забранный — экран без глобуса (блокировка, сбой бэкенда, другая страница) или опоздавшая страница: он
 * гаснет обычным проявлением слоя (0,6 с, без скачка) и стоит; заберёт страница — проявится снова и
 * закрутится, нет — его уберёт dropEarlyLayer. Крутить невидимый — тратить кадры зря.
 */
export function settleEarlyLayer(): void {
  over = true;
  const early = earlyGlobe();
  const layer = early?.layer;
  if (!early || !layer || early.dropped) return;
  if (early.adopted) {
    layer.globe.resume?.();
    gateLater(early, layer);
    return;
  }
  layer.faded = true;
  layer.el.classList.remove('bb-globe-layer--instant', 'is-ready');
  // С точками на GPU глобус не стоит (index.html снимает hold сразу): погасший
  // уезжает за экран, как у свёрнутого Mini App, — модуль не рисует то, чего не
  // видно. Заберёт страница — её обвязка (wrapLayer) вернёт слой на место.
  if (layer.globe.gpu) {
    setTimeout(() => {
      if (!early.adopted && !early.dropped) layer.el.classList.add('bb-globe-layer--paused');
    }, UNCLAIMED_FADE_MS);
  }
}

/** Бросить слой, который никто не взял: глобус уничтожен, слой убран. */
export function dropEarlyLayer(): void {
  const early = earlyGlobe();
  if (!early || early.adopted) return;
  early.dropped = true;
  const layer = early.layer;
  early.layer = null;
  if (!layer) return;
  try {
    layer.globe.destroy();
  } catch {
    // уже уничтожен (данные не загрузились)
  }
  layer.el.remove();
}
