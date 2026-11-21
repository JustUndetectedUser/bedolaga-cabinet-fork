import type { BBGlobeConstructor, BBGlobeModule, GlobeView } from './bbGlobe';
import { earlyGlobe } from './earlyGlobe';

/** Всё, что нужно слою глобуса: класс модуля, место глобуса, страны и адрес данных. */
export interface LoadedGlobe {
  BBGlobe: BBGlobeConstructor;
  cabinetView: (w: number, h: number) => GlobeView;
  /** пиксель вёрстки окна (модуль без него — 1) */
  layoutPx: (w: number, h: number) => number;
  servers: Record<string, unknown>;
  dataUrl: string;
}

type ImportModule = (url: string) => Promise<unknown>;

// Модуль не входит в сборку кабинета: его отдаёт Caddy роли front с домена
// кабинета, новая страна или правка модуля не требуют нового образа.
const importModule: ImportModule = (url) => import(/* @vite-ignore */ url);

// Один результат на страницу (и неудача тоже): «Главная» и вход монтируют слой
// много раз, а в сеть идём один.
const cache = new Map<string, Promise<LoadedGlobe | null>>();

/**
 * BlackBird: глобус для «Главной» и экрана входа. Пустая база (сборка без
 * VITE_GLOBE_BASE) или любой сбой — null, без исключений наружу: страница
 * тогда выглядит как без глобуса. importer — для тестов.
 */
export async function loadGlobe(
  base: string | undefined = import.meta.env.VITE_GLOBE_BASE,
  importer: ImportModule = importModule,
): Promise<LoadedGlobe | null> {
  if (!base) return null;
  let pending = cache.get(base);
  if (!pending) {
    pending = fetchGlobe(base, importer);
    cache.set(base, pending);
  }
  return pending;
}

async function fetchGlobe(base: string, importer: ImportModule): Promise<LoadedGlobe | null> {
  try {
    // Вход с лендинга: config.json и модуль уже грузит инлайн-скрипт index.html
    // (earlyGlobe.ts) — берём их, второго запроса нет. Не загрузились — как без него.
    const early = earlyGlobe();
    const got = early?.base === base ? await early.load : null;
    if (got) return loaded(base, got.config, got.mod);
    // Без второго аргумента: режим cors и credentials same-origin — те же, что у
    // <link rel="preload" as="fetch" crossorigin> из index.html, поэтому браузер
    // отдаёт предзагруженный ответ, а не запрашивает config.json второй раз.
    const res = await fetch(`${base}config.json`);
    if (!res.ok) return null;
    const config: unknown = await res.json();
    if (!isConfig(config)) return null;
    return loaded(base, config, await importer(`${base}bb-globe.js?v=${version(config)}`));
  } catch {
    return null;
  }
}

const version = (config: { v: string | number }) => encodeURIComponent(String(config.v));

/** Проверить config.json и модуль; null — не тот формат или нет нужных экспортов. */
function loaded(base: string, config: unknown, module: unknown): LoadedGlobe | null {
  if (!isConfig(config)) return null;
  const mod = module as Partial<BBGlobeModule> | null;
  if (!mod || typeof mod.BBGlobe !== 'function' || typeof mod.cabinetView !== 'function') {
    return null;
  }
  return {
    BBGlobe: mod.BBGlobe,
    cabinetView: mod.cabinetView,
    layoutPx: typeof mod.layoutPx === 'function' ? mod.layoutPx : () => 1,
    servers: config.servers,
    dataUrl: `${base}globe-data.json?v=${version(config)}`,
  };
}

/** config.json роли front: { v: версия файлов, servers: { КОД: { name, region } } }. */
function isConfig(x: unknown): x is { v: string | number; servers: Record<string, unknown> } {
  if (!x || typeof x !== 'object') return false;
  const { v, servers } = x as { v?: unknown; servers?: unknown };
  const version =
    (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
  return version && !!servers && typeof servers === 'object' && !Array.isArray(servers);
}
