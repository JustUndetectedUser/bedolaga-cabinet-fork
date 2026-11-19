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
  setColors(colors: Partial<GlobeColors>): void;
  /** конец hold: вращение дальше с того места, где стоял (нет у модуля до hold — потому необязателен) */
  resume?(): void;
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
   * Будут ли точки суши у глобуса, построенного сейчас (с непрозрачным
   * colors.fade), на GPU. Спрашивает инлайн-скрипт index.html: с GPU глобус
   * строится до приложения. У модуля до этой функции её нет.
   */
  gpuDots?: () => boolean;
}
