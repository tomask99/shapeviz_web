import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminHandler} from '../src/admin/handler.js';

const owner='11111111-1111-4111-8111-111111111111';
const candidateId='22222222-2222-4222-8222-222222222222';
const reads=['crm-research-contacts','crm-research-contacts-prompt'];
const writes=['crm-research-contacts-preview','crm-research-contacts-commit','crm-research-contact-decide'];

test('contact prompt HTTP response uses the owner JWT and excludes private contact data',async()=>{
  const calls=[];
  const send=async(endpoint,options)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
    calls.push({endpoint,options});
    assert.match(endpoint,/\/crm_research_candidates\?/);
    return Response.json([{id:candidateId,company_name:'Public contact reference',website:'https://reference.example/',country:'SK',version:1,research_status:'NEEDS_REVIEW',approved_company_id:null}]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(origin+'/?action=crm-research-contacts-prompt&id='+candidateId,{headers:{Cookie:'sv_access=jwt'}});
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
    const body=await response.json();assert.match(body.prompt,/Public contact reference/);assert.match(body.prompt,/VERIFIED/);assert.match(body.prompt,/candidate_id/);
    assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
    assert.match(calls[0].endpoint,new RegExp('owner_id=eq.'+owner));assert.doesNotMatch(calls[0].endpoint,/select=\*|notes|crm_contacts/);
    assert.doesNotMatch(JSON.stringify(body),/server-only|Bearer jwt/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('contact research HTTP actions enforce owner membership, methods and same-origin writes',async()=>{
  let role='owner';const calls=[];
  const send=async(endpoint,options)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role}]);
    calls.push({endpoint,options});return Response.json([]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const headers={Cookie:'sv_access=jwt',Origin:origin,'Content-Type':'application/json'};
  try{
    for(const action of [...reads,...writes]){
      const reading=reads.includes(action),endpoint=origin+'/?action='+action+(reading?'&id='+candidateId:'');
      const options=reading?{}:{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'};
      assert.equal((await fetch(endpoint,options)).status,401,action+' anonymous');
      role='viewer';assert.equal((await fetch(endpoint,{...options,headers:{...options.headers,Cookie:'sv_access=jwt'}})).status,403,action+' viewer');
      role='owner';
      if(!reading){
        assert.equal((await fetch(endpoint,{headers})).status,405,action+' GET');
        assert.equal((await fetch(endpoint,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403,action+' cross-origin');
      }
    }
    assert.equal(calls.length,0,'Unauthorized requests must not read or mutate CRM data');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('contact research rejects owner and company selection supplied by the browser',async()=>{
  let writesReached=0;
  const send=async(endpoint)=>{
    if(endpoint.endsWith('/auth/v1/user'))return Response.json({id:owner});
    if(endpoint.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
    writesReached++;return Response.json([]);
  };
  const server=createServer(createAdminHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-only'},send}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const headers={Cookie:'sv_access=jwt',Origin:origin,'Content-Type':'application/json'};
  try{
    for(const action of reads){
      for(const suffix of ['&owner_id='+owner,'&companyId='+candidateId,'&id='+candidateId]){
        assert.equal((await fetch(origin+'/?action='+action+'&id='+candidateId+suffix,{headers})).status,400);
      }
    }
    const body={id:candidateId,version:1,operationId:owner,decision:'create',confirm:'create_contact',companyId:owner};
    assert.equal((await fetch(origin+'/?action=crm-research-contact-decide',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
    assert.equal(writesReached,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
