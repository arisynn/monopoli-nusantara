// Lucide 1.58.0, ISC license. Official lucide-static SVG subset. See licenses/LUCIDE.txt.
const paths = {
  menu: '<path d="M4 5h16" />\n  <path d="M4 12h16" />\n  <path d="M4 19h16" />',
  close: '<path d="M18 6 6 18" />\n  <path d="m6 6 12 12" />',
  arrow: '<path d="m9 18 6-6-6-6" />',
  back: '<path d="m15 18-6-6 6-6" />',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />\n  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
  assets:
    '<path d="M10 18v-7" />\n  <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" />\n  <path d="M14 18v-7" />\n  <path d="M18 18v-7" />\n  <path d="M3 22h18" />\n  <path d="M6 18v-7" />',
  trade:
    '<path d="M8 3 4 7l4 4" />\n  <path d="M4 7h16" />\n  <path d="m16 21 4-4-4-4" />\n  <path d="M20 17H4" />',
  history:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />\n  <path d="M3 3v5h5" />\n  <path d="M12 7v5l4 2" />',
  gear: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />\n  <circle cx="12" cy="12" r="3" />',
  dice: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2" />\n  <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" />\n  <path d="M6 18h.01" />\n  <path d="M10 14h.01" />\n  <path d="M15 6h.01" />\n  <path d="M18 9h.01" />',
  gavel:
    '<path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381" />\n  <path d="m16 16 6-6" />\n  <path d="m21.5 10.5-8-8" />\n  <path d="m8 8 6-6" />\n  <path d="m8.5 7.5 8 8" />',
  people:
    '<path d="M18 21a8 8 0 0 0-16 0" />\n  <circle cx="10" cy="8" r="5" />\n  <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />',
  trophy:
    '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" />\n  <path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2" />\n  <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3" />\n  <path d="M4 22h16" />\n  <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" />\n  <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" />',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />\n  <path d="M15 5.764v15" />\n  <path d="M9 3.236v15" />',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />\n  <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />\n  <path d="M7 3v4a1 1 0 0 0 1 1h7" />',
  pause:
    '<rect x="14" y="3" width="5" height="18" rx="1" />\n  <rect x="5" y="3" width="5" height="18" rx="1" />',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  plus: '<path d="M5 12h14" />\n  <path d="M12 5v14" />',
  minus: '<path d="M5 12h14" />',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />\n  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  bank: '<path d="M10 18v-7" />\n  <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" />\n  <path d="M14 18v-7" />\n  <path d="M18 18v-7" />\n  <path d="M3 22h18" />\n  <path d="M6 18v-7" />',
  info: '<circle cx="12" cy="12" r="10" />\n  <path d="M12 16v-4" />\n  <path d="M12 8h.01" />',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />',
  bolt: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />',
};

export function lucideIcon(name = "info", size = 22) {
  const key = paths[name] ? name : "info",
    px = Math.max(12, Math.min(64, Number(size) || 22));
  return `<svg class="ui-icon lucide-icon" data-lucide="${key}" xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="--icon-size:${px}px" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
}
