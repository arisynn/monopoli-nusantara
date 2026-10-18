import { lucideIcon } from "./lucide-icons.mjs";

export const icon = lucideIcon;
export const colors = [
  "#218beb",
  "#e67379",
  "#50a991",
  "#d8a337",
  "#9a7ac6",
  "#db82ad",
];
const BOT_AVATARS = ["raka", "bima", "sari", "nusa", "apex", "kresna"];
export function avatar(identity = 0) {
  const name =
    typeof identity === "string" && ["human", ...BOT_AVATARS].includes(identity)
      ? identity
      : BOT_AVATARS[
          Number.isInteger(identity) && identity >= 0 ? identity % 6 : 0
        ];
  return `<span class="avatar animal-avatar" style="background-image:url(/assets/avatars/${name}.webp)" aria-hidden="true"></span>`;
}

// Bots keep their persona in every view; human portraits use the unoccupied art.
export function playerAvatar(player, players = []) {
  if (player?.controller === "bot" && BOT_AVATARS.includes(player.botPersona))
    return avatar(player.botPersona);
  const available = [
    "human",
    ...BOT_AVATARS.filter(
      (name) =>
        !players.some((p) => p.controller === "bot" && p.botPersona === name),
    ),
  ];
  const index = players
    .filter(
      (p) => p.controller !== "bot" || !BOT_AVATARS.includes(p.botPersona),
    )
    .findIndex((p) => p.id === player?.id);
  return avatar(available[Math.max(0, index) % available.length]);
}

// Numeric token identity is unchanged; only its visual sprite is replaced.
export function pawnArt(pawn, alt = "") {
  const id = Number.isInteger(pawn) && pawn >= 0 && pawn < 6 ? pawn : 0;
  const safe = String(alt).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
  return `<span class="pawn-sprite" style="--pawn-x:${(id % 3) * 50}%;--pawn-y:${Math.floor(id / 3) * 100}%" ${alt ? `role="img" aria-label="${safe}"` : 'aria-hidden="true"'}></span>`;
}

// The original transparent PNG atlas is shared by board, bank and certificates.
const BUILDING_CROPS = Object.freeze({
  house: "135 173 175 149",
  hotel: "586 104 156 230",
});
export function buildingArt(
  kind = "house",
  { size = 19, x, y, board = false } = {},
) {
  const name = kind === "hotel" ? "hotel" : "house";
  return `<svg class="${board ? "building-image" : "building-token " + name}" ${x === undefined ? "" : `x="${x}" y="${y}"`} width="${size}" height="${size}" viewBox="${BUILDING_CROPS[name]}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href="/assets/buildings/building-icons.png" width="888" height="444"/></svg>`;
}
export function eventArt(index, extra = "") {
  return `<span class="card-illustration ${extra}" style="--card-x:${((index % 4) * 100) / 3}%;--card-y:${(Math.floor(index / 4) * 100) / 3}%" aria-hidden="true"></span>`;
}
