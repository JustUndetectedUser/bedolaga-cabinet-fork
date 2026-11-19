import { dropEarlyLayer, settleEarlyLayer } from './earlyGlobe';

/**
 * BlackBird: вход в кабинет с лендинга. По нажатию «В личный кабинет» лендинг
 * гаснет в чёрный, его глобус перелетает на место глобуса кабинета и
 * вращается (roles/landing/files/site/assets/globe/init.js инфраструктуры), а
 * ссылка уходит с меткой: /?from=landing&lon=<долгота вида, 2 знака>&t=<Date.now()
 * в момент нажатия>&fly=<где стоял глобус и сколько длится перелёт>. Кабинет
 * продолжает то же движение: перелёт и вращение — с того кадра, который лендинг
 * показал последним (fly читает инлайн-скрипт index.html, опция arrive модуля).
 *
 * - Тёмная тема: #root прозрачен (класс bb-entry на <html>), видны только фон и
 *   глобус: он появляется сразу на своём месте, вращается дальше с долготы
 *   лендинга (spinFrom) и служит загрузкой — ни чёрного экрана, ни загрузчика
 *   приложения. Ожидание снимает первое из:
 *   · страница готова: экран входа смонтирован, «Главная» вышла из загрузки
 *     данных (CabinetGlobe без keepOnly и без busy, после первого кадра глобуса);
 *   · ждать нечего: экран блокировки или страница без глобуса (EntryGate);
 *   · глобуса не будет (сбой загрузки, конструктора, данных);
 *   · глобуса нет на экране через GLOBE_LATE_MS от начала документа: интерфейс
 *     как есть, со своим загрузчиком; глобус проявится позже обычным образом;
 *   · прошло ENTRY_CAP_MS от начала документа;
 *   · страницу вернули из кэша страниц («Назад»).
 *   Содержимое проявляется за ENTRY_FADE_MS с подъёмом (bb-entry-in).
 * - Светлая тема: ожидания и передачи глобуса нет. Лендинг не знает темы
 *   кабинета и гаснет так же, поэтому чёрная накладка продолжает его чёрный и
 *   гаснет за ENTRY_FADE_MS после первой отрисовки приложения.
 * - Без метки, при «уменьшить движение» — ничего (null), страница как обычно.
 *
 * Первую отрисовку (до бандла) красит в чёрный инлайн-скрипт index.html
 * (data-hint="landing-entry", класс bb-entry-black): тёмная тема держит его,
 * пока #root скрыт, светлая снимает, как только накладка на месте. В тёмной
 * теме тот же скрипт сразу грузит глобус и строит его слой после первой
 * отрисовки приложения (earlyGlobe.ts): CabinetGlobe его забирает.
 *
 * Метку (from, lon, t, fly) убираем из адреса всегда: она одноразовая, а адрес
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

/**
 * Предел ожидания: столько от начала документа кабинета (performance.now())
 * глобус заменяет загрузку; не успела страница — показывается как есть.
 * Решение владельца (спецификация, 18.11).
 */
export const ENTRY_CAP_MS = 5000;
/**
 * Глобуса нет на экране к этому моменту от начала документа (его файлы ещё
 * качаются: первый визит, медленная сеть) — не ждём: без него ожидание было бы
 * пустым экраном.
 */
export const GLOBE_LATE_MS = 1500;
/** Проявление содержимого (тёмная тема) и угасание накладки (светлая). */
export const ENTRY_FADE_MS = 400;
/** t из метки дальше от наших часов — ссылку открыли не сразу (или часы врут): вращение от своих часов. */
const SPIN_FROM_MAX_SKEW_MS = 10 * 60 * 1000;
/**
 * Ранний слой (earlyGlobe.ts), который так и не забрала страница с глобусом
 * (вход привёл на экран без глобуса: сбой бэкенда, блокировка), убирается.
 * Дольше предела входа и первой отрисовки React (словари — до 5 с): на пределе
 * слой гаснет, но опоздавшая страница ещё может его забрать.
 */
export const EARLY_HOLD_MS = 7000;
/**
 * Светлая тема: приложение так и не отрисовалось — накладка всё равно гаснет.
 * Больше, чем main.tsx ждёт перед первой отрисовкой (словари — до 5 с,
 * палитра — до 1,5 с), чтобы срабатывать только при поломке.
 */
const VEIL_MAX_MS = 6000;

/** Части query с меткой (from, lon, t, fly — перелёт глобуса для index.html); лендинг имён не кодирует. */
const MARK_PART = /^(from|lon|t|fly)(=|$)/;
/** Класс инлайн-скрипта index.html: фон страницы чёрный, пока не начался вход. */
const BLACK = 'bb-entry-black';

