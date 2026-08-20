/**
 * Every asset URL has to go through here.
 *
 * The site is served from a sub path (`/games/arenarumble/`) on GitHub Pages,
 * so a hard coded `/assets/...` would 404 in production while still working in
 * `vite dev`. `import.meta.env.BASE_URL` is replaced at build time with the
 * `base` from vite.config.ts.
 */
const BASE = import.meta.env.BASE_URL;

export function asset(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return `${BASE}${clean}`;
}

/** The public URL of the game itself, used for the invite link. */
export function siteUrl(): string {
  return new URL(BASE, window.location.origin).toString();
}
