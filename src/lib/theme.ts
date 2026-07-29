export type ThemePreference = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'chabiko_theme';

export function resolveTheme(
  storedTheme: string | null,
  prefersDark: boolean,
): ThemePreference {
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  return prefersDark ? 'dark' : 'light';
}

export function getNextTheme(currentTheme: string | undefined): ThemePreference {
  return currentTheme === 'dark' ? 'light' : 'dark';
}
