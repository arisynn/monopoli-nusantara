const UI_ICONS=Object.freeze({"menu":0,"close":1,"arrow":2,"back":3,"home":4,"assets":5,"trade":6,"history":7,"gear":8,"dice":9,"gavel":10,"people":11,"trophy":12,"map":13,"save":14,"pause":15,"play":16,"check":17,"plus":18,"minus":19,"copy":20,"bank":21,"info":22,"flag":23,"bolt":24});
export const icon=(name,size=22)=>{const i=UI_ICONS[name]??UI_ICONS.info;return `<span class="ui-icon" style="--icon-size:${size}px;--icon-x:${i%8*100/7}%;--icon-y:${Math.floor(i/8)*100/3}%" aria-hidden="true"></span>`;};
export const colors=['#218beb','#e67379','#50a991','#d8a337','#9a7ac6','#db82ad'];
// Six PNG animal portraits, numeric seat identity remains stable across reconnect.
export function avatar(id=0){const n=Number.isInteger(id)&&id>=0?id%6:0;return `<span class="avatar animal-avatar" style="--avatar-x:${n%3*50}%;--avatar-y:${Math.floor(n/3)*100}%" aria-hidden="true"></span>`;}

export function tileArt(tile,extra=''){return `<span class="region-art ${extra}" style="--group:${tile?.color||'#a1b2c5'}" aria-hidden="true"></span>`;}


// Numeric token identity is unchanged; only its visual sprite is replaced.
export function pawnArt(pawn,alt=''){const id=Number.isInteger(pawn)&&pawn>=0&&pawn<6?pawn:0;const safe=String(alt).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<span class="pawn-sprite" style="--pawn-x:${(id%3)*50}%;--pawn-y:${Math.floor(id/3)*100}%" ${alt?`role="img" aria-label="${safe}"`:'aria-hidden="true"'}></span>`;}

// PNG sprites are shared by the board and compact certificates.
export function buildingArt(kind='house'){return `<span class="building-token ${kind==='hotel'?'hotel':'house'}" aria-hidden="true"></span>`;}
export function eventArt(index,extra=''){return `<span class="card-illustration ${extra}" style="--card-x:${index%4*100/3}%;--card-y:${Math.floor(index/4)*100/3}%" aria-hidden="true"></span>`;}
