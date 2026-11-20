// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { installPageReveal } from './pageReveal';

/**
 * BlackBird: загрузка разделов (решение владельца 20.11). Пока данных нет —
 * только шапка и глобус: скелетоны и крутилка страницы первые 2 с не видны
 * (blackbird.css), потом проявляются. Содержимое, пришедшее на место
 * скелетона, проявляется плавно (bb-reveal-in), а не скачком из полос другой
 * формы.
 */

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = '';
});

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const skeletonGroup = () => {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-busy', 'true');
  return el;
};
const skeletonLine = () => {
  const el = document.createElement('span');
  // как skeletonClass(): заливка и пульс (порознь — см. сторож ui/skeleton/skeletonUsage.test.ts)
  el.className = ['block h-[1em] w-full', 'bg-dark-500/40 rounded-lg', 'animate-pulse'].join(' ');
  return el;
};

describe('installPageReveal', () => {
  it('скелетон заменён содержимым: оно проявляется (bb-reveal-in), класс уходит после анимации', async () => {
    stop = installPageReveal(document);
    const main = document.createElement('main');
    document.body.append(main);
    const sk = skeletonGroup();
    main.append(sk);
    await tick();
    // как React: новое вставлено, скелетон вынут — в одном коммите
    const content = document.createElement('section');
    main.insertBefore(content, sk);
    sk.remove();
    await tick();
    expect(content.classList.contains('bb-reveal-in')).toBe(true);
    content.dispatchEvent(new Event('animationend'));
    expect(content.classList.contains('bb-reveal-in')).toBe(false);
  });

  it('одиночная строка-скелетон (animate-pulse с заливкой скелетона) и скелетон глубже в вынутом узле — тоже', async () => {
    stop = installPageReveal(document);
    const card = document.createElement('div');
    document.body.append(card);
    const line = skeletonLine();
    card.append(line);
    const wrap = document.createElement('div');
    wrap.append(skeletonGroup());
    document.body.append(wrap);
    await tick();
    const a = document.createElement('p');
    card.replaceChild(a, line);
    const b = document.createElement('ul');
    document.body.replaceChild(b, wrap);
    await tick();
    expect(a.classList.contains('bb-reveal-in')).toBe(true);
    expect(b.classList.contains('bb-reveal-in')).toBe(true);
  });

  it('содержимое без ухода скелетона (обычная перерисовка, другие пульсирующие точки) — без анимации', async () => {
    stop = installPageReveal(document);
    const main = document.createElement('main');
    document.body.append(main);
    const dot = document.createElement('span');
    dot.className = 'animate-pulse bg-success-500';
    main.append(dot);
    await tick();
    const added = document.createElement('div');
    main.append(added);
    dot.remove();
    await tick();
    expect(added.classList.contains('bb-reveal-in')).toBe(false);
  });

  it('stop(): больше не следит', async () => {
    stop = installPageReveal(document);
    stop();
    stop = null;
    const main = document.createElement('main');
    document.body.append(main);
    const sk = skeletonGroup();
    main.append(sk);
    await tick();
    const content = document.createElement('section');
    main.replaceChild(content, sk);
    await tick();
    expect(content.classList.contains('bb-reveal-in')).toBe(false);
  });
});

describe('blackbird.css: загрузка разделов', () => {
  const css = readFileSync(join(import.meta.dirname, '../../styles/blackbird.css'), 'utf-8');

  it('группа скелетонов и крутилка страницы: первые 2 с не видны, потом проявляются за 0,4 с', () => {
    expect(css).toMatch(
      /\[role="status"\]\[aria-busy="true"\],\s*\.bb-page-loader \{\s*animation: bb-late 2\.4s both;\s*\}/,
    );
    expect(css).toMatch(
      /@keyframes bb-late \{\s*0%,\s*83\.3% \{\s*opacity: 0;\s*\}\s*100% \{\s*opacity: 1;\s*\}/,
    );
  });

  it('строка-скелетон: то же, а пульсация — после', () => {
    expect(css).toMatch(
      /\.animate-pulse\[class\*="bg-dark-500\/"\] \{\s*animation:\s*bb-late 2\.4s both,\s*pulse 2s cubic-bezier\(0\.4, 0, 0\.6, 1\) 2\.4s infinite;\s*\}/,
    );
  });

  it('содержимое вместо скелетона проявляется за 0,35 с (только прозрачность); при «уменьшить движение» всё сразу', () => {
    expect(css).toMatch(/\.bb-reveal-in \{\s*animation: bb-reveal-in 0\.35s ease-out both;\s*\}/);
    expect(css).toMatch(
      /@keyframes bb-reveal-in \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[role="status"\]\[aria-busy="true"\],\s*\.bb-page-loader,\s*\.animate-pulse\[class\*="bg-dark-500\/"\],\s*\.bb-reveal-in \{\s*animation: none;\s*\}/,
    );
  });

  it('PageLoader помечен bb-page-loader, main.tsx ставит наблюдатель', () => {
    const loader = readFileSync(join(import.meta.dirname, '../common/PageLoader.tsx'), 'utf-8');
    expect(loader).toMatch(/className="bb-page-loader min-h-viewport/);
    const main = readFileSync(join(import.meta.dirname, '../../main.tsx'), 'utf-8');
    expect(main).toMatch(/installPageReveal\(document\);/);
  });
});
