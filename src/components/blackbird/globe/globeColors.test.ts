// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { globeColors } from './globeColors';

/**
 * Цвета глобуса под тему кабинета. Тёмная: белые точки, обводки и «дождь»,
 * края растворяются в фон страницы. Светлая: цветом текста темы (тёмное),
 * обводки и дождь прозрачнее (тёмная штриховка на светлом читается сильнее
 * светлой на чёрном), фон — вычисленный фон body. Модуль понимает только hex
 * и rgb(): остальное (oklch, lab, прозрачный фон) заменяется запасным цветом.
 */

function el(style: Partial<CSSStyleDeclaration>): HTMLElement {
  const node = document.createElement('div');
  Object.assign(node.style, style);
  document.body.appendChild(node);
  return node;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('globeColors', () => {
  it('тёмная тема: белые точки, обводки и дождь, фон страницы', () => {
    const root = el({ backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(245, 245, 245)' });
    expect(globeColors(true, root)).toEqual({
      dot: '#ffffff',
      ring: '#ffffff',
      rain: '#ffffff',
      fade: 'rgb(0, 0, 0)',
    });
  });

  it('светлая тема: тёмные точки и обводки цветом текста, фон светлой темы', () => {
    const root = el({ backgroundColor: '#e5e7eb', color: '#111827' });
    expect(globeColors(false, root)).toEqual({
      dot: 'rgb(17, 24, 39)',
      ring: 'rgba(17, 24, 39, 0.85)',
      rain: 'rgba(17, 24, 39, 0.6)',
      fade: 'rgb(229, 231, 235)',
    });
  });

  it('цвета, которых модуль не понимает, и прозрачный фон — запасные', () => {
    const root = el({});
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      color: 'oklch(0.2 0.02 260)',
    } as CSSStyleDeclaration);
    expect(globeColors(true, root).fade).toBe('#000000');
    const light = globeColors(false, root);
    expect(light.fade).toBe('#f7e7ce');
    expect(light.dot).toBe('#1f1a12');
    expect(light.ring).toBe('rgba(31, 26, 18, 0.85)');
  });

  it('hex и rgba с непрозрачностью проходят как есть', () => {
    const root = el({});
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundColor: '#0a0f1a',
      color: 'rgba(31, 26, 18, 0.9)',
    } as CSSStyleDeclaration);
    expect(globeColors(false, root)).toEqual({
      dot: 'rgba(31, 26, 18, 0.9)',
      ring: 'rgba(31, 26, 18, 0.765)',
      rain: 'rgba(31, 26, 18, 0.54)',
      fade: '#0a0f1a',
    });
  });

  it('rgb() с пробелами и короткий hex тоже понятны', () => {
    const root = el({});
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundColor: 'rgb(247 231 206)',
      color: '#123',
    } as CSSStyleDeclaration);
    expect(globeColors(false, root)).toEqual({
      dot: '#123',
      ring: 'rgba(17, 34, 51, 0.85)',
      rain: 'rgba(17, 34, 51, 0.6)',
      fade: 'rgb(247 231 206)',
    });
  });
});
