const KEY='nusantara-preferences-v1';
// Old 3D preferences migrate without affecting saves or rules.
export function normalizePreferences(value={},reduced=false){value=value&&typeof value==='object'?value:{};return {sound:value.sound===true,fast:value.fast===true,reduced:typeof value.reduced==='boolean'?value.reduced:reduced,handoff:value.handoff===true,view:['overview','top','locked'].includes(value.view)?'overview':'follow'}}
export function loadPreferences(reduced=false){try{return normalizePreferences(JSON.parse(localStorage.getItem(KEY)||'{}'),reduced)}catch{return normalizePreferences({},reduced)}}
export function savePreferences(value){try{localStorage.setItem(KEY,JSON.stringify(normalizePreferences(value)));return true}catch{return false}}
