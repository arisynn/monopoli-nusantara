import { DECKS } from "../lib/content.mjs";
export const ART_CONTEXTS = Object.freeze([
  "maju",
  "mundur",
  "penjara",
  "kereta",
  "perbaikan",
  "bebas-penjara",
  "uang-masuk",
  "utilitas",
  "dokter",
  "sertifikat",
  "uang",
  "pendidikan",
  "pajak",
  "hadiah",
  "perjalanan",
  "ulang-tahun",
]);
export const CARD_ART = Object.freeze({
  chance: Object.freeze([0, 0, 14, 0, 3, 3, 7, 6, 5, 1, 2, 4, 10, 3, 10, 6]),
  community: Object.freeze([
    0, 6, 8, 9, 5, 2, 6, 12, 15, 6, 8, 11, 6, 4, 13, 10,
  ]),
});
// Public revealed card effects only; never inspect the unrevealed deck.
export function cardIcon(card) {
  const catalog = DECKS[card.deck]?.[card.idx];
  if (catalog && catalog.title === card.title)
    return CARD_ART[card.deck][card.idx];
  if (card.jail) return 2;
  if (card.jailCard) return 5;
  if (card.back) return 1;
  if (card.nearest === "station") return 3;
  if (card.nearest === "utility") return 7;
  if (card.repair) return 4;
  if (card.move !== undefined)
    return card.move === 0 ? 0 : card.move === 5 ? 3 : 14;
  const title = (card.title || "").toLocaleLowerCase("id");
  if (/dokter|rumah sakit/.test(title)) return 8;
  if (/pendidikan/.test(title)) return 11;
  if (/pajak/.test(title)) return 12;
  if (/karya/.test(title)) return 9;
  if (/ulang tahun/.test(title)) return 15;
  if (/honor|lomba/.test(title)) return 13;
  return card.money > 0 || card.each > 0
    ? 6
    : card.money < 0 || card.each < 0
      ? 10
      : 9;
}
