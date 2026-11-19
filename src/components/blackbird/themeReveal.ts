/**
 * BlackBird: смена темы кругом из точки нажатия (решение владельца 19.11, как
 * переключатель лендинга). Переключатель темы (шапка, меню, палитра команд —
 * все зовут toggleTheme из useTheme) просит круг: armThemeReveal(). Класс
 * темы на <html> ставит applyThemeClass (эффект useTheme): с просьбой — внутри
 * document.startViewTransition, и новая тема раскрывается кругом от последнего
 * нажатия, если ему не больше POINTER_FRESH_MS (иначе от центра окна), до
 * дальнего угла окна за 0,5 с. Круг — CSS-анимация нового вида (blackbird.css,
 * :root.bb-reveal, keyframes bb-reveal), браузер запускает её вместе с
 * переходом, с первого кадра; отсюда до перехода — только где и докуда
 * (--bb-reveal-x, --bb-reveal-y, --bb-reveal-r на <html>) и класс bb-reveal,
 * убираются, когда переход кончился. (Круг, запущенный отсюда после ready,
 * в Firefox опаздывал на кадр: весь новый вид — вспышка, 19.11.)
 * Без View Transitions, при «уменьшить движение», без просьбы (первая
 * отрисовка, системная тема, тема выключена по API) — класс сразу.
 *
 * Пока переход ждёт снимка старого вида, другие экземпляры useTheme тоже
 * ставят класс (событие themeChanged): их тема запоминается и применяется
 * внутри того же перехода — иначе снимок «до» вышел бы уже в новой теме.
 */

type Theme = 'dark' | 'light';
type Point = { x: number; y: number; t: number };

/** Нажатие старше этого — не то, что сменило тему (клавиатура, палитра команд). */
export const POINTER_FRESH_MS = 1000;

let lastPointer: Point | null = null;
let armed = false;
let pending: { theme: Theme } | null = null;

/** Запомнить нажатие (pointerdown, вешается ниже на window, в фазе перехвата). */
export function rememberPointer(e: { clientX: number; clientY: number }): void {
  lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', rememberPointer, { capture: true, passive: true });
}

/** Следующая смена класса темы — кругом (зовёт toggleTheme). */
export function armThemeReveal(): void {
  armed = true;
}

function setClass(root: HTMLElement, theme: Theme): void {
  root.classList.remove(theme === 'dark' ? 'light' : 'dark');
  root.classList.add(theme);
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Поставить класс темы на root — кругом, если его просили и браузер может. */
export function applyThemeClass(root: HTMLElement, theme: Theme): void {
  if (pending) {
    pending.theme = theme;
    return;
  }
  const reveal = armed;
  armed = false;
  const doc = root.ownerDocument;
  const start = (doc as Document & { startViewTransition?: (cb: () => void) => ViewTransition })
    .startViewTransition;
  const same =
    root.classList.contains(theme) && !root.classList.contains(theme === 'dark' ? 'light' : 'dark');
  if (same || !reveal || reducedMotion() || typeof start !== 'function') {
    setClass(root, theme);
    return;
  }
  const win = doc.defaultView ?? window;
  const fresh = lastPointer && Date.now() - lastPointer.t <= POINTER_FRESH_MS ? lastPointer : null;
  const at = fresh ?? { x: win.innerWidth / 2, y: win.innerHeight / 2 };
  const r = Math.ceil(
    Math.hypot(Math.max(at.x, win.innerWidth - at.x), Math.max(at.y, win.innerHeight - at.y)),
  );
  const done = () => {
    root.classList.remove('bb-reveal');
    for (const name of REVEAL_VARS) root.style.removeProperty(name);
  };
  root.style.setProperty(REVEAL_VARS[0], `${at.x}px`);
  root.style.setProperty(REVEAL_VARS[1], `${at.y}px`);
  root.style.setProperty(REVEAL_VARS[2], `${r}px`);
  root.classList.add('bb-reveal');
  pending = { theme };
  let vt: ViewTransition;
  try {
    vt = start.call(doc, () => {
      const t = pending ? pending.theme : theme;
      pending = null;
      setClass(root, t);
    });
  } catch {
    pending = null;
    done();
    setClass(root, theme);
    return;
  }
  vt.finished.then(done, done);
}

/** Где и докуда круг (blackbird.css, keyframes bb-reveal). */
const REVEAL_VARS = ['--bb-reveal-x', '--bb-reveal-y', '--bb-reveal-r'] as const;
