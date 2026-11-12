// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ссылка «Нет доступа к Telegram?» на экране входа: есть только при заданном
 * VITE_GUEST_URL и не в Mini App; ведёт обычным переходом на страницу ключа.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderLink(url: string | undefined, inTelegram = false) {
  vi.stubEnv('VITE_GUEST_URL', url ?? '');
  const { default: GuestKeyLink } = await import('./GuestKeyLink');
  return render(<GuestKeyLink inTelegram={inTelegram} />);
}

describe('GuestKeyLink', () => {
  it('ведёт на страницу разового ключа', async () => {
    await renderLink('/guest');
    expect(screen.getByText(/Нет доступа к Telegram/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Получить разовый ключ' });
    expect(link.getAttribute('href')).toBe('/guest');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('без VITE_GUEST_URL ссылки нет', async () => {
    const { container } = await renderLink(undefined);
    expect(container.innerHTML).toBe('');
  });

  it('в Mini App ссылки нет', async () => {
    const { container } = await renderLink('/guest', true);
    expect(container.innerHTML).toBe('');
  });
});
