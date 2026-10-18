// Patch the current auction in place. Bids must not recreate the focused input,
// property button, or information panel on every incoming bot/room update.
export function updateAuctionBody(root, markup) {
  const template = root.ownerDocument.createElement("template");
  template.innerHTML = markup;
  const current = root.querySelector(".auction-panel");
  const incoming = template.content.querySelector(".auction-panel");
  if (
    !current ||
    !incoming ||
    current.dataset.auctionId !== incoming.dataset.auctionId
  )
    return false;
  for (const selector of [".auction-leader", ".auction-controls"])
    patch(current.querySelector(selector), incoming.querySelector(selector));
  return true;
}

function patch(current, incoming) {
  if (
    current.nodeType !== incoming.nodeType ||
    current.nodeName !== incoming.nodeName
  ) {
    current.replaceWith(incoming.cloneNode(true));
    return;
  }
  if (current.nodeType === 3) {
    if (current.data !== incoming.data) current.data = incoming.data;
    return;
  }
  if (current.nodeType !== 1) return;
  for (const { name } of [...current.attributes])
    if (!incoming.hasAttribute(name)) current.removeAttribute(name);
  for (const { name, value } of incoming.attributes)
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  if (
    current.tagName === "INPUT" &&
    current.value !== incoming.getAttribute("value")
  )
    current.value = incoming.getAttribute("value") || "";
  const oldChildren = [...current.childNodes];
  const nextChildren = [...incoming.childNodes];
  for (let i = 0; i < Math.max(oldChildren.length, nextChildren.length); i++) {
    if (!nextChildren[i]) oldChildren[i].remove();
    else if (!oldChildren[i]) current.append(nextChildren[i].cloneNode(true));
    else patch(oldChildren[i], nextChildren[i]);
  }
}
