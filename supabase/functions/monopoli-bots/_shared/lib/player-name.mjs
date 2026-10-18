// Explicit human display names are preferences, never assigned by the game.
export const PLAYER_NAME_KEY = 'nusantara-player-name';
export function normalizePlayerName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
export function requirePlayerName(value) {
  const name = normalizePlayerName(value);
  const length = Array.from(name).length;
  if (length < 2 || length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(name))
    throw Error('Isi nama pemain sendiri (2–24 karakter) di Profil Saya.');
  return name;
}
export function loadPlayerName(storage = globalThis.localStorage) {
  try { const name = storage?.getItem(PLAYER_NAME_KEY); return name ? requirePlayerName(name) : ''; }
  catch { return ''; }
}
export function savePlayerName(value, storage = globalThis.localStorage) {
  const name = requirePlayerName(value);
  try { storage?.setItem(PLAYER_NAME_KEY, name); }
  catch { /* Private mode may reject writes; the in-memory name remains usable. */ }
  return name;
}
