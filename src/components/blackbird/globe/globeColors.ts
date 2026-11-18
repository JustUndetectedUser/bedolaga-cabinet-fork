import type { GlobeColors } from './bbGlobe';

const WHITE = '#ffffff';
// Запасные цвета, если тема отдала то, чего модуль не понимает: фон B1 и
// текст и фон светлой темы сборки (champagne-950 / champagne-200, index.html).
const DARK_FADE = '#000000';
const LIGHT_INK = '#1f1a12';
const LIGHT_FADE = '#f7e7ce';
// Светлая тема: обводки и «дождь» прозрачнее точек. Тёмная штриховка на светлом
// фоне читается заметно сильнее светлой на чёрном (те же доли модуля), и страны
// под колонкой спорили бы с текстом.
const LIGHT_RING = 0.85;
const LIGHT_RAIN = 0.6;

type Rgba = [number, number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NUM = '\\s*([\\d.]+%?)\\s*';
const RGB = new RegExp(`^rgba?\\(${NUM}[,\\s]${NUM}[,\\s]${NUM}(?:[,/]${NUM})?\\)$`, 'i');

const channel = (v: string) => (v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v));

/**
 * Цвет, который понимает модуль: hex или rgb()/rgba(), разобранный в
 * [r, g, b, a]; иначе null. Модуль молча пропускает oklch(), lab(), color() —
 * за него решаем здесь. Прозрачный (фон body не задан) тоже null: растворяться
 * в нём нечему.
 */
function parse(value: string | null | undefined): Rgba | null {
  const v = (value ?? '').trim();
  const hex = HEX.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const m = RGB.exec(v);
  if (!m) return null;
  const alpha =
    m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  const rgba: Rgba = [channel(m[1]), channel(m[2]), channel(m[3]), alpha];
  return rgba.every(Number.isFinite) && alpha > 0 ? rgba : null;
}

/** [r, g, b, a] с прозрачностью, умноженной на k, строкой rgba(). */
function rgba([r, g, b, a]: Rgba, k: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * k * 1000) / 1000})`;
}

/**
 * BlackBird: цвета глобуса под тему. root — элемент, с которого читаются
 * вычисленные цвета (страница передаёт body). Тёмная тема: точки, обводки и
 * дождь белые, как на лендинге; светлая — цветом текста темы, обводки и дождь
 * прозрачнее. fade — фон страницы в обеих.
 */
export function globeColors(isDark: boolean, root: HTMLElement): GlobeColors {
  const style = getComputedStyle(root);
  const fade = parse(style.backgroundColor) ? style.backgroundColor.trim() : null;
  if (isDark) {
    return { dot: WHITE, ring: WHITE, rain: WHITE, fade: fade ?? DARK_FADE };
  }
  const ink = parse(style.color) ? style.color.trim() : LIGHT_INK;
  const rgb = parse(ink) as Rgba;
  return {
    dot: ink,
    ring: rgba(rgb, LIGHT_RING),
    rain: rgba(rgb, LIGHT_RAIN),
    fade: fade ?? LIGHT_FADE,
  };
}
