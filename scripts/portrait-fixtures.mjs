import {createGame,stock,DECKS,command} from '../lib/game.mjs';
export function portraitFixture(kind='game',n=4) {
 const s=createGame({players:['Jovan','Raka','Bima','Sari','Dewi','Bayu'].slice(0,n).map(name=>({name,controller:'human'})),startingRoll:false,matchId:'portrait-reference'},()=>.2);
 s.assets[1]={owner:0,level:2,mortgaged:false};s.assets[3]={owner:0,level:2,mortgaged:false};
 s.assets[6]={owner:1,level:0,mortgaged:false};s.assets[8]={owner:1,level:0,mortgaged:false};
 if(['chance','community'].includes(kind)){s.phase='card';s.card={...DECKS[kind][0],deck:kind,idx:0,player:0};}
 if(kind==='buy'){s.phase='buy';s.buy=9;}
 if(kind==='jail'){s.phase='jail';s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jail=0;}
 if(kind==='debt'){s.phase='debt';s.players[0].cash=100;s.debt={from:0,to:1,amount:5000,label:'Sewa'};}
 if(kind==='auction'){s.phase='buy';s.buy=19;s.bank=stock(s);return command(s,0,{type:'AUCTION'});}
 if(kind==='won'){s.phase='won';s.winner=0;for(const p of s.players)if(p.id!==0)p.out=true;}
 s.bank=stock(s);return s;
}
export const preservedCases=[
 ...[{width:320,height:568,n:6},{width:360,height:640,n:4},{width:390,height:844,n:4},{width:430,height:932,n:2}].map(v=>({id:`game-${v.width}`,kind:'game',viewport:{width:v.width,height:v.height},n:v.n})),
 {id:'chance',kind:'chance'},{id:'community',kind:'community'},
 {id:'certificate',kind:'game',tile:1},{id:'buy',kind:'buy'},
 {id:'chance-catalog',kind:'game',tile:7},{id:'community-catalog',kind:'game',tile:2},
];
export async function fixturePage(browser,origin,{kind='game',n=4,viewport={width:390,height:844},tile=null,lobby=false}={}) {
 const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 await page.goto(origin,{waitUntil:'networkidle'});
 if(!lobby){await page.evaluate(state=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state,room:null,persistedAt:Date.now()})),portraitFixture(kind,n));await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.board-stage').waitFor();}
 if(tile!==null){await page.locator(`[data-tile="${tile}"]`).focus();await page.keyboard.press('Enter');await page.locator('dialog[open]').waitFor();}
 await page.evaluate(()=>document.fonts.ready);return {context,page};
}
