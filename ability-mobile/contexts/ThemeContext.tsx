import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';

export type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  theme: ThemeMode;
  loaded: boolean;
  setTheme: (next: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const STORAGE_KEY = 'ability_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (cancelled) return;
        setThemeState(normalizeTheme(stored));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const bg = theme === 'dark' ? '#020617' : '#f8fafc';
    SystemUI.setBackgroundColorAsync(bg).catch(() => {
      /* no-op */
    });
  }, [theme]);

  const setTheme = useCallback(async (next: ThemeMode) => {
    const normalized = normalizeTheme(next);
    setThemeState(normalized);
    await SecureStore.setItemAsync(STORAGE_KEY, normalized);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    await setTheme(next);
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      loaded,
      setTheme,
      toggleTheme,
    }),
    [theme, loaded, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
