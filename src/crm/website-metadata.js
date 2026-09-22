import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {parse} from 'parse5';
import {normalizedURL} from '../../public/admin/crm-normalize.js';
import {fail} from './validation.js';
// Conservative IPv4-only egress. IPv6-only hosts are not fetched, never downgraded to unsafe DNS.
export function publicIPv4(address){if(isIP(address)!==4)return false;const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
export function extractMetadata(html,website){const tree=parse(html),result={website,company_name:'',short_description:'',instagram:'',linkedin:''};let title='';const content=node=>(node.childNodes||[]).map(c=>c.nodeName==='#text'?c.value:content(c)).join(' ').trim();
 function walk(node){const a=Object.fromEntries((node.attrs||[]).map(x=>[x.name,x.value]));if(node.tagName==='title')title=content(node).slice(0,160);if(node.tagName==='meta'){const k=(a.property||a.name||'').toLowerCase();if(k==='og:site_name')result.company_name=(a.content||'').slice(0,160);if(k==='description')result.short_description=(a.content||'').slice(0,3000);}if(node.tagName==='a'&&a.href){try{const u=new URL(a.href,website);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)for(const key of ['instagram','linkedin'])if(u.hostname===key+'.com'||u.hostname.endsWith('.'+key+'.com'))result[key]=u.href.slice(0,2048);}catch{}}for(const child of node.childNodes||[])walk(child);}walk(tree);result.company_name||=title;return result;
}
export async function websiteMetadata(value,{resolve=lookup,get=(url,options,callback)=>(url.protocol==='https:'?https:http).get(url,options,callback)}={}){
 let current;try{current=new URL(normalizedURL(value));}catch(e){throw fail(400,e.message);}const deadline=Date.now()+10000;
 for(let step=0;step<4;step++){
  if(current.port&&!['80','443'].includes(current.port)||current.username||current.password||!['https:','http:'].includes(current.protocol))throw fail(400,'Website address is not allowed.');
  const remaining=deadline-Date.now();if(remaining<=0)throw fail(408,'Website lookup timed out.');
  let timer;const addresses=await Promise.race([resolve(current.hostname,{all:true,family:4,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail(408,'DNS lookup timed out.')),remaining);})]).finally(()=>clearTimeout(timer));
  if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw fail(400,'Website must resolve only to public IPv4 addresses. Add this company manually.');
  const address=addresses[0].address;
  const result=await new Promise((resolve,reject)=>{
   const req=get(current,{agent:false,lookup:(host,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{'User-Agent':'Shapeviz-Metadata/1.0','Accept':'text/html','Accept-Encoding':'identity'}},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200||!/^text\/html\b/i.test(res.headers['content-type']||'')){res.resume();reject(fail(422,'Website did not return readable HTML.'));return;}
    let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>512000){req.destroy(fail(413,'Website HTML is too large.'));return;}chunks.push(chunk);});res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
   });const timeout=setTimeout(()=>req.destroy(fail(408,'Website lookup timed out.')),Math.max(1,deadline-Date.now()));req.on('error',reject);req.on('close',()=>clearTimeout(timeout));
  });
  if(result.html!==undefined)return extractMetadata(result.html,current.href);if(!result.redirect)throw fail(422,'Invalid website redirect.');current=new URL(result.redirect,current);
 }throw fail(422,'Too many website redirects.');
}
