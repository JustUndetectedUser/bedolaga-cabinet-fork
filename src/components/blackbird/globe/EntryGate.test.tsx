// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EntryGate: пока идёт вход с лендинга (#root скрыт, на экране глобус как
 * загрузка), экрану, которому ждать нечего, ожидание снимается сразу: экран
 * блокировки (обслуживание, бэкенд недоступен, подписка на канал, бан) и любая
 * страница без глобуса (не «Главная» и не вход). Иначе человек смотрел бы на
 * глобус до предела, а страница уже сломалась или показала другое.
 */

vi.mock('./loadGlobe', () => ({ loadGlobe: () => new Promise(() => {}) }));

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const html = () => document.documentElement.classList;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
  document.documentElement.className = 'dark';
  document.body.innerHTML = '<div id="root"></div><div class="bb-globe-layer is-ready"></div>';
  history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

/** Вход с лендинга начат (тёмная тема), EntryGate в роутере на странице path. */
async function gate(path: string, entry = true) {
  const { captureLandingEntry, landingEntryPending } = await import('./landingEntry');
  if (entry) expect(captureLandingEntry(window, 0)).toBe('dark');
  const { EntryGate } = await import('./EntryGate');
  const { useBlockingStore } = await import('../../../store/blocking');
  let go: (to: string) => void = () => {};
  function Nav() {
    go = useNavigate();
    return null;
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <EntryGate />
      <Nav />
    </MemoryRouter>,
  );
  return { landingEntryPending, useBlockingStore, go: (to: string) => act(() => go(to)) };
}

describe('EntryGate', () => {
  it('«Главная» и вход: ожидание идёт (его снимет страница)', async () => {
    for (const path of ['/', '/login']) {
      cleanup();
      vi.resetModules();
      document.documentElement.className = 'dark';
      history.replaceState(null, '', `/?from=landing&lon=40.5&t=${NOW - 300}`);
      const { landingEntryPending } = await gate(path);
      expect(landingEntryPending(), path).toBe(true);
      expect(html().contains('bb-entry'), path).toBe(true);
    }
  });

  it('страница без глобуса (/subscriptions): ожидание снято сразу', async () => {
    const { landingEntryPending } = await gate('/subscriptions');
    expect(landingEntryPending()).toBe(false);
    expect(html().contains('bb-entry')).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(true);
  });

  it('переход на страницу без глобуса во время ожидания: снято', async () => {
    const { landingEntryPending, go } = await gate('/');
    expect(landingEntryPending()).toBe(true);
    go('/login');
    expect(landingEntryPending()).toBe(true);
    go('/balance');
    expect(landingEntryPending()).toBe(false);
  });

  it('экран блокировки (обслуживание) во время ожидания: снято сразу', async () => {
    const { landingEntryPending, useBlockingStore } = await gate('/');
    expect(landingEntryPending()).toBe(true);
    act(() => useBlockingStore.setState({ blockingType: 'maintenance' }));
    expect(landingEntryPending()).toBe(false);
    expect(html().contains('bb-entry')).toBe(false);
  });

  it('экран блокировки уже стоит, когда приложение отрисовалось: снято сразу', async () => {
    const { useBlockingStore: store } = await import('../../../store/blocking');
    store.setState({ blockingType: 'maintenance' });
    const { landingEntryPending } = await gate('/');
    expect(landingEntryPending()).toBe(false);
  });

  // Страница упала при отрисовке: экран ошибки (ErrorBoundary) показывается сразу, а не за глобусом до предела
  it.each(['page', 'app'] as const)(
    'ошибка отрисовки (ErrorBoundary level=%s): ожидание снято сразу',
    async (level) => {
      const { landingEntryPending } = await gate('/');
      expect(landingEntryPending()).toBe(true);
      const { ErrorBoundary } = await import('../../ErrorBoundary');
      function Broken(): null {
        throw new Error('render failed');
      }
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <ErrorBoundary level={level}>
          <Broken />
        </ErrorBoundary>,
      );
      quiet.mockRestore();
      expect(landingEntryPending()).toBe(false);
      expect(html().contains('bb-entry')).toBe(false);
    },
  );

  it('входа с лендинга нет: ничего не делает', async () => {
    history.replaceState(null, '', '/subscriptions');
    const { landingEntryPending, useBlockingStore } = await gate('/subscriptions', false);
    act(() => useBlockingStore.setState({ blockingType: 'maintenance' }));
    expect(landingEntryPending()).toBe(false);
    expect(html().contains('bb-entry-in')).toBe(false);
    expect(html().contains('bb-entry')).toBe(false);
  });
});
