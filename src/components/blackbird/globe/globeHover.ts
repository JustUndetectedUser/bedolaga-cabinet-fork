/**
 * BlackBird: свет под курсором на глобусе кабинета (решение владельца 20.11) —
 * точки суши вокруг курсора крупнее и ярче, как на лендинге (модуль: hoverOn),
 * но только над свободным местом страницы, не над её интерфейсом.
 *
 * Свободно, если под курсором ничего нет или от элемента под ним до #root нет
 * ни одного, у которого свой вид или своё содержимое: фон (цвет плотнее 0.05
 * или картинка — как у тени колонки содержимого), рамка, собственный текст,
 * картинка, svg, холст, поле ввода, кнопка, ссылка и другие нажимаемые роли.
 * Прозрачные обёртки разметки (main, колонки, отступы) — свободное место.
 */

const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, img, svg, canvas, video, iframe, ' +
  '[role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], ' +
  '[role="dialog"], [contenteditable="true"]';

/** Прозрачность цвета CSS (rgb/rgba/transparent); непонятное — как непрозрачное. */
function alphaOf(color: string): number {
  if (!color || color === 'transparent') return 0;
  const m = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
}

function hasOwnText(el: Element): boolean {
  for (const n of el.childNodes) if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true;
  return false;
}

function hasBorder(cs: CSSStyleDeclaration): boolean {
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const w = Number.parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`) || '0');
    const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
    const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
    if (w > 0 && style && style !== 'none' && style !== 'hidden' && alphaOf(color) > 0.05)
      return true;
  }
  return false;
}

/** Курсор в точке (x, y) окна над свободным местом страницы. */
export function freeAt(x: number, y: number, doc: Document = document): boolean {
  const el = doc.elementFromPoint(x, y);
  const view = doc.defaultView;
  if (!el || !view) return true;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e === doc.body || e === doc.documentElement || e.id === 'root') return true;
    if (e.matches(INTERACTIVE) || e instanceof view.SVGElement || hasOwnText(e)) return false;
    const cs = view.getComputedStyle(e);
    if ((cs.backgroundImage && cs.backgroundImage !== 'none') || alphaOf(cs.backgroundColor) > 0.05)
      return false;
    if (hasBorder(cs)) return false;
  }
  return true;
}
