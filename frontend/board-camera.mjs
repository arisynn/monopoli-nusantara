// View-only, zero-gutter camera. Logical rules and tile IDs use the shared board coordinates.
export function fitCamera(width, height) {
  const scale = Math.min(width, height) / 1000;
  return {
    width,
    height,
    scale,
    x: (width - 1000 * scale) / 2,
    y: (height - 1000 * scale) / 2,
  };
}
export function clampCamera(c) {
  const min = Math.min(c.width, c.height) / 1000,
    scale = Math.max(min, Math.min(Math.max(1.6, min * 4), c.scale)),
    extent = 1000 * scale,
    axis = (p, size) =>
      extent <= size
        ? (size - extent) / 2
        : Math.max(size - extent, Math.min(0, p));
  return { ...c, scale, x: axis(c.x, c.width), y: axis(c.y, c.height) };
}
export function centerCamera(c, p) {
  return clampCamera({
    ...c,
    x: c.width / 2 - p.x * c.scale,
    y: c.height / 2 - p.y * c.scale,
  });
}
export function zoomCamera(c, factor, anchor) {
  const p = { x: (anchor.x - c.x) / c.scale, y: (anchor.y - c.y) / c.scale },
    scale = Math.max(
      Math.min(c.width, c.height) / 1000,
      Math.min(
        Math.max(1.6, (Math.min(c.width, c.height) / 1000) * 4),
        c.scale * factor,
      ),
    );
  return clampCamera({
    ...c,
    scale,
    x: anchor.x - p.x * scale,
    y: anchor.y - p.y * scale,
  });
}

export function interpolateCamera(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress)),
    ease = t * t * (3 - 2 * t);
  return clampCamera({
    ...to,
    x: from.x + (to.x - from.x) * ease,
    y: from.y + (to.y - from.y) * ease,
    scale: from.scale + (to.scale - from.scale) * ease,
  });
}
