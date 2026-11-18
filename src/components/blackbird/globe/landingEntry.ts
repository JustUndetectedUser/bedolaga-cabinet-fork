import { loadGlobe } from './loadGlobe';

/**
 * BlackBird: вход в кабинет с лендинга. По нажатию «В личный кабинет» лендинг
 * гаснет в чёрный, его глобус перелетает на место глобуса кабинета и
 * вращается (roles/landing/files/site/assets/globe/init.js инфраструктуры), а
 * ссылка уходит с меткой: /?from=landing&lon=<долгота вида, 2 знака>&t=<Date.now()
 * в момент нажатия>. Кабинет продолжает то же движение.
 *
 * - Тёмная тема: #root прозрачен (класс bb-entry на <html>), видны только фон и
 *   глобус: он появляется сразу на своём месте и вращается дальше с долготы
 *   лендинга (spinFrom). Ожидание снимает первый кадр глобуса
 *   (releaseLandingEntry из CabinetGlobe), сбой глобуса или ENTRY_WAIT_MS —
 *   что раньше; содержимое проявляется за ENTRY_FADE_MS (bb-entry-in).
 * - Светлая тема: ожидания и передачи глобуса нет. Лендинг не знает темы
 *   кабинета и гаснет так же, поэтому чёрная накладка продолжает его чёрный и
 *   гаснет за ENTRY_FADE_MS после первой отрисовки приложения.
 * - Без метки, при «уменьшить движение» — ничего (null), страница как обычно.
 *
 * Первую отрисовку (до бандла) красит в чёрный инлайн-скрипт index.html
 * (data-hint="landing-entry", класс bb-entry-black): тёмная тема держит его,
 * пока #root скрыт, светлая снимает, как только накладка на месте.
 *
 * Метку (from, lon, t) убираем из адреса всегда: она одноразовая, а адрес
 * могут сохранить или переслать. Остальные параметры и hash не трогаем.
 * Вызывается один раз при старте, до createRoot (main.tsx): метку читаем до
 * редиректов роутера (переход на /login её бы потерял), а после входа на
 * /login «Главная» открывается без второго ожидания.
 */

export type LandingEntry = 'dark' | 'light';

/** С какой долготы и с какого момента (Date.now(), мс) вращается глобус лендинга. */
export interface SpinFrom {
  lon: number;
  at: number;
}

/** Дольше глобус не ждём: решение владельца (спецификация, 18.11). */
export const ENTRY_WAIT_MS = 600;
/** Проявление содержимого (тёмная тема) и угасание накладки (светлая). */
export const ENTRY_FADE_MS = 400;
/** t из метки дальше от наших часов — ссылку открыли не сразу (или часы врут): вращение от своих часов. */
const SPIN_FROM_MAX_SKEW_MS = 10 * 60 * 1000;
/**
 * Светлая тема: приложение так и не отрисовалось — накладка всё равно гаснет.
 * Больше, чем main.tsx ждёт перед первой отрисовкой (словари — до 5 с,
 * палитра — до 1,5 с), чтобы срабатывать только при поломке.
 */
const VEIL_MAX_MS = 6000;

const MARK_PARAMS = ['from', 'lon', 't'];
/** Класс инлайн-скрипта index.html: фон страницы чёрный, пока не начался вход. */
const BLACK = 'bb-entry-black';

