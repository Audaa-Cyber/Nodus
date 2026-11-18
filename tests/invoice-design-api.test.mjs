import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,existsSync } from 'node:fs';
import { createRequire,Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=fileURLToPath(new URL('../',import.meta.url));
function route(file,supabase){
  const cache=new Map();
  function load(relative){
    const filename=root+relative;
    if(cache.has(filename))return cache.get(filename).exports;
    const testModule=new Module(filename);testModule.filename=filename;testModule.paths=Module._nodeModulePaths(root);cache.set(filename,testModule);
    testModule.require=id=>{
      if(id==='@/lib/supabase/server')return {createSupabaseAnonymousServerClient:()=>supabase,createSupabaseServerClient:async()=>supabase};
      if(id.startsWith('@/'))for(const extension of ['.ts','.tsx']){const file='src/'+id.slice(2)+extension;if(existsSync(root+file))return load(file);}
      return require(id);
    };
    testModule._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,filename);
    return testModule.exports;
  }
  return load(file);
}
const token=Buffer.alloc(32,9).toString('base64url'),params={params:Promise.resolve({token})};

test('feedback rejects invalid capabilities and malformed ratings before contacting Supabase',async()=>{
  let calls=0;const api=route('src/app/api/pay/[token]/feedback/route.ts',{rpc:()=>{calls++;throw Error('unexpected database access');}});
  assert.equal((await api.GET(new Request('http://localhost'),{params:Promise.resolve({token:'bad'})})).status,404);
  for(const rating of [0,6,1.5,'5'])assert.equal((await api.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({rating})}),params)).status,400);
  assert.equal(calls,0);
});

test('feedback writes only the hash of the valid share capability and returns saved rating',async()=>{
  const calls=[];const api=route('src/app/api/pay/[token]/feedback/route.ts',{rpc:async(name,args)=>{calls.push({name,args});return {data:[{rating:5,comment:null,customer_name:'Customer',submitted_at:'2026-11-18'}],error:null};}});
  const response=await api.POST(new Request('http://localhost',{method:'POST',body:'{"rating":5}'}),params);
  assert.equal(response.status,200);assert.equal((await response.json()).feedback.rating,5);
  assert.equal(calls[0].name,'submit_shared_invoice_feedback');assert.equal(calls[0].args.p_token_hash,createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(calls).includes(token));
});

test('merchant feedback endpoint refuses unauthenticated access before reading invoice rows',async()=>{
  const api=route('src/app/api/invoices/[id]/feedback/route.ts',{auth:{getUser:async()=>({data:{user:null},error:null})},from:()=>{throw Error('unexpected database access');}});
  const response=await api.GET(new Request('http://localhost'),{params:Promise.resolve({id:'123e4567-e89b-42d3-a456-426614174000'})});
  assert.equal(response.status,401);
});

function receiptDatabase(extra={}){
  const immutable='0x'+'b'.repeat(40),current='0x'+'c'.repeat(40),hash='0x'+'a'.repeat(64);
  const values={
    lookup_shared_invoice:{data:[{link_status:'active',status:'paid',business_name:'Actual Merchant',currency:'USD',line_items:[],seller_snapshot:{},...extra.invoice}],error:null},
    lookup_shared_payment_receipts:{data:[{receipt_number:'RCP-42',invoice_number:'INV-42',business_name:'Actual Merchant',outcome:'VERIFIED',received_amount_base_units:'123450000',received_asset_decimals:6,destination_tx_hashes:[hash],destination_network:'arbitrum-sepolia',destination_asset_id:'arbitrum-sepolia:usdc',issued_at:'2026-11-18T04:30:15Z',...extra.receipt}],error:null},
    lookup_shared_receipt_destinations:{data:[{receipt_number:'RCP-42',recipient_address:immutable}],error:extra.error??null},
  };
  return {immutable,current,rpc:async(name)=>{assert.ok(name in values,'receipt must not query current payment profile');return values[name];}};
}

test('official PDF exports immutable settlement recipient and authoritative amount',async()=>{
  const database=receiptDatabase();const api=route('src/app/api/pay/[token]/receipt/route.ts',database);
  const response=await api.GET(new Request('http://localhost'),params);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
  const pdf=await response.text();assert.ok(pdf.includes(database.immutable));assert.ok(!pdf.includes(database.current));assert.ok(pdf.includes('123.450000 USDC'));
});

test('official receipts refuse unpaid/unverified evidence and signal Unicode-preserving print',async()=>{
  for(const extra of [{invoice:{status:'open'}},{receipt:{outcome:'PARTIAL'}},{receipt:{destination_tx_hashes:['bad']}}]){
    const api=route('src/app/api/pay/[token]/receipt/route.ts',receiptDatabase(extra));
    assert.ok([404,409].includes((await api.GET(new Request('http://localhost'),params)).status));
  }
  const api=route('src/app/api/pay/[token]/receipt/route.ts',receiptDatabase({invoice:{business_name:'አዲስ አበባ'}}));
  const response=await api.GET(new Request('http://localhost'),params);
  assert.equal(response.status,422);assert.equal((await response.json()).code,'unicode_receipt_requires_print');
});
