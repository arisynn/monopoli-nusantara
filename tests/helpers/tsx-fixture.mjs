import {createRequire} from 'node:module';import {readFileSync,existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let typescript;try{typescript=require('typescript')}catch{}
let babel;try{babel=require(process.env.MN_BABEL_BUNDLE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/lib/transform/babelBundle.js')}catch{}
export const jsxFixtureAvailable=!!(babel||typescript);
/** Element-tree fixture, not React DOM or a browser. Uses an already installed TSX transform. */
export async function loadComponent(file,{states={},presentation}={}){
 if(!jsxFixtureAvailable)throw Error('Optional TSX fixture transformer unavailable.');
 const stateNames=[],sourceText=readFileSync(fileURLToPath(file),'utf8');
 if(babel)babel.traverse(babel.babelParse(sourceText,fileURLToPath(file),true),{VariableDeclarator(path){if(path.node.init?.type==='CallExpression'&&path.node.init.callee.name==='useState')stateNames.push({at:path.node.start,name:path.node.id.elements?.[0]?.name})}});
 else{const ast=typescript.createSourceFile(fileURLToPath(file),sourceText,typescript.ScriptTarget.Latest,true,typescript.ScriptKind.TSX);const visit=node=>{if(typescript.isVariableDeclaration(node)&&node.initializer&&typescript.isCallExpression(node.initializer)&&node.initializer.expression.getText(ast)==='useState')stateNames.push({at:node.pos,name:node.name.elements?.[0]?.name?.getText(ast)});typescript.forEachChild(node,visit)};visit(ast)}
 stateNames.sort((a,b)=>a.at-b.at);
 const updates=[];
 const token='__tsxFixture'+crypto.randomUUID().replaceAll('-','');let stateIndex=0;
 const node=(type,props,key)=>({type,props:props||{},key});
 const stub=name=>Object.assign(()=>null,{displayName:name});
 const runtime={jsx:node,jsxs:node,Fragment:'fragment'};
 const react={useState:value=>{const i=stateIndex++;return [Object.hasOwn(states,stateNames[i]?.name)?states[stateNames[i].name]:Object.hasOwn(states,i)?states[i]:typeof value==='function'?value():value,next=>updates.push({name:stateNames[i]?.name,value:next})]},useRef:value=>({current:value}),useEffect:()=>{},useLayoutEffect:()=>{},useCallback:fn=>fn,useMemo:fn=>fn(),memo:fn=>fn};
 const defaults={};
 const fakePresentation=game=>({state:game,phase:'idle',busy:false,stepId:'',dice:null,diceKind:'movement',event:null,notice:null,transactions:[],motion:null,traveling:null,paused:false,canAcknowledge:false,completeMove:()=>{},onMoveStep:()=>{},dismissEvent:()=>{},skip:()=>{},...presentation});
 globalThis[token]={get(path){
  if(path==='react')return react;if(path==='react/jsx-runtime')return runtime;
  if(path==='next/dynamic')return {default:()=>stub('Board')};
  if(path==='lucide-react')return new Proxy({},{get:(_t,name)=>stub(String(name))});
  if(path.startsWith('./')&&!path.startsWith('./lib')){if(path==='./useGameplayPresentation')return {default:fakePresentation};if(!defaults[path])defaults[path]={default:stub(path.slice(2)),SvgNusaText:stub('SvgNusaText'),PawnArt:stub('PawnArt')};return new Proxy(defaults[path],{get:(t,name)=>t[name]||stub(String(name))});}
  return {};
 }};
 let code=babel?babel.babelTransform(sourceText,fileURLToPath(file),true,[],[]).code:typescript.transpileModule(sourceText,{fileName:fileURLToPath(file),compilerOptions:{jsx:typescript.JsxEmit.ReactJSX,module:typescript.ModuleKind.ESNext,target:typescript.ScriptTarget.ES2017}}).outputText;
 code=code.replace(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/g,(line,bindings,path)=>{
  if(path.startsWith('@/lib/')){let url=new URL('../../'+path.slice(2),import.meta.url);if(!existsSync(fileURLToPath(url)))url=new URL(url.href+'.ts');return line.replace(path,url.href);}
  const object=`globalThis.${token}.get(${JSON.stringify(path)})`;
  if(bindings.startsWith('{'))return `const ${bindings.replaceAll(/\bas\b/g,':')}=${object};`;
  if(bindings.includes(',')){const [name,...rest]=bindings.split(',');return `const ${name.trim()}=${object}.default;const ${rest.join(',').trim().replaceAll(/\bas\b/g,':')}=${object};`;}
  return `const ${bindings.trim()}=${object}.default;`;
 });
 code=code.replace(/\/\/# sourceMappingURL=.*$/gm,'')+'\n//# sourceURL=tsx-fixture-'+file.pathname.split('/').at(-1)+'.js';
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));return {module,updates,reset:()=>stateIndex=0,dispose:()=>delete globalThis[token]};}catch(e){delete globalThis[token];throw e;}
}
export function elements(node,result=[]){if(!node)return result;if(Array.isArray(node)){for(const child of node)elements(child,result);return result;}if(typeof node==='object'&&node.props){result.push(node);elements(node.props.children,result)}return result;}
export function textContent(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(textContent).join(' ');if(typeof node==='object')return node.props?.text!==undefined?String(node.props.text):textContent(node.props?.children);return String(node);}
