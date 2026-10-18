const UINT32_RANGE = 0x100000000;

function word(source = globalThis.crypto) {
  if (typeof source?.getRandomValues !== "function")
    throw Error("Sumber acak aman tidak tersedia. Buka game melalui HTTPS.");
  return source.getRandomValues(new Uint32Array(1))[0];
}
export function secureRandom() {
  return word() / UINT32_RANGE;
}

// Rejection sampling gives every outcome exactly the same number of uint32
// inputs. No timestamp, public match seed or Math.random fallback is used.
export function secureRandomInt(maxExclusive, source = globalThis.crypto) {
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive < 1 ||
    maxExclusive > UINT32_RANGE
  )
    throw Error("Batas acak tidak valid.");
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  let value;
  do {
    value = word(source);
  } while (value >= limit);
  return value % maxExclusive;
}
export function randomIndex(maxExclusive, rng = secureRandom) {
  if (rng === secureRandom) return secureRandomInt(maxExclusive);
  // Explicit RNG injection is retained for reproducible rule tests and bot
  // simulations. Production sessions and online jobs use secureRandom directly.
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw Error("Nilai acak tidak valid.");
  return Math.floor(value * maxExclusive);
}
