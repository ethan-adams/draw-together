import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'draw-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/*
 * Theme state. Follows the OS preference by default; an explicit pick from the
 * toggle overrides it (persisted, and reflected as data-theme on <html> so the
 * CSS tokens flip). A tiny inline script in index.html sets data-theme before
 * first paint, so there's no flash on load.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [explicit, setExplicit] = useState<Theme | null>(() => stored());
  const [sys, setSys] = useState<Theme>(() => systemTheme());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t; // set synchronously so the canvas re-reads the right tokens
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    setExplicit(t);
  };

  return [explicit ?? sys, setTheme];
}
