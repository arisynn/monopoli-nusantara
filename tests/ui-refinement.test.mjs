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
 assert(fx.includes('(dice[i]||1)'));assert(fx.includes('reduced?350:1050'));
 assert(css.includes('.board-dice-effect{position:absolute;inset:0;z-index:3;display:grid;place-items:center;pointer-events:none'));
 assert(css.includes('@media(prefers-reduced-motion:reduce)'));
});
test('trade and asset navigation use compact popup pickers and keep original management actions',()=>{
 const game=read('../components/game/Game.tsx');
 for(const part of ['tradeAssetTrigger(myId', 'tradeAssetTrigger(trade.to', "sheet==='tradePicker'", "sheet==='assetPicker'", "sheet==='manage'", 'pickerQuery', 'managementError(s,myId,selected,type)'])assert(game.includes(part),part);
 assert(game.includes("act('OFFER',{trade},myId)"));assert(game.includes("act('COUNTER',{trade})"));
 assert(game.includes("openManage(t.id)"));
});
