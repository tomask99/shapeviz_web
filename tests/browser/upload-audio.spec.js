import {test,expect} from '@playwright/test';

test('file 31 recovers from throttling without signing again or repeating earlier files',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {uploadPresentation}=await import('/admin/upload.js');
  const puts=[],signs=[],messages=[];let failed=false;
  window.fetch=async(url)=>{puts.push(url);if(url.endsWith('embedded-31.webp')&&!failed){failed=true;return Response.json({code:'SlowDown'},{status:429,headers:{'Retry-After':'1'}});}return new Response('{}');};
  const html=Array.from({length:45},(_,i)=>`<img src="data:image/webp;base64,${btoa(String(i))}">`).join('');
  await uploadPresentation(new File([html],'many.html'),[],async(action,body)=>{signs.push(action);return {...body,url:'https://upload.invalid/'+body.filename,publicUrl:'https://media.invalid/'+body.filename};},m=>messages.push(m));
  return {puts,signs,messages};
 });
 expect(result.puts).toHaveLength(47);
 expect(result.puts.filter(url=>url.endsWith('embedded-31.webp'))).toHaveLength(2);
 expect(result.signs).toEqual(Array(46).fill('sign-upload'));
 expect(result.messages.some(m=>m.includes('retry 1/3'))).toBe(true);
});

test('permanent upload error is not retried, but throttled cleanup is retried',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {uploadPresentation}=await import('/admin/upload.js');let puts=0,cleanups=0;const ids=[];
  window.fetch=async()=>{puts++;return Response.json({code:'EntityTooLarge',message:'secret upstream detail'},{status:413});};
  try {await uploadPresentation(new File(['<img src="data:image/webp;base64,YQ==">'],'bad.html'),[],async(action,body)=>{
   ids.push(body.uploadId);
   if(action==='abort-upload') {if(++cleanups===1)throw Object.assign(new Error('busy'),{status:429});return {};}
   return {...body,url:'/upload'};
  },()=>{});}catch(error){return {puts,cleanups,ids,error:error.message};}
 });
 expect(result.puts).toBe(1);expect(result.cleanups).toBe(2);
 expect(new Set(result.ids).size).toBe(1);
 expect(result.error).toContain('HTTP 413, EntityTooLarge');
 expect(result.error).not.toContain('secret');expect(result.error).not.toContain('cleanup failed');
});

test('embedded MP3 uploads with audio MIME and is replaced with Storage URL',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {uploadPresentation}=await import('/admin/upload.js');const signed=[],puts=[];
  const original=window.fetch;
  window.fetch=async(url,options)=>{puts.push({type:options.headers['Content-Type'],body:await options.body.text()});return new Response('{}');};
  try {
   await uploadPresentation(new File(['<audio controls src="data:audio/mpeg;base64,SUQzBAAAAAAA"></audio>'],'audio.html'),[],async(action,body)=>{signed.push(body);return {uploadId:'00000000-0000-4000-8000-000000000001',url:'/upload',publicUrl:'https://example.supabase.co/storage/v1/object/public/presentation-media/test/'+body.filename};},()=>{});
   return {signed,puts};
  }finally{window.fetch=original;}
 });
 expect(result.signed[0].filename).toBe('embedded-0.mp3');
 expect(result.puts[0].type).toBe('audio/mpeg');
 expect(result.puts[1].body).toContain('/test/embedded-0.mp3');
 expect(result.puts[1].body).not.toContain('data:audio/mpeg');
});

test('all embedded MIME types are checked before uploading any files',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {uploadPresentation}=await import('/admin/upload.js');let calls=0;
  try{await uploadPresentation(new File(['<img src="data:image/png;base64,YQ=="><audio src="data:audio/unknown;base64,YQ==">'],'bad.html'),[],async()=>{calls++;},()=>{});}catch(e){return {calls,error:e.message};}
 });
 expect(result.calls).toBe(0);expect(result.error).toContain('audio/unknown');
});

test('failed transfer cleans up the current upload session',async({page})=>{
 await page.goto('/');
 const actions=await page.evaluate(async()=>{
  const {uploadPresentation}=await import('/admin/upload.js');const actions=[];const original=window.fetch;
  window.fetch=async()=>new Response('Failed',{status:500});
  try{await uploadPresentation(new File(['<audio src="data:audio/mpeg;base64,YQ==">'],'bad.html'),[],async(action,body)=>{actions.push({action,body});return {uploadId:'00000000-0000-4000-8000-000000000001',url:'/upload'};},()=>{});}catch{}finally{window.fetch=original;}return actions;
 });
 expect(actions.map(x=>x.action)).toEqual(['sign-upload','abort-upload']);
 expect(actions[1].body.uploadId).toBe(actions[0].body.uploadId);
});
