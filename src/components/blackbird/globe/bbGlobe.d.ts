/**
 * BlackBird: типы модуля глобуса bb-globe.js. Исходник один — роль landing
 * инфраструктуры (roles/landing/files/site/assets/globe/bb-globe.js, опции в его
 * шапке); на домен кабинета его кладёт роль front, кабинет грузит его в рантайме
 * с VITE_GLOBE_BASE (loadGlobe.ts). Здесь — только то, чем пользуется кабинет.
 */

/** Число или функция от размера корня глобуса (ширина, высота в px). */
export type GlobeNumber = number | ((w: number, h: number) => number);

/** CSS-цвета: hex или rgb()/rgba(); oklch() и прочие модуль пропускает. */
export interface GlobeColors {
  /** точки суши, край шара, сетка */
  dot: string;
  /** обводки стран с серверами */
  ring: string;
  /** «дождь» и подкраска внутри стран */
  rain: string;
  /** во что растворяются стёртые места: фон корня под холстом */
  fade: string;
}

/** Где стоит глобус кабинета (макет D2): доли ширины/высоты корня и радиус в px. */
export interface GlobeView {
  focusX: number;
  focusY: number;
  zoom: number;
}

/** Проверка устройства: вращение, только если кадры укладываются в пороги. */
export interface GlobeSpinGate {
  frames: number;
  medianMs: number;
  minFps: number;
  recheckMs: number;
}

export interface BBGlobeOptions {
  dataUrl: string;
  servers?: Record<string, unknown>;
  /** °/с; > 0 — глобус вращается постоянно */
  spin?: number;
  /** продолжить вращение с долготы lon на момент at (Date.now()) */
  spinFrom?: { lon: number; at: number } | null;
  /** широта вида при вращении, ° */
  tilt?: number;
  labels?: boolean;
  nav?: 'map' | 'tabs' | 'none';
  /** не больше кадров в секунду; 0 — каждый кадр экрана */
  maxFps?: number;
  maxDpr?: number;
  /** пиксель вёрстки страницы (больше 1 — большое окно, кабинет в зуме): во столько раз крупнее точки суши */
  px?: number | ((w: number, h: number) => number);
  colors?: Partial<GlobeColors> | null;
  spinGate?: GlobeSpinGate | false;
  /** один раз, после первого полностью нарисованного кадра */
  onReady?: (() => void) | null;
  /** после первого полного кадра — ни одного, пока не resume() (ранний глобус входа с лендинга) */
  hold?: boolean;
  /**
   * Перелёт, начатый страницей до этой (лендинг, flyTo): где её глобус стоял в начале
   * (x, y, R в px корня, lat — широта вида), когда перелёт начался (at) и сколько длится
   * (ms), когда та страница перестала рисовать (cut); время — Date.now(). Первый кадр —
   * то, что она показала последним; дальше перелёт и вращение идут с этого места.
   */
  arrive?: {
    x: number;
    y: number;
    R: number;
    lat: number;
    at: number;
    ms: number;
    cut: number;
  } | null;
  focusX?: GlobeNumber;
  focusY?: GlobeNumber;
  zoom?: GlobeNumber;
}

export interface BBGlobeInstance {
  /** проверка устройства остановила вращение: стоит последний кадр */
  readonly still: boolean;
  /** данные не загрузились: глобус уничтожил себя сам */
  readonly failed?: boolean;
  /** точки суши рисует GPU (WebGL): кадр дешёвый (нет у модуля до GPU — потому необязателен) */
  readonly gpu?: boolean;
  /** BlackBird: центр глобуса в px корня (для метки возврата на лендинг, landingReturn.ts) */
  readonly cx?: number;
  readonly cy?: number;
  /** BlackBird: вид — долгота и широта в центре, радиус в px; null, пока данные не пришли */
  readonly view?: { lon: number; lat: number; R: number } | null;
  setColors(colors: Partial<GlobeColors>): void;
  /**
   * BlackBird: свет под курсором вокруг точек суши; free(x, y) — курсор (px окна) над
   * свободным местом (нет у модуля до него — потому необязателен)
   */
  hoverOn?(free?: (x: number, y: number) => boolean): void;
  /** конец hold: вращение дальше с того места, где стоял (нет у модуля до hold — потому необязателен) */
  resume?(): void;
  /**
   * начать проверку устройства сейчас (или заново): для глобуса, построенного до
   * приложения без spinGate (нет у модуля до неё — потому необязателен)
   */
  checkDevice?(spinGate: GlobeSpinGate): void;
  destroy(): void;
}

export type BBGlobeConstructor = new (
  root: HTMLElement,
  options: BBGlobeOptions,
) => BBGlobeInstance;

/** Экспорты модуля, нужные кабинету. */
export interface BBGlobeModule {
  BBGlobe: BBGlobeConstructor;
  cabinetView: (w: number, h: number) => GlobeView;
  /**
   * Пиксель вёрстки окна w x h: больше 1 в окне больше 1440x800 по обеим
   * сторонам (там кабинет в зуме, index.html page-zoom). У модуля до
   * масштаба больших мониторов его нет.
   */
  layoutPx?: (w: number, h: number) => number;
  /**
   * Будут ли точки суши у глобуса, построенного сейчас (с непрозрачным
   * colors.fade), на GPU. Спрашивает инлайн-скрипт index.html: с GPU глобус
   * строится до приложения. У модуля до этой функции её нет.
   */
  gpuDots?: () => boolean;
}
