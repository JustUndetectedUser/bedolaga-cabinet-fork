import type { BBGlobeInstance, GlobeColors } from './bbGlobe';

/**
 * BlackBird: глобус, который начал грузиться до бандла. При входе с лендинга в
 * тёмной теме инлайн-скрипт index.html (data-hint="landing-entry") сразу грузит
 * config.json, модуль и данные (только сеть), а слой .bb-globe-layer строит сам,
 * как только приложение отрисовалось (первый узел в #root): первую отрисовку он
 * не задерживает, а страницы не ждёт. После первого кадра глобус стоит (hold),
 * пока его не заберёт страница. Здесь — его описание и то, как его забирают:
 * loadGlobe берёт config и модуль (второго запроса нет), CabinetGlobe — сам слой
 * (тот же холст) и запускает вращение, landingEntry на конце входа гасит не
 * забранный и убирает его, если его так никто и не взял.
 */

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
}

export interface EarlyGlobe {
  /** VITE_GLOBE_BASE, с которой грузили */
  base: string;
  /** config.json и модуль как пришли (формат не проверен); null — не загрузились */
  load: Promise<{ config: unknown; mod: unknown } | null>;
  layer: EarlyLayer | null;
  /**
   * построить слой сейчас (всё загружено, приложение отрисовалось); без страницы
   * он строится сам через 250 мс после первой отрисовки
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
  return layer;
}

/**
 * Конец ожидания входа (landingEntry). Глобус построен с hold: после первого кадра стоит, чтобы не отнимать
 * главный поток у запуска страницы. Слой, который страница уже забрала, вращается дальше (resume: забравший
 * уже вызвал — повтор ничего не делает). Не забранный — экран без глобуса (блокировка, сбой бэкенда) или
 * опоздавшая страница: он гаснет обычным проявлением слоя (0,6 с, без скачка) и стоит; заберёт страница —
 * проявится снова и закрутится, нет — его уберёт dropEarlyLayer. Крутить невидимый — тратить кадры зря.
 */
export function settleEarlyLayer(): void {
  const early = earlyGlobe();
  const layer = early?.layer;
  if (!early || !layer || early.dropped) return;
  if (early.adopted) {
    layer.globe.resume?.();
    return;
  }
  layer.faded = true;
  layer.el.classList.remove('bb-globe-layer--instant', 'is-ready');
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
