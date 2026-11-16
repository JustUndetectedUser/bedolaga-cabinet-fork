// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Вкладка t.me при входе через бота: кнопка открывает её сама и запоминает,
 * после входа кабинет её закрывает. Чужой выбор человека (Ctrl-клик) и
 * блокировщик всплывающих окон поведение ссылки не ломают.
 */

const URL = 'https://t.me/example_bot?start=webauth_token';

type FakeWindow = { closed: boolean; close: ReturnType<typeof vi.fn> };

function fakeWindow(): FakeWindow {
  const win: FakeWindow = {
    closed: false,
    close: vi.fn(() => {
      win.closed = true;
    }),
  };
  return win;
}

const open = vi.fn();
const { inTelegram } = vi.hoisted(() => ({ inTelegram: { value: false } }));

vi.mock('@/hooks/useTelegramSDK', () => ({
  isInTelegramWebApp: () => inTelegram.value,
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('open', open);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  open.mockReset();
  inTelegram.value = false;
});

/** Ссылка как в TelegramLoginButton; возвращает, отменён ли обычный переход. */
async function clickLink(click?: MouseEventInit) {
  const { openBotWindow, closeBotWindow } = await import('./botWindow');
  render(
    <a
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => openBotWindow(event, URL)}
    >
      bot
    </a>,
  );
  const followed = fireEvent.click(screen.getByText('bot'), click);
  return { prevented: !followed, closeBotWindow };
}

describe('botWindow', () => {
  it('opens the bot tab itself and closes it after the login', async () => {
    const win = fakeWindow();
    open.mockReturnValue(win);

    const { prevented, closeBotWindow } = await clickLink();
    expect(open).toHaveBeenCalledWith(URL, '_blank');
    expect(prevented).toBe(true); // иначе ссылка открыла бы вторую вкладку

    closeBotWindow();
    expect(win.close).toHaveBeenCalledTimes(1);

    closeBotWindow(); // оба опроса могут сообщить об успехе: второй раз закрывать нечего
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('leaves the plain link alone when the popup is blocked', async () => {
    open.mockReturnValue(null);

    const { prevented, closeBotWindow } = await clickLink();
    expect(prevented).toBe(false);
    expect(() => closeBotWindow()).not.toThrow();
  });

  it('does not touch a tab the person opened with a modifier key', async () => {
    const { prevented } = await clickLink({ ctrlKey: true });
    expect(open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it('keeps the plain link inside the Telegram Mini App', async () => {
    inTelegram.value = true;

    const { prevented } = await clickLink();
    expect(open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it('does not close a tab the person has already closed', async () => {
    const win = fakeWindow();
    open.mockReturnValue(win);

    const { closeBotWindow } = await clickLink();
    win.closed = true;
    closeBotWindow();
    expect(win.close).not.toHaveBeenCalled();
  });

  it('survives a tab that refuses to close', async () => {
    const win = fakeWindow();
    win.close.mockImplementation(() => {
      throw new Error('denied');
    });
    open.mockReturnValue(win);

    const { closeBotWindow } = await clickLink();
    expect(() => closeBotWindow()).not.toThrow();
  });
});
