let copying = false;
const editable = (target) =>
  !!target?.closest?.("input,textarea,[contenteditable=true]");

export function installSelectionGuard(doc = document) {
  // Keep form editing, paste, autofill and assistive navigation intact.
  const copy = (e) => {
    if (!copying && !editable(e.target)) e.preventDefault();
  };
  const context = (e) => {
    if (!editable(e.target)) e.preventDefault();
  };
  doc.addEventListener("copy", copy);
  doc.addEventListener("contextmenu", context);
  return () => {
    doc.removeEventListener("copy", copy);
    doc.removeEventListener("contextmenu", context);
  };
}

export async function copyRoomCode(
  code,
  { doc = document, nav = navigator } = {},
) {
  const text = String(code || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(text)) return false;
  try {
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Some Android browsers deny Clipboard API but allow the gesture fallback. */
  }
  const focus = doc.activeElement,
    start = focus?.selectionStart,
    end = focus?.selectionEnd;
  const selection = doc.getSelection?.();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const field = doc.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.className = "clipboard-helper";
  // A modal dialog makes body siblings inert, so place the helper inside it.
  (doc.querySelector("dialog[open]") || doc.body).append(field);
  try {
    copying = true;
    field.focus({ preventScroll: true });
    field.select();
    return doc.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    copying = false;
    field.remove();
    focus?.focus?.({ preventScroll: true });
    try {
      focus?.setSelectionRange(start, end);
    } catch {}
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
