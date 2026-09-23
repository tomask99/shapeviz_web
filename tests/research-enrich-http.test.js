import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';

const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const reads=['crm-research-insight','crm-research-insight-report','crm-research-enrich-prompt'];
const writes=['crm-research-enrich-preview','crm-research-enrich-commit'];

test('Lead enrichment HTTP actions require owner membership and same-origin POST for writes',async()=>{
  let role='owner';let dataCalls=0;
  const send=async endpoint=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role}]);
    dataCalls++;return Response.json([]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const action of [...reads,...writes]){
      const reading=reads.includes(action),endpoint=origin+'/?action='+action+(reading?'&companyId='+id+(action.endsWith('report')?'&id='+owner:''):'');
      const options=reading?{}:{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'};
      assert.equal((await fetch(endpoint,options)).status,401,action+' anonymous');
      role='viewer';assert.equal((await fetch(endpoint,{...options,headers:{...options.headers,Cookie:'sv_access=jwt'}})).status,403,action+' viewer');role='owner';
      if(!reading){
        assert.equal((await fetch(endpoint,{headers:{Cookie:'sv_access=jwt'}})).status,405,action+' GET');
        assert.equal((await fetch(endpoint,{...options,headers:{...options.headers,Origin:'https://other.example',Cookie:'sv_access=jwt'}})).status,403,action+' cross-origin');
      }
    }
    assert.equal(dataCalls,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Lead insight HTTP queries reject owner injection and repeated IDs before database access',async()=>{
  let dataCalls=0;
  const send=async endpoint=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
    dataCalls++;return Response.json([]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const action of reads){
      for(const suffix of ['&owner_id='+owner,'&companyId='+owner]){
        const endpoint=origin+'/?action='+action+'&companyId='+id+(action.endsWith('report')?'&id='+owner:'')+suffix;
        assert.equal((await fetch(endpoint,{headers:{Cookie:'sv_access=jwt'}})).status,400);
      }
    }
    assert.equal(dataCalls,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
