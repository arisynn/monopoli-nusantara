import test from "node:test";
import assert from "node:assert/strict";
import { secureRandom, secureRandomInt, randomIndex } from "../lib/random.mjs";
import { createGame, command } from "../lib/game.mjs";
const sequence = (values) => ({
  getRandomValues(array) {
    assert(values.length, "unexpected extra entropy read");
    array[0] = values.shift();
    return array;
  },
});
test("secure die sampling rejects the biased uint32 tail and covers exact boundary values", () => {
  for (let face = 0; face < 6; face++)
    assert.equal(secureRandomInt(6, sequence([face])), face);
  const values = [0xffffffff, 0xfffffffe, 0xfffffffc, 0xfffffffb];
  assert.equal(secureRandomInt(6, sequence(values)), 5);
  assert.equal(values.length, 0);
  assert.equal(secureRandomInt(1, sequence([0xffffffff])), 0);
  assert.equal(
    secureRandomInt(0x100000000, sequence([0xffffffff])),
    0xffffffff,
  );
});
test("secure randomness fails closed and explicit simulations retain deterministic injected RNG", () => {
  for (const bound of [0, -1, 1.1, NaN, Infinity, 0x100000001])
    assert.throws(() => secureRandomInt(bound));
  assert.throws(() => secureRandomInt(6, {}), /acak aman/);
  assert.equal(
    randomIndex(6, () => 0),
    0,
  );
  assert.equal(
    randomIndex(6, () => 0.2),
    1,
  );
  assert.equal(
    randomIndex(6, () => 1 - Number.EPSILON),
    5,
  );
  for (const value of [-0.1, 1, NaN])
    assert.throws(() => randomIndex(6, () => value));
  const s = createGame(
    {
      players: [
        { name: "A", controller: "human" },
        { name: "B", controller: "human" },
      ],
      startingRoll: false,
    },
    () => 0.2,
  );
  assert.deepEqual(command(s, 0, { type: "ROLL" }, () => 0.2).dice, [2, 2]);
});
test("default engine dice use fresh cryptographic words without Math.random or serialized seeds", () => {
  const s = createGame(
    {
      players: [
        { name: "A", controller: "human" },
        { name: "B", controller: "human" },
      ],
      startingRoll: false,
    },
    () => 0.2,
  );
  const crypto = globalThis.crypto,
    original = crypto.getRandomValues,
    mathRandom = Math.random;
  let draws = 0;
  const values = [0xffffffff, 0, 1];
  try {
    Math.random = () => {
      throw Error("Math.random must not be used");
    };
    crypto.getRandomValues = (array) => {
      draws++;
      array[0] = values.shift() ?? 3;
      return array;
    };
    const next = command(s, 0, { type: "ROLL" });
    assert.deepEqual(next.dice, [1, 2]);
    assert.equal(draws, 3);
    assert(!Object.keys(next).some((k) => /seed|rng/i.test(k)));
    const f = secureRandom();
    assert(f >= 0 && f < 1);
  } finally {
    crypto.getRandomValues = original;
    Math.random = mathRandom;
  }
});
