"""Reproducible original vector artwork; no third-party artwork or runtime dependency.
Run with Python + fontTools (build-time only) to regenerate the tiny Nusa font.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'public/assets'
(A/'tokens').mkdir(exist_ok=True)
(A/'board').mkdir(exist_ok=True)
navy='#173d46';gold='#d5a44e';cream='#fff3d4'
# One identical silhouette-safe viewport and centered pedestal for all six pieces.
tokens={
'pinisi':('Pinisi','#d5a44e','''<path d="M12 43h42l-7 11H23Z" fill="url(#body)"/><path d="M33 10v34M25 19v24"/><path d="M35 12 52 37H35Z" fill="#fff3d4"/><path d="M30 18 14 38h16Z" fill="#f4d896"/><path d="m34 10 8 3-8 3" fill="#c87546"/><path d="M20 48h25" stroke="#fff3d4"/>'''),
'komodo':('Komodo','#70a890','''<path d="M16 41Q8 31 16 27l12-1 7 8 14 4q8 3 7 10-5-7-15-5H27l-3 9h-8l4-12Z" fill="url(#body)"/><path d="m29 39 7 7 4 6h-8l-7-9M14 34l-5 2M22 29l1 1"/><circle cx="20" cy="31" r="1.5" fill="#fff3d4"/><path d="m32 31 2-5 4 8 4-3 3 7" fill="#a8c3a0"/><path d="m14 51 7 1m12-1 6 1"/>'''),
'becak':('Becak','#ae8bc2','''<circle cx="16" cy="46" r="9" fill="#fff3d4"/><circle cx="47" cy="46" r="9" fill="#fff3d4"/><path d="m16 46 10-18 7 18H16l22-12 9 12M24 26h10M38 34V22"/><path d="M32 23q2-15 18-10l6 11Z" fill="url(#body)"/><path d="M34 25v10h18V25M34 35l-3 7h20l1-7" fill="#d4b2dd"/><path d="M36 18q6-6 13-1" stroke="#fff3d4"/>'''),
'cenderawasih':('Cenderawasih','#69a7c3','''<path d="M28 31Q15 31 21 20q6-9 15-2l7 2-7 5q7 12-6 17l-1 11h-7l3-14Z" fill="url(#body)"/><path d="M31 31q24-7 24 20-8-11-20-13 20 7 12 17-4-11-17-14" fill="#e5b858"/><path d="m24 20 4-9 5 5M36 20l8 1-8 4" fill="#e5b858"/><path d="m25 30 11-5-7 13" fill="#fff3d4"/><circle cx="31" cy="20" r="1.5" fill="#173d46"/>'''),
'angklung':('Angklung','#cf8870','''<path d="M16 12v42M50 12v42M15 16h36M15 49h36"/><path d="M21 24h7v26h-7ZM32 19h7v31h-7ZM43 27h6v23h-6Z" fill="url(#body)"/><path d="M24 25v20m11-25v25m11-17v18" stroke="#fff3d4"/><path d="M21 28h7m4-5h7m4 9h6M18 54h32"/>'''),
'rumah-gadang':('Rumah Gadang','#b6a65e','''<path d="M18 30h31v21H18Z" fill="url(#body)"/><path d="M10 15q9 13 22 5 15 8 23-5L49 33H17Z" fill="#785d58"/><path d="M11 16q11 12 21 4 13 8 22-4" stroke="#fff3d4"/><path d="M20 52v4m25-4v4M29 39h8v12"/><path d="M21 37h4v5h-4Zm20 0h4v5h-4Z" fill="#fff3d4"/><path d="M17 34h32"/>''')}
for name,(title,color,art) in tokens.items():
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {dict(pinisi=3.5,komodo=11.5,becak=5.5,cenderawasih=4,angklung=4.5,**{'rumah-gadang':6})[name]} 64 64"><title>{title}</title><defs><linearGradient id="body" x2=".3" y2="1"><stop stop-color="{color}"/><stop offset="1" stop-color="{color}" stop-opacity=".65"/></linearGradient></defs><ellipse cx="32" cy="58" rx="23" ry="4" fill="{navy}" opacity=".2"/><g fill="none" stroke="{navy}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 55q20-7 40 0v4q-20 7-40 0Z" fill="{color}"/><path d="M13 55q19 5 38 0" fill="none" stroke="{cream}" stroke-width="1.2"/>{art}</g></svg>'''
 (A/'tokens'/f'{name}.svg').write_text(svg)
# Special tile illustrations share enamel frames and restrained brass highlights.
art={
'start': '<path d="M20 45h48l-12-11m12 11L56 56" stroke="#b45c41" stroke-width="6" fill="none"/><path d="M23 34V20h18v14m-18-9h18"/><path d="M23 20h9v5h-9Z" fill="#d5a44e"/>',
'station':'<path d="M20 34 44 16l24 18" fill="#b7985d"/><path d="M26 34h36v30H26Z" fill="#e4cd98"/><rect x="32" y="32" width="24" height="25" rx="6" fill="#477b80"/><path d="M37 38h14v9H37Z" fill="#fff3d4"/><path d="m34 65 7-10m13 10-7-10M20 67h48"/><circle cx="38" cy="52" r="1"/><circle cx="50" cy="52" r="1"/>',
'electric':'<circle cx="44" cy="39" r="22" fill="#e8c779"/><path d="m47 15-19 28h13l-4 23 23-30H46Z" fill="#fff3d4"/><path d="M16 39h-5m66 0h-5M23 15l-4-4m46 4 4-4M30 69h28"/>',
'water':'<path d="M44 15Q21 39 24 50q3 23 23 17 22-4 17-22Z" fill="#74aeb9"/><path d="M33 46q-6 13 7 15" stroke="#fff3d4" stroke-width="4" fill="none"/><path d="M15 73q8-5 15 0t15 0 15 0 15 0" fill="none"/>',
'jail':'<path d="M20 69V26l24-12 24 12v43Z" fill="#b7bdb1"/><path d="M28 32h32v37H28Z" fill="#2a515a"/><path d="M36 32v37m8-37v37m8-37v37" stroke="#e6cc98" stroke-width="3"/><path d="M17 70h54M39 23h10"/>',
'gojail':'<path d="M25 70V27l19-10 19 10v43Z" fill="#b7bdb1"/><path d="M32 34h24v35H32Z" fill="#2a515a"/><path d="M39 34v35m10-35v35" stroke="#e6cc98" stroke-width="3"/><path d="M11 48h20l-7-7m7 7-7 7M68 48h10" fill="none" stroke="#b45c41" stroke-width="4"/>',
'parking':'<path d="M21 43 28 29h32l8 14v20H21Z" fill="#6d9b86"/><path d="M30 33h26l5 12H25Z" fill="#fff3d4"/><rect x="19" y="47" width="51" height="15" rx="5" fill="#6d9b86"/><path d="M26 62v6m36-6v6M24 53h6m30 0h5"/><path d="M16 24V11h9a5 5 0 0 1 0 10h-9" fill="none"/>',
 'tax':'<path d="M25 17h35v54l-5-4-5 4-5-4-5 4-5-4-5 4-5-4Z" fill="#fff3d4"/><path d="M33 27h18m-18 7h18m-18 7h9"/><circle cx="48" cy="54" r="12" fill="#d5a44e"/><path d="M43 59V48l10 11V48" fill="none"/>',
 # Both decks entirely new: original vector illustrations, never the old card atlas.
 'chance':'<path d="m44 12 8 14 16 4-11 12 2 17-15-7-15 7 2-17-11-12 16-4Z" fill="#d5a44e"/><circle cx="44" cy="37" r="13" fill="#fff3d4"/><path d="m48 28-1 13-10 6 3-13Z" fill="#b45c41"/><path d="M23 66q20-10 42-2M24 16l-5-5m49 7 5-5" fill="none"/>',
 'community':'<path d="M18 41 31 27l13 14 13-14 13 14v24H18Z" fill="#71a28d"/><path d="M25 43h12v16H25Zm26 0h12v16H51Z" fill="#fff3d4"/><path d="M38 65V45h12v20" fill="#d5a44e"/><circle cx="44" cy="21" r="10" fill="#e7c77d"/><path d="M39 25V17l10 8V17M12 68h64" fill="none"/>'
}
for name,body in art.items():
 bg='#f6e9c4' if name=='chance' else '#dae8dd' if name=='community' else '#f6edda'
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><title>{name}</title><defs><linearGradient id="enamel" x2="0" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="#c5d4c7"/></linearGradient></defs><rect x="5" y="5" width="78" height="78" rx="20" fill="url(#enamel)" stroke="#b39c68" stroke-width="1.5"/><path d="M14 25v-3a8 8 0 0 1 8-8h3m38 0h3a8 8 0 0 1 8 8v3" fill="none" stroke="#fff8e4" stroke-width="2"/><g fill="none" stroke="{navy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>'''
 (A/'board'/f'{name}.svg').write_text(svg)
# An N monogram with an archipelago wave foot, deliberately distinct from world currency signs.
mark='M4 19V4H7L17 16V4H20V21H17L7 9V19Z M3 22Q8 18 13 22Q17 25 22 21V24Q17 28 12 25Q8 22 3 25Z'
(A/'nusa.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 28"><title>Nusa</title><path fill="currentColor" d="{mark}"/></svg>')
# Identical geometry as a scoped text font: selectable/copyable N; system N is the fallback.
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
pen=TTGlyphPen(None);parse_path(mark,TransformPen(pen,(30,0,0,-30,0,780)))
fb=FontBuilder(1000,isTTF=True);fb.setupGlyphOrder(['.notdef','nusa']);fb.setupCharacterMap({ord('N'):'nusa'})
empty=TTGlyphPen(None).glyph();fb.setupGlyf({'.notdef':empty,'nusa':pen.glyph()});fb.setupHorizontalMetrics({'.notdef':(780,0),'nusa':(780,90)})
fb.setupHorizontalHeader(ascent=900,descent=-160);fb.setupNameTable({'familyName':'Nusa Symbol','styleName':'Regular','uniqueFontIdentifier':'NusaSymbolOriginal211','fullName':'Nusa Symbol','psName':'NusaSymbol'});fb.setupOS2(sTypoAscender=900,sTypoDescender=-160,usWinAscent=900,usWinDescent=160);fb.setupPost();fb.font['head'].created=3865881600;fb.font['head'].modified=3865881600;fb.font.recalcTimestamp=False;fb.font.flavor='woff';fb.save(A/'nusa-symbol.woff')
print('6 tokens, 10 special illustrations, Nusa SVG and WOFF generated.')
