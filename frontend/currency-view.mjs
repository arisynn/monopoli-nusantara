// Normalize currency in older saved log text without changing names or input values.
// New amounts already use the actual naira glyph, including vector board labels.
export function decorateCurrency(root) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("input,textarea,select,script,style"))
      node.data = node.data.replace(/\bN (?=[−–-]?\d)/g, "₦ ");
  }
}