type Timer = ReturnType<typeof setTimeout>;
let wait: { html: HTMLElement; cap: Timer; late: Timer; stop: () => void } | null = null;
let spinFrom: SpinFrom | null = null;

/** Число из параметра адреса: непустая строка и конечное число; иначе null. */
function finite(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Убрать метку из адреса: остальные части query остаются как были, байт в байт; hash и state тоже. */
function stripMark(win: Window): void {
  const { pathname, search, hash } = win.location;
  const kept = search
    .slice(1)
    .split('&')
    .filter((part) => part !== '' && !MARK_PART.test(part));
  const query = kept.length ? `?${kept.join('&')}` : '';
  win.history.replaceState(win.history.state, '', `${pathname}${query}${hash}`);
}

/** Чёрная накладка светлой темы: гаснет, как только приложение что-то отрисовало в #root. */
function showVeil(doc: Document): void {
  const veil = doc.createElement('div');
  veil.className = 'bb-entry-veil';
  veil.setAttribute('aria-hidden', 'true');
  // main.tsx — модуль в конце body: body уже есть
  doc.body.appendChild(veil);
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
  if (root) {
    // Первый узел в #root — первая отрисовка React (до неё #root пуст: вызов —
    // до createRoot): класс встаёт до кадра, в котором она появится на экране,
    // и накладка гаснет начиная с этого кадра.
    observer = new MutationObserver(out);
    observer.observe(root, { childList: true });
  }
  cap = setTimeout(out, VEIL_MAX_MS);
}

/**
 * Прочитать метку входа с лендинга при старте. now — сколько прошло от начала
 * документа (performance.now()): от него считаются ENTRY_CAP_MS и
 * GLOBE_LATE_MS. Возвращает тему входа или null (метки нет, «уменьшить
 * движение»). Исключений наружу не бросает.
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
    // «Назад» из кэша страниц, пока ожидание не снято: страницу показывают как
    // есть, без входа (её таймеры стояли, пока она лежала в кэше)
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) releaseLandingEntry();
    };
    win.addEventListener('pageshow', onShow);
    wait = {
      html,
      cap: setTimeout(releaseLandingEntry, Math.max(0, ENTRY_CAP_MS - now)),
      late: setTimeout(
        () => {
          if (!doc.querySelector('.bb-globe-layer.is-ready')) releaseLandingEntry();
        },
        Math.max(0, GLOBE_LATE_MS - now),
      ),
      stop: () => win.removeEventListener('pageshow', onShow),
    };
    setTimeout(dropEarlyLayer, EARLY_HOLD_MS);
    // Как можно раньше, пока React готовит первую отрисовку (обычно глобус уже
    // грузит инлайн-скрипт index.html — тогда без второго запроса). Глобуса не
    // будет — не ждём.
    import('./loadGlobe')
      .then((m) => m.loadGlobe())
      .then(
        (g) => {
          if (!g) releaseLandingEntry();
        },
        () => releaseLandingEntry(),
      );
    return 'dark';
  } catch {
    return null;
  }
}

/** Снять ожидание (тёмная тема): содержимое проявляется. Повторный вызов ничего не делает. */
export function releaseLandingEntry(): void {
  if (!wait) return;
  const { html, cap, late, stop } = wait;
  wait = null;
  clearTimeout(cap);
  clearTimeout(late);
  stop();
  // Слой глобуса, появившийся «сразу» (bb-globe-layer--instant: без переходов),
  // дальше живёт с обычными: на телефоне он приглушается до 0.6 вместе с
  // проявлением содержимого. Сначала расчёт стилей «до»: класс и первый кадр
  // могли встать в этой же задаче, и без него слой проявлялся бы 0,6 с.
  for (const layer of html.ownerDocument.querySelectorAll('.bb-globe-layer--instant')) {
    void getComputedStyle(layer).opacity;
    layer.classList.remove('bb-globe-layer--instant');
  }
  // bb-entry-in несёт переход и должен стоять в том же расчёте стилей, в котором
  // #root перестаёт быть прозрачным.
  html.classList.add('bb-entry-in');
  html.classList.remove('bb-entry', BLACK);
  setTimeout(() => html.classList.remove('bb-entry-in'), ENTRY_FADE_MS + 100);
  // ранний глобус: взят страницей — вращается дальше, не взят — гаснет и ждёт
  settleEarlyLayer();
}

/** Идёт ожидание глобуса (тёмная тема, ещё не снято). */
export function landingEntryPending(): boolean {
  return wait !== null;
}

/** Вращение с лендинга для глобуса этой страницы (тёмная тема, метка с верными lon и t); иначе null. */
export function landingSpinFrom(): SpinFrom | null {
  return spinFrom;
}
