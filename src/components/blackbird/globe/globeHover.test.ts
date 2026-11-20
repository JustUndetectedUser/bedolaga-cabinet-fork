// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { freeAt } from './globeHover';

/**
 * BlackBird: свет под курсором на глобусе кабинета (владелец 20.11) — только
 * над свободным местом: не над шапкой, меню, карточками, текстом, кнопками и
 * колонкой содержимого. freeAt(x, y) — что под курсором.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

/** Разметка как у кабинета: #root > оболочка > main > колонка; elementFromPoint отдаёт el. */
function page(html: string, hit: string | null) {
  document.body.innerHTML = `<div id="root"><div class="shell"><main>${html}</main></div></div>`;
  const el = hit ? document.querySelector(hit) : null;
  document.elementFromPoint = () => el;
}

describe('freeAt', () => {
  it('пустое место страницы (main, оболочка, #root, body) — свободно', () => {
    for (const hit of ['main', '.shell', '#root', 'body']) {
      page('<div class="col"></div>', hit);
      expect(freeAt(10, 10), hit).toBe(true);
    }
    page('', null);
    expect(freeAt(10, 10), 'ничего под курсором').toBe(true);
  });

  it('прозрачная обёртка без своего текста — свободно', () => {
    page('<div class="wrap" style="padding: 40px"><div class="inner"></div></div>', '.wrap');
    expect(freeAt(10, 10)).toBe(true);
  });

  it('карточка (фон или рамка), колонка с тенью (фон-картинка), текст, кнопки, ссылки, поля — не свободно', () => {
    const cases: Array<[string, string]> = [
      [
        '<div class="card" style="background-color: rgb(20, 20, 20)"><span class="in"></span></div>',
        '.in',
      ],
      ['<div class="card" style="border: 1px solid rgb(60, 60, 60)"></div>', '.card'],
      [
        '<div class="shade" style="background-image: linear-gradient(red, blue)"><div class="x"></div></div>',
        '.x',
      ],
      ['<p class="t">Подписка</p>', '.t'],
      ['<div class="d">Текст <b class="b">жирный</b></div>', '.d'],
      ['<button class="btn"><span class="ic"></span></button>', '.ic'],
      ['<a href="/" class="lnk"><i class="ic"></i></a>', '.ic'],
      ['<input class="inp">', '.inp'],
      ['<div role="switch" class="sw"></div>', '.sw'],
      ['<svg class="svg"><rect class="r"/></svg>', '.r'],
      ['<img class="img" alt="">', '.img'],
    ];
    for (const [html, hit] of cases) {
      page(html, hit);
      expect(freeAt(10, 10), html).toBe(false);
    }
  });

  it('фон почти прозрачный (до 0.05) — ещё свободно', () => {
    page('<div class="w" style="background-color: rgba(0, 0, 0, 0.03)"></div>', '.w');
    expect(freeAt(10, 10)).toBe(true);
    page('<div class="w" style="background-color: rgba(0, 0, 0, 0.2)"></div>', '.w');
    expect(freeAt(10, 10)).toBe(false);
  });

  it('шапка вне main (заголовок с фоном) — не свободно', () => {
    document.body.innerHTML =
      '<div id="root"><header class="h" style="background-color: rgba(0, 0, 0, 0.8)"><div class="row"></div></header></div>';
    const el = document.querySelector('.row');
    document.elementFromPoint = () => el;
    expect(freeAt(10, 10)).toBe(false);
  });
});
