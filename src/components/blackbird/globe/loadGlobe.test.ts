import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Загрузка глобуса в рантайме: config.json ({ v, servers }) с базы, затем
 * модуль bb-globe.js?v=<v>. Пустая база или любой сбой (404, битый JSON, не тот
 * формат, модуль не загрузился или без нужных экспортов) — null, без
 * исключений наружу. Результат один на страницу: повторный вызов не ходит в сеть.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SERVERS = { DE: { name: 'Германия', region: 'eu' } };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

class FakeGlobe {}
const cabinetView = () => ({ focusX: 0.75, focusY: 0.55, zoom: 620 });

async function load() {
  return (await import('./loadGlobe')).loadGlobe;
}

describe('loadGlobe', () => {
  it('пустая база — null без запросов', async () => {
    const loadGlobe = await load();
    const importer = vi.fn();
    expect(await loadGlobe('', importer)).toBeNull();
    expect(await loadGlobe(undefined, importer)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
  });

  it('база из VITE_GLOBE_BASE; пустая переменная — глобуса нет', async () => {
    vi.stubEnv('VITE_GLOBE_BASE', '');
    const loadGlobe = await load();
    expect(await loadGlobe()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 у config.json — null', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Not Found' }, 404));
    const loadGlobe = await load();
    const importer = vi.fn();
    expect(await loadGlobe('/bb-globe/', importer)).toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it('битый JSON (например, index.html кабинета вместо config.json) — null', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html><html></html>', { status: 200 }));
    const loadGlobe = await load();
    expect(await loadGlobe('/bb-globe/', vi.fn())).toBeNull();
  });

  it.each([
    { body: null },
    { body: [] },
    { body: { v: 'abc' } },
    { body: { servers: SERVERS } },
    { body: { v: '', servers: SERVERS } },
    { body: { v: 'abc', servers: [] } },
    { body: { v: 'abc', servers: null } },
  ])('config.json не того вида — null: $body', async ({ body }) => {
    fetchMock.mockResolvedValue(json(body));
    const loadGlobe = await load();
    const importer = vi.fn();
    expect(await loadGlobe('/bb-globe/', importer)).toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it('сеть упала — null', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const loadGlobe = await load();
    expect(await loadGlobe('/bb-globe/', vi.fn())).toBeNull();
  });

  it('ошибка import модуля — null', async () => {
    fetchMock.mockResolvedValue(json({ v: 'abc123', servers: SERVERS }));
    const loadGlobe = await load();
    const importer = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    expect(await loadGlobe('/bb-globe/', importer)).toBeNull();
  });

  it('модуль без BBGlobe или cabinetView — null', async () => {
    fetchMock.mockResolvedValue(json({ v: 'abc123', servers: SERVERS }));
    const loadGlobe = await load();
    expect(await loadGlobe('/bb-globe/', vi.fn().mockResolvedValue({ cabinetView }))).toBeNull();
  });

  it('успех: модуль и данные по версии из config.json, страны оттуда же', async () => {
    fetchMock.mockResolvedValue(json({ v: 'abc123', servers: SERVERS }));
    const loadGlobe = await load();
    const importer = vi.fn().mockResolvedValue({ BBGlobe: FakeGlobe, cabinetView });
    const globe = await loadGlobe('/bb-globe/', importer);
    expect(globe).toEqual({
      BBGlobe: FakeGlobe,
      cabinetView,
      servers: SERVERS,
      dataUrl: '/bb-globe/globe-data.json?v=abc123',
    });
    expect(importer).toHaveBeenCalledWith('/bb-globe/bb-globe.js?v=abc123');
    // Один аргумент: режим и учётные данные по умолчанию (cors, same-origin) — те же,
    // что у <link rel="preload" as="fetch" crossorigin>, иначе браузер запросит дважды.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(['/bb-globe/config.json']);
  });

  it('результат один на страницу: второй вызов без запросов', async () => {
    fetchMock.mockResolvedValue(json({ v: 7, servers: SERVERS }));
    const loadGlobe = await load();
    const importer = vi.fn().mockResolvedValue({ BBGlobe: FakeGlobe, cabinetView });
    const [a, b] = await Promise.all([
      loadGlobe('/bb-globe/', importer),
      loadGlobe('/bb-globe/', importer),
    ]);
    const c = await loadGlobe('/bb-globe/', importer);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a?.dataUrl).toBe('/bb-globe/globe-data.json?v=7');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('сбой тоже запоминается: на каждой «Главной» заново в сеть не ходит', async () => {
    fetchMock.mockResolvedValue(json({}, 404));
    const loadGlobe = await load();
    expect(await loadGlobe('/bb-globe/', vi.fn())).toBeNull();
    expect(await loadGlobe('/bb-globe/', vi.fn())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('loadGlobe: ранний глобус (index.html, вход с лендинга)', () => {
  const early = (load: Promise<unknown>, base = '/bb-globe/') => {
    (globalThis as Record<string, unknown>).__bbGlobeEarly = {
      base,
      load,
      layer: null,
      dropped: false,
      adopted: false,
    };
  };

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__bbGlobeEarly;
  });

  it('та же база: config и модуль из раннего, своих запросов нет', async () => {
    early(
      Promise.resolve({
        config: { v: 'abc', servers: SERVERS },
        mod: { BBGlobe: FakeGlobe, cabinetView },
      }),
    );
    const loadGlobe = await load();
    const importer = vi.fn();
    expect(await loadGlobe('/bb-globe/', importer)).toEqual({
      BBGlobe: FakeGlobe,
      cabinetView,
      servers: SERVERS,
      dataUrl: '/bb-globe/globe-data.json?v=abc',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
  });

  it('ранний с неверным config или модулем — null, без повторных запросов', async () => {
    early(
      Promise.resolve({
        config: { v: 'abc', servers: [] },
        mod: { BBGlobe: FakeGlobe, cabinetView },
      }),
    );
    const loadGlobe = await load();
    const importer = vi.fn();
    expect(await loadGlobe('/bb-globe/', importer)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
  });

  it('ранний не загрузился (null) — загрузка как без него', async () => {
    early(Promise.resolve(null));
    fetchMock.mockResolvedValue(json({ v: 'abc', servers: SERVERS }));
    const loadGlobe = await load();
    const importer = vi.fn().mockResolvedValue({ BBGlobe: FakeGlobe, cabinetView });
    expect(await loadGlobe('/bb-globe/', importer)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('другая база — ранний не используется', async () => {
    early(Promise.resolve({ config: { v: 'x', servers: SERVERS }, mod: {} }), '/other/');
    fetchMock.mockResolvedValue(json({ v: 'abc', servers: SERVERS }));
    const loadGlobe = await load();
    const importer = vi.fn().mockResolvedValue({ BBGlobe: FakeGlobe, cabinetView });
    expect((await loadGlobe('/bb-globe/', importer))?.dataUrl).toBe(
      '/bb-globe/globe-data.json?v=abc',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
