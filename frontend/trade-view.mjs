import { enhanceSelections } from "./selections.mjs";

// Keep cash inputs mounted while room revisions update the rest of a draft.
export function updateTradeBody(root, markup) {
  return updateFormBody(root, markup, "[data-trade-side]");
}

export function updateAssetBody(root, markup) {
  return updateFormBody(root, markup, "[name=assetSearch]");
}

function updateFormBody(root, markup, selector) {
  const current = root.querySelector(selector);
  if (!current) return false;
  const template = root.ownerDocument.createElement("template");
  template.innerHTML = markup;
  const incoming = template.content.querySelector(selector);
  if (!incoming || current.name !== incoming.name) return false;
  patchChildren(root, template.content);
  enhanceSelections(root);
  return true;
}

function patchChildren(current, incoming) {
  const old = [...current.childNodes],
    next = [...incoming.childNodes];
  for (let i = 0; i < Math.max(old.length, next.length); i++) {
    if (!next[i]) old[i].remove();
    else if (!old[i]) current.append(next[i]);
    else patch(old[i], next[i]);
  }
}

function patch(current, incoming) {
  if (
    current.nodeType === 1 &&
    current.classList.contains("game-selection") &&
    incoming.nodeName === "SELECT"
  ) {
    const old = current.querySelector("select");
    if (
      old?.innerHTML !== incoming.innerHTML ||
      old?.disabled !== incoming.disabled ||
      old?.value !== incoming.value
    )
      current.replaceWith(incoming);
    return;
  }
  if (
    current.nodeType !== incoming.nodeType ||
    current.nodeName !== incoming.nodeName
  ) {
    current.replaceWith(incoming);
    return;
  }
  if (current.nodeType === 3) {
    if (current.data !== incoming.data) current.data = incoming.data;
    return;
  }
  if (current.nodeType !== 1) return;
  for (const { name } of [...current.attributes]) {
    if (current.tagName === "DETAILS" && name === "open") continue;
    if (!incoming.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const { name, value } of incoming.attributes)
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  if (current.tagName === "INPUT") {
    if (current.value !== incoming.value) current.value = incoming.value;
    return;
  }
  patchChildren(current, incoming);
}
