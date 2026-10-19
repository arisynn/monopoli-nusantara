// Remove only navigation controls; command buttons (including PASS, ACK,
// decline, cancel trade and bankrupt) retain their game meaning.
export function decisionFooter(markup = "") {
  return markup.replace(
    /<button\b[^>]*data-action="(?:close|dismissEvent|saveTradeDraft|pickerDone)"[^>]*>[\s\S]*?<\/button>/g,
    "",
  );
}
export const passivePopup = (p) =>
  !!p && (p.kind === "settlement" || (p.kind === "event" && !p.interactive));
export const readingCard = (p) =>
  !!p && (p.kind === "card" || (p.kind === "event" && p.interactive));
export const dismissalAction = (p) =>
  p.kind === "picker"
    ? "pickerDone"
    : p.kind === "trade"
      ? "saveTradeDraft"
      : "close";
export const dismissalLabel = (p) =>
  p.preview || ["picker", "botChoice", "buildOrder"].includes(p.kind)
    ? "Kembali"
    : "Tutup";
