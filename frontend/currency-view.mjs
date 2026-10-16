// Decoration only: preserve the engine's exact amount text and input values.
// Skip SVG labels, which remain vector text for readability at board overview scale.
export function decorateCurrency(root) {
  const doc = root.ownerDocument || document,
    walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      !node.parentElement?.closest(
        "svg,input,textarea,select,script,style,.nusa-token",
      ) &&
      /\bN (?=[−–-]?\d)/.test(node.data)
    )
      nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment(),
      pattern = /\bN (?=[−–-]?\d)/g;
    let offset = 0,
      match;
    while ((match = pattern.exec(node.data))) {
      fragment.append(doc.createTextNode(node.data.slice(offset, match.index)));
      const mark = doc.createElement("span");
      mark.className = "nusa-token";
      mark.textContent = "N";
      fragment.append(mark, doc.createTextNode(" "));
      offset = match.index + 2;
    }
    fragment.append(doc.createTextNode(node.data.slice(offset)));
    node.replaceWith(fragment);
  }
}
