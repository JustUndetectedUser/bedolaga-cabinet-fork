import type { BBGlobeConstructor, BBGlobeModule, GlobeView } from './bbGlobe';

/** Всё, что нужно слою глобуса: класс модуля, место глобуса, страны и адрес данных. */
export interface LoadedGlobe {
  BBGlobe: BBGlobeConstructor;
  cabinetView: (w: number, h: number) => GlobeView;
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
    // Без второго аргумента: режим cors и credentials same-origin — те же, что у
    // <link rel="preload" as="fetch" crossorigin> из index.html, поэтому браузер
    // отдаёт предзагруженный ответ, а не запрашивает config.json второй раз.
    const res = await fetch(`${base}config.json`);
    if (!res.ok) return null;
    const config: unknown = await res.json();
    if (!isConfig(config)) return null;
    const v = encodeURIComponent(String(config.v));
    const mod = (await importer(`${base}bb-globe.js?v=${v}`)) as Partial<BBGlobeModule> | null;
    if (!mod || typeof mod.BBGlobe !== 'function' || typeof mod.cabinetView !== 'function') {
      return null;
    }
    return {
      BBGlobe: mod.BBGlobe,
      cabinetView: mod.cabinetView,
      servers: config.servers,
      dataUrl: `${base}globe-data.json?v=${v}`,
    };
  } catch {
    return null;
  }
}

/** config.json роли front: { v: версия файлов, servers: { КОД: { name, region } } }. */
function isConfig(x: unknown): x is { v: string | number; servers: Record<string, unknown> } {
  if (!x || typeof x !== 'object') return false;
  const { v, servers } = x as { v?: unknown; servers?: unknown };
  const version =
    (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
  return version && !!servers && typeof servers === 'object' && !Array.isArray(servers);
}
