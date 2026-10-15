import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD} from '../lib/content.mjs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('v2.4 keeps the 40-tile board clear of fixed zoom and minimap widgets',()=>{
 const board=read('../components/game/Board.tsx');
 assert.equal(BOARD.length,40);
 for(const name of ['map-zoom','map-minimap','map-hint','map-status'])assert(!board.includes(`className="${name}`),`${name} must not float over the map`);
 assert(board.includes('BoardArtwork'));assert(board.includes('BoardTokens'));
 assert(board.includes('BoardGesture'));assert(board.includes('DiceRollFx'));
});
test('dice animation respects the actual dice result and cannot intercept pointer input',()=>{
 const fx=read('../components/game/DiceRollFx.tsx');const css=read('../app/globals.css');
 assert(fx.includes('dice[i]||1'));assert(fx.includes('timing.settle'));
 assert(css.includes('.board-dice-effect{position:absolute;inset:0;z-index:3;display:grid;place-items:center;pointer-events:none'));
 assert(css.includes('@media(prefers-reduced-motion:reduce)'));
});
test('v2.6 uses a compact asset manager and a guided barter without changing board controls',()=>{
 const game=read('../components/game/Game.tsx');
 const assets=read('../components/game/AssetManager.tsx');
 const wizard=read('../components/game/TradeWizard.tsx');
 const review=read('../components/game/TradeReview.tsx');
 assert(game.includes('<AssetManager game={s}'));
 assert(game.includes('<TradeWizard onPick='));
 assert(game.includes('mode="counter"'));
 assert(game.includes("act('OFFER',{trade:submitted},myId)"));
 assert(game.includes("act('COUNTER',{trade:submitted})"));
 assert(game.includes("displaySheet==='manage'"));
 assert(read('../components/game/AssetActions.tsx').includes('managementError(game,player,tile,type)'));
 assert(game.includes('onAction={requestAssetAction}'));
 for(const label of ['Cari kota atau properti','Bisa bangun','Digadai','Set lengkap','onAction'])assert(assets.includes(label),label);
 for(const label of ['Pilih lawan','Kamu memberi','Kamu menerima','Ringkasan','trade.giveCards','trade.takeCards','tradeDraftStatus'])assert(wizard.includes(label),label);
 assert(review.includes('Ringkasan pertukaran'));
 assert(!game.includes("sheet==='tradePicker'"));
 assert(!game.includes("sheet==='assetPicker'"));
});
