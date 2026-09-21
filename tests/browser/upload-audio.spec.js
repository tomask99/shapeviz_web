import {test,expect} from '@playwright/test';

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
 expect(actions[1].body.uploadId).toBe('00000000-0000-4000-8000-000000000001');
});
