import {env} from 'cloudflare:workers';
import {createD1Store} from './d1-store.mjs';
export function getRuntime(){const bindings=env as any;return {
 env:bindings,store:bindings.DB?createD1Store(bindings.DB):null,hosting:'sites',
 creatorId(request:Request){const user=request.headers.get('oai-authenticated-user-id');if(!user)throw Error('Masuk melalui ChatGPT untuk membuat room.');return user}
}}
