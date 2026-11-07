// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Логотип в шапке: не на главной ведёт на главную, на главной — на лендинг
 * (в вебе в той же вкладке, в Mini App — через openLink Telegram).
 */

const { openLink, assign, platform } = vi.hoisted(() => ({
  openLink: vi.fn(),
  assign: vi.fn(),
  platform: { value: 'web' as 'web' | 'telegram' },
}));

vi.mock('@/platform', () => ({
  usePlatform: () => ({ platform: platform.value, openLink }),
}));

const LANDING = 'https://landing.example/';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('location', { ...window.location, assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  openLink.mockReset();
  assign.mockReset();
  platform.value = 'web';
});

async function renderAt(path: string, landing: string | undefined) {
  if (landing !== undefined) vi.stubEnv('VITE_LANDING_URL', landing);
  const { useLogoClick } = await import('./useLogoClick');
  const onClick = vi.fn();

  function Logo() {
    const handle = useLogoClick(onClick);
    return (
      <Link to="/" onClick={handle}>
        logo
      </Link>
    );
  }

  render(
    <MemoryRouter initialEntries={[path]}>
      <Logo />
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/subscriptions" element={<p>subscriptions</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('logo'));
  return onClick;
}

describe('логотип в шапке', () => {
  it('не на главной — переход на главную', async () => {
    const onClick = await renderAt('/subscriptions', LANDING);
    expect(screen.getByText('home')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('на главной в вебе — лендинг в той же вкладке', async () => {
    const onClick = await renderAt('/', LANDING);
    expect(assign).toHaveBeenCalledWith(LANDING);
    expect(openLink).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('на главной в Telegram — лендинг через openLink', async () => {
    platform.value = 'telegram';
    await renderAt('/', LANDING);
    expect(openLink).toHaveBeenCalledWith(LANDING);
    expect(assign).not.toHaveBeenCalled();
  });

  it('без VITE_LANDING_URL — как в апстриме', async () => {
    await renderAt('/', '');
    expect(screen.getByText('home')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
  });
});
