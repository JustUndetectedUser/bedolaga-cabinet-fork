// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Обёртка: слой глобуса (CabinetGlobeImpl) — отдельным чанком, со своим
 * Suspense. Пока чанк грузится и если он не загрузился — ничего, страница как
 * без глобуса, ошибка наружу не уходит.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.doUnmock('./CabinetGlobeImpl');
});

describe('CabinetGlobe (обёртка)', () => {
  it('рисует слой из своего чанка с теми же props', async () => {
    const seen = vi.fn();
    vi.doMock('./CabinetGlobeImpl', () => ({
      CabinetGlobe: (p: { keepOnly?: boolean; onReady?: () => void }) => {
        seen(p);
        return <i data-testid="impl" />;
      },
    }));
    const { CabinetGlobe } = await import('./CabinetGlobe');
    const onReady = vi.fn();
    const view = render(
      <div>
        <CabinetGlobe keepOnly onReady={onReady} />
        <p>страница</p>
      </div>,
    );
    // страница не ждёт чанк
    expect(view.getByText('страница')).toBeTruthy();
    await act(async () => {});
    expect(view.getByTestId('impl')).toBeTruthy();
    expect(seen).toHaveBeenLastCalledWith({ keepOnly: true, onReady });
  });

  it('вход с лендинга (ранний глобус есть): чанк запрошен сразу, до страницы', async () => {
    const loaded = vi.fn();
    vi.doMock('./CabinetGlobeImpl', () => {
      loaded();
      return { CabinetGlobe: () => null };
    });
    (globalThis as Record<string, unknown>).__bbGlobeEarly = { base: '/bb-globe/' };
    try {
      await import('./CabinetGlobe');
      await act(async () => {});
      expect(loaded).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as Record<string, unknown>).__bbGlobeEarly;
    }
  });

  it('без входа чанк ждёт страницу', async () => {
    const loaded = vi.fn();
    vi.doMock('./CabinetGlobeImpl', () => {
      loaded();
      return { CabinetGlobe: () => null };
    });
    await import('./CabinetGlobe');
    await act(async () => {});
    expect(loaded).not.toHaveBeenCalled();
  });

  it('чанк не загрузился: ничего, без ошибки', async () => {
    vi.doMock('./CabinetGlobeImpl', () => {
      throw new Error('chunk failed');
    });
    const { CabinetGlobe } = await import('./CabinetGlobe');
    const view = render(
      <div>
        <CabinetGlobe />
        <p>страница</p>
      </div>,
    );
    await act(async () => {});
    expect(view.getByText('страница')).toBeTruthy();
    expect(view.container.querySelector('i')).toBeNull();
  });
});
