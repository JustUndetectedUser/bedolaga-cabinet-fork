import type { BBGlobeInstance, GlobeColors } from './bbGlobe';

/**
 * BlackBird: глобус, который начал грузиться до бандла. При входе с лендинга в
 * тёмной теме инлайн-скрипт index.html (data-hint="landing-entry") сразу
 * запрашивает config.json и модуль и строит слой .bb-globe-layer сам: бандл,
 * React и словари его не задерживают. Здесь — его описание и то, как его
 * забирают: loadGlobe берёт config и модуль (второго запроса нет), CabinetGlobe —
 * сам слой (тот же холст), landingEntry убирает слой, если его так никто и не
 * взял.
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
}

export interface EarlyGlobe {
  /** VITE_GLOBE_BASE, с которой грузили */
  base: string;
  /** config.json и модуль как пришли (формат не проверен); null — не загрузились */
  load: Promise<{ config: unknown; mod: unknown } | null>;
  layer: EarlyLayer | null;
  /** слой забрал CabinetGlobe */
  adopted: boolean;
  /** слой брошен: его никто не взял (landingEntry) */
  dropped: boolean;
}

/** Ранний глобус этой страницы или null (не вход с лендинга, светлая тема, сборка без глобуса). */
export function earlyGlobe(): EarlyGlobe | null {
  return (globalThis as { __bbGlobeEarly?: EarlyGlobe }).__bbGlobeEarly ?? null;
}

/** Забрать слой (один раз): null — его нет, уже забран или брошен. */
export function claimEarlyLayer(): EarlyLayer | null {
  const early = earlyGlobe();
  const layer = early?.layer;
  if (!early || !layer || early.adopted || early.dropped) return null;
  early.adopted = true;
  return layer;
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
