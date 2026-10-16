// One same-URL browser entry for transient UI. No routes, game data or tokens stored.
export function createLayerNavigation(history,onBack,schedule=fn=>setTimeout(fn,0)){
 const token=`nusantara-${Math.random().toString(36).slice(2)}`;
 let active=false,pending=false,disposed=false;
 const owned=()=>history.state?.nusantaraLayer===token;
 function reconcile(){
  if(disposed||pending)return;
  if(active&&!owned())history.pushState({...history.state,nusantaraLayer:token},'');
  else if(!active&&owned()){pending=true;history.back()}
 }
 return {
  sync(value){active=!!value;reconcile()},
  pop(){if(disposed)return;if(pending)pending=false;else if(active)onBack();schedule(reconcile)},
  dispose(){disposed=true;if(owned())history.back()}
 };
}
