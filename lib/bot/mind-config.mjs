export const MIND_VERSION='4.10.0';
export const MODELS=Object.freeze([
 Object.freeze({id:'easy',code:'NUSA-E1',label:'Easy',algorithm:'rule-stochastic',budget:0}),
 Object.freeze({id:'medium',code:'NUSA-M2',label:'Medium',algorithm:'risk-aware-economic',budget:0}),
 Object.freeze({id:'hard',code:'NUSA-H3',label:'Hard',algorithm:'tactical-macro-crn',budget:90}),
 Object.freeze({id:'hardcore',code:'NUSA-X4',label:'Hardcore',algorithm:'scenario-macro-crn',budget:320})
]);
export const validDifficulty=value=>MODELS.some(m=>m.id===value);
/** Missing v4.5 save settings preserve its existing economic decision policy. */
export const difficultyFor=(s,id)=>validDifficulty(s.players[id]?.botDifficulty)?s.players[id].botDifficulty:'medium';
