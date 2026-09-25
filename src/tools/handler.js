import {randomUUID} from 'node:crypto';
import {fail,uuid} from '../crm/validation.js';
import {READ_TOOLS} from './catalog.js';
import {executeReadTool,listReadTools} from './service.js';

export const READ_TOOL_ACTIONS = ['crm-tools-list','crm-tools-call'];
export const MAX_TOOL_REQUEST_BYTES = 16_384;
// The JSON file is itself an escaped JSON string inside the tool envelope.
export const MAX_IMPORT_TOOL_REQUEST_BYTES = 3_100_000;
export const toolRequestLimit = name => name==='validate_research_import'?MAX_IMPORT_TOOL_REQUEST_BYTES:MAX_TOOL_REQUEST_BYTES;
export const MAX_TOOL_RESPONSE_BYTES = 1_000_000;
export const ADMIN_READ_SCOPES = Object.freeze(['crm:read','research:read','catalog:read']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const logAudit = event => console.info(JSON.stringify(event));

/** Admin-session adapter only. Future transports must supply verified identity. */
export async function handleReadTools({action,body,url,user,token,call,audit=logAudit}) {
  const requestId=randomUUID(),started=Date.now();
  let tool=null,status=500,responseBytes=0;
  try {
    if(!uuid(user?.id)||typeof token!=='string'||!token)throw fail(401,'Please sign in.');
    if(!READ_TOOL_ACTIONS.includes(action))throw fail(404,'Unknown read-tool action.');
    if([...url.searchParams.keys()].some(key=>key!=='action'||url.searchParams.getAll(key).length!==1))throw fail(400,'Invalid read-tool options.');
    const context={user,token,scopes:[...ADMIN_READ_SCOPES],call};
    let result;
    if(action==='crm-tools-list')result={schema_version:1,tools:await listReadTools(context)};
    else {
      if(!plain(body)||Object.keys(body).length!==2||!Object.hasOwn(body,'tool')||!Object.hasOwn(body,'arguments')||typeof body.tool!=='string'||!plain(body.arguments))throw fail(400,'Use a tool name and its arguments object.');
      let serialized;
      try{serialized=JSON.stringify(body);}catch{throw fail(400,'Tool arguments must be JSON.');}
      if(Buffer.byteLength(serialized,'utf8')>toolRequestLimit(body.tool))throw fail(413,'Tool request is too large.');
      tool=READ_TOOLS.some(item=>item.name===body.tool)?body.tool:null;
      const data=await executeReadTool({...context,name:body.tool,args:body.arguments});
      result={schema_version:1,request_id:requestId,tool,data,meta:{read_only:true,untrusted_data:true}};
    }
    responseBytes=Buffer.byteLength(JSON.stringify(result),'utf8');
    if(responseBytes>MAX_TOOL_RESPONSE_BYTES)throw fail(413,'Tool result is too large. Narrow the request; no partial result was returned.');
    status=200;
    return result;
  }catch(error){status=Number.isInteger(error.status)?error.status:500;throw error;}
  finally {
    // A data-free operational trace, not a durable audit ledger. Logging failure
    // cannot turn a completed read into an ambiguous business operation.
    const event=Object.freeze({event:'crm_read_tool',request_id:requestId,owner_id:uuid(user?.id)?user.id:null,action:READ_TOOL_ACTIONS.includes(action)?action:null,tool,at:new Date(started).toISOString(),duration_ms:Math.max(0,Date.now()-started),status,response_bytes:status===200?responseBytes:0});
    try{await audit(event);}catch{/* The hosting log sink may be unavailable. */}
  }
}
