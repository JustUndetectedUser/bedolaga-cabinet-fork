// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import htmlSource from '../../../index.html?raw';
import { divideViewportUnits } from '../../../vite-plugins/postcssViewportZoom.js';
import postcssViewportZoom from '../../../vite-plugins/postcssViewportZoom.js';

/**
 * Большой монитор (владелец 21.11.2026): в окне больше 1440x800 по обеим
 * сторонам кабинет — это кабинет окна 1440x800, увеличенный целиком (zoom на
 * body). Скрипт page-zoom в index.html ставит --bb-zoom и класс bb-zoom на
 * <html>; единицы окна при сборке делятся на --bb-vz (внутри зума они выросли
 * бы вместе с ним).
 */

function runPageZoom(): void {
  const match = htmlSource.match(/<script data-hint="page-zoom">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html: нет инлайн-скрипта data-hint="page-zoom"');
  new Function(match[1])();
}

function setWindow(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

// ?raw у .css в тестах пустой (vitest не грузит стили): файл как есть
const cssSource = readFileSync(join(process.cwd(), 'src/styles/blackbird.css'), 'utf-8');
const html = document.documentElement;
const zoom = () => html.style.getPropertyValue('--bb-zoom');

beforeEach(() => {
  html.removeAttribute('style');
  html.classList.remove('bb-zoom');
});

afterEach(() => {
  setWindow(1024, 768);
});

describe('page-zoom (index.html)', () => {
  it('до 1440x800 по любой стороне — ни класса, ни переменной', () => {
    for (const [w, h] of [
      [1280, 658],
      [1440, 800],
      [1920, 790],
      [1400, 1600],
      [390, 844],
    ]) {
      setWindow(w, h);
      runPageZoom();
      expect(html.classList.contains('bb-zoom'), `${w}x${h}`).toBe(false);
      expect(zoom(), `${w}x${h}`).toBe('');
    }
  });

  it('больше по обеим — меньшее из отношений к 1440 и 800 (как --px лендинга)', () => {
    setWindow(2560, 1272);
    runPageZoom();
    expect(html.classList.contains('bb-zoom')).toBe(true);
    expect(Number(zoom())).toBeCloseTo(1272 / 800, 12);
    setWindow(2560, 1600);
    runPageZoom();
    expect(Number(zoom())).toBeCloseTo(2560 / 1440, 12);
  });

  it('при изменении окна — заново, в обе стороны', () => {
    setWindow(1280, 720);
    runPageZoom();
    expect(html.classList.contains('bb-zoom')).toBe(false);
    setWindow(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    expect(Number(zoom())).toBeCloseTo(1920 / 1440, 12);
    setWindow(1280, 720);
    window.dispatchEvent(new Event('resize'));
    expect(html.classList.contains('bb-zoom')).toBe(false);
    expect(zoom()).toBe('');
  });
});

describe('blackbird.css: зум', () => {
  it('body в зуме, слой глобуса и обёртки Radix — снова в пикселях окна', () => {
    const rule = (sel: string) => {
      const i = cssSource.indexOf(`${sel} {`);
      return i < 0 ? '' : cssSource.slice(i, cssSource.indexOf('}', i));
    };
    expect(rule('html.bb-zoom body')).toMatch(
      /zoom: var\(--bb-zoom\);\s*--bb-vz: var\(--bb-zoom\);/,
    );
    expect(rule('html.bb-zoom .bb-globe-layer')).toMatch(
      /zoom: calc\(1 \/ var\(--bb-zoom\)\);\s*--bb-vz: 1;/,
    );
    expect(rule('html.bb-zoom [data-radix-popper-content-wrapper]')).toMatch(
      /zoom: calc\(1 \/ var\(--bb-zoom\)\);\s*--bb-vz: 1;/,
    );
    expect(rule('html.bb-zoom [data-radix-popper-content-wrapper] > *')).toMatch(
      /zoom: var\(--bb-zoom\);\s*--bb-vz: var\(--bb-zoom\);/,
    );
  });
});

describe('blackbird.css: плашка меню (framer-motion layoutId)', () => {
  it('в пикселях окна: framer-motion сдвигает её на разницу, измеренную в окне', () => {
    expect(cssSource).toMatch(
      /html\.bb-zoom a > span\.absolute\.inset-0\.rounded-full\.shadow-sm,\s*html\.bb-zoom a > div\.absolute\.inset-0\.rounded-2xl \{\s*zoom: calc\(1 \/ var\(--bb-zoom\)\);/,
    );
  });
});

describe('postcssViewportZoom', () => {
  it('единицы окна делятся на --bb-vz, остальное как было', () => {
    expect(divideViewportUnits('100vh')).toBe('calc(100vh / var(--bb-vz, 1))');
    expect(divideViewportUnits('calc(100dvh - 2rem)')).toBe(
      'calc(calc(100dvh / var(--bb-vz, 1)) - 2rem)',
    );
    expect(divideViewportUnits('min(22rem, calc(100vw - 2rem))')).toBe(
      'min(22rem, calc(calc(100vw / var(--bb-vz, 1)) - 2rem))',
    );
    expect(divideViewportUnits('62.5svh 10lvw -3vmin .5vmax')).toBe(
      'calc(62.5svh / var(--bb-vz, 1)) calc(10lvw / var(--bb-vz, 1)) calc(-3vmin / var(--bb-vz, 1)) calc(.5vmax / var(--bb-vz, 1))',
    );
    for (const same of [
      '16px',
      '1.5rem',
      '50%',
      'translateY(20px)',
      'var(--h-vh)',
      'url(a100vh.png)',
    ]) {
      expect(divideViewportUnits(same)).toBe(same);
    }
  });

  it('пользовательские свойства и уже поделённое не трогает', () => {
    const plugin = postcssViewportZoom();
    const decl = (prop: string, value: string) => {
      const d = { prop, value };
      plugin.Declaration(d);
      return d.value;
    };
    expect(decl('height', '100vh')).toBe('calc(100vh / var(--bb-vz, 1))');
    expect(decl('--h', '100vh')).toBe('100vh');
    expect(decl('height', 'calc(100vh / var(--bb-vz, 1))')).toBe('calc(100vh / var(--bb-vz, 1))');
  });
});