let wait: { html: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
let spinFrom: SpinFrom | null = null;

/** Число из параметра адреса: непустая строка и конечное число; иначе null. */
function finite(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Убрать метку из адреса: остальные части query остаются как были, байт в байт; hash и state тоже. */
function stripMark(win: Window): void {
  const { pathname, search, hash } = win.location;
  const kept = search
    .slice(1)
    .split('&')
    .filter((part) => part !== '' && !MARK_PARAMS.includes(decode(part.split('=')[0])));
  const query = kept.length ? `?${kept.join('&')}` : '';
  win.history.replaceState(win.history.state, '', `${pathname}${query}${hash}`);
}

/** Чёрная накладка светлой темы: гаснет, как только приложение что-то отрисовало в #root. */
function showVeil(doc: Document): void {
  const veil = doc.createElement('div');
  veil.className = 'bb-entry-veil';
  veil.setAttribute('aria-hidden', 'true');
  (doc.body ?? doc.documentElement).appendChild(veil);
  const root = doc.getElementById('root');
  let observer: MutationObserver | null = null;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const out = () => {
    observer?.disconnect();
    clearTimeout(cap);
    if (veil.classList.contains('is-out')) return;
    // Переходу нужно состояние «до»: накладка могла ещё ни разу не пройти
    // расчёт стилей (приложение отрисовалось в том же кадре), и тогда она
    // пропала бы сразу, без угасания.
    void getComputedStyle(veil).opacity;
    veil.classList.add('is-out');
    setTimeout(() => veil.remove(), ENTRY_FADE_MS + 100);
  };
  if (root?.firstChild) {
    out();
    return;
  }
  if (root) {
    // Первый узел в #root — первая отрисовка React: класс встаёт до кадра, в
    // котором она появится на экране, и накладка гаснет начиная с этого кадра.
    observer = new MutationObserver(out);
    observer.observe(root, { childList: true });
  }
  cap = setTimeout(out, VEIL_MAX_MS);
}

/**
 * Прочитать метку входа с лендинга при старте. now — момент, от которого
 * считаются ENTRY_WAIT_MS (по performance.now()). Возвращает тему входа или
 * null (метки нет, «уменьшить движение»). Исключений наружу не бросает.
 */
export function captureLandingEntry(win: Window, now = performance.now()): LandingEntry | null {
  const entry = capture(win, now);
  // Чёрный фон index.html: тёмная тема снимает его вместе с ожиданием, в
  // остальных случаях он больше не нужен (у светлой уже стоит накладка).
  if (entry !== 'dark') win.document.documentElement.classList.remove(BLACK);
  return entry;
}

function capture(win: Window, now: number): LandingEntry | null {
  try {
    const params = new URLSearchParams(win.location.search);
    if (params.get('from') !== 'landing') return null;
    const lon = finite(params.get('lon'));
    const t = finite(params.get('t'));
    try {
      stripMark(win);
    } catch {
      // адрес поменять нельзя (песочница) — метка останется, вход всё равно сыграет
    }
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
    const doc = win.document;
    const html = doc.documentElement;
    if (html.classList.contains('light')) {
      showVeil(doc);
      return 'light';
    }
    // t — часы лендинга на той же машине: далеко от Date.now() — ссылку открыли
    // не сразу после нажатия, продолжать нечего.
    spinFrom =
      lon !== null && t !== null && Math.abs(t - Date.now()) <= SPIN_FROM_MAX_SKEW_MS
        ? { lon, at: t }
        : null;
    if (wait) return 'dark';
    html.classList.add('bb-entry');
    const left = Math.max(0, ENTRY_WAIT_MS - (performance.now() - now));
    wait = { html, timer: setTimeout(releaseLandingEntry, left) };
    // Как можно раньше: config.json уже в предзагрузке index.html, модуль глобуса
    // грузится, пока React готовит первую отрисовку. Глобуса не будет — не ждём.
    void loadGlobe().then((g) => {
      if (!g) releaseLandingEntry();
    });
    return 'dark';
  } catch {
    return null;
  }
}

/** Снять ожидание (тёмная тема): содержимое проявляется. Повторный вызов ничего не делает. */
export function releaseLandingEntry(): void {
  if (!wait) return;
  const { html, timer } = wait;
  wait = null;
  clearTimeout(timer);
  // bb-entry-in несёт переход и должен стоять в том же расчёте стилей, в котором
  // #root перестаёт быть прозрачным.
  html.classList.add('bb-entry-in');
  html.classList.remove('bb-entry', BLACK);
  setTimeout(() => html.classList.remove('bb-entry-in'), ENTRY_FADE_MS + 100);
}

/** Идёт ожидание глобуса (тёмная тема, ещё не снято). */
export function landingEntryPending(): boolean {
  return wait !== null;
}

/** Вращение с лендинга для глобуса этой страницы (тёмная тема, метка с верными lon и t); иначе null. */
export function landingSpinFrom(): SpinFrom | null {
  return spinFrom;
}
