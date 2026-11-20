// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Логотип в шапке: не на главной ведёт на главную, на главной — на лендинг
 * (в вебе в той же вкладке, в Mini App — через openLink Telegram), в теме
 * кабинета: ?theme=light|dark по классу <html> в момент клика (лендинг её
 * применяет и запоминает).
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
  document.documentElement.className = '';
});

async function renderAt(path: string, landing: string | undefined, click?: MouseEventInit) {
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
  fireEvent.click(screen.getByText('logo'), click);
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

  it('на главной в вебе — лендинг в той же вкладке, в теме кабинета', async () => {
    document.documentElement.className = 'dark';
    const onClick = await renderAt('/', LANDING);
    expect(assign).toHaveBeenCalledWith('https://landing.example/?theme=dark');
    expect(openLink).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('светлая тема — ?theme=light; прочие части адреса лендинга на месте', async () => {
    document.documentElement.className = 'light';
    await renderAt('/', 'https://landing.example/?utm=x#top');
    expect(assign).toHaveBeenCalledWith('https://landing.example/?utm=x&theme=light#top');
  });

  it('на главной в Telegram — лендинг через openLink, тоже с темой', async () => {
    platform.value = 'telegram';
    document.documentElement.className = 'light';
    await renderAt('/', LANDING);
    expect(openLink).toHaveBeenCalledWith('https://landing.example/?theme=light');
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    'на главной клик с модификатором %o — «в новой вкладке», текущую на лендинг не уводим',
    async (click) => {
      const onClick = await renderAt('/', LANDING, click);
      expect(assign).not.toHaveBeenCalled();
      expect(openLink).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledOnce();
    },
  );

  it('на главной в вебе с глобусом на экране — кабинет гаснет и уходит с меткой возврата', async () => {
    document.documentElement.className = 'dark';
    const { setReturnLayer } = await import('./globe/landingReturn');
    const globe = { cx: 960, cy: 361.94, view: { lon: 10, lat: 30, R: 580 } };
    setReturnLayer({ el: document.createElement('div'), globe: globe as never, shown: () => true });
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await renderAt('/', LANDING);
    expect(assign).toHaveBeenCalledWith(
      'https://landing.example/?theme=dark&from=cabinet&lon=10.00&t=1700000000000&pose=960.0,361.9,580.0,30.00',
    );
    expect(document.documentElement.classList.contains('bb-leaving')).toBe(true);
    vi.restoreAllMocks();
  });

  it('в Telegram с глобусом — openLink только с темой, кабинет не гаснет', async () => {
    platform.value = 'telegram';
    document.documentElement.className = 'dark';
    const { setReturnLayer } = await import('./globe/landingReturn');
    const globe = { cx: 960, cy: 361.94, view: { lon: 10, lat: 30, R: 580 } };
    setReturnLayer({ el: document.createElement('div'), globe: globe as never, shown: () => true });
    await renderAt('/', LANDING);
    expect(openLink).toHaveBeenCalledWith('https://landing.example/?theme=dark');
    expect(document.documentElement.classList.contains('bb-leaving')).toBe(false);
  });

  it('без VITE_LANDING_URL — как в апстриме', async () => {
    await renderAt('/', '');
    expect(screen.getByText('home')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
  });
});
