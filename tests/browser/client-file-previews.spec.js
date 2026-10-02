import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const token='p'.repeat(32),root={id:'rootroot',name:'Renders',directory:true,parent:null,size:0};
const png=await sharp({create:{width:640,height:360,channels:3,background:'#d88739'}}).png().toBuffer();
async function previews(page,{count=1,broken=false,slow=false,videoBytes}={}) {
  const images=Array.from({length:count},(_,i)=>({id:'image00'+i,parent:root.id,name:videoBytes?`Video ${i+1}.webm`:`Render ${i+1}.png`,directory:false,size:(videoBytes||png).length}));
  const other={id:'model001',parent:root.id,name:'Sofa.fbx',directory:false,size:2*1024**3};
  let requests=0;
  await page.route('**/api/files?*',route=>{
    const p=new URL(route.request().url()).searchParams,restricted=!!p.get('share');
    const current=images.find(image=>image.id===p.get('node'))||(restricted?images[0]:root);
    if(p.get('action')==='preview'||p.get('action')==='download') {
      expect(current.directory).toBe(false);if(p.get('action')==='preview')requests++;
      return route.fulfill({json:{file:current,download:{downloadId:['abcdefgh',current.id],key:'mock'}}});
    }
    return route.fulfill({json:{collection:{title:'Render collection'},restricted,current,breadcrumbs:restricted?[current]:current===root?[root]:[root,current],items:current===root?[...images,other]:[],total:images.length+1,page:1,hasMore:false}});
  });
  await page.route('**/files/vendor/megajs.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
    export class API {request(){} close(){this.closed=true;}}
    export class File {
      constructor(options){this.id=options.downloadId[1];}
      download(){
        let cancelled=false;const id=this.id;
        return {destroy(){cancelled=true;},async *[Symbol.asyncIterator](){
          window.activePreviews=(window.activePreviews||0)+1;window.maxPreviews=Math.max(window.maxPreviews||0,window.activePreviews);
          try{
            ${slow?'await new Promise(resolve=>setTimeout(resolve,800));':''}
            if(cancelled)throw new DOMException('Cancelled','AbortError');
            yield Uint8Array.from(atob('${(videoBytes||png).toString('base64')}'),c=>c.charCodeAt(0));
            ${broken?"if(id==='image000')throw new Error('Integrity check failed');":''}
          }finally{window.activePreviews--;}
        }};
      }
    }`
  }));
  return {images,requests:()=>requests};
}

test('image thumbnails resize without refetching, remember the size, and open a larger detail preview',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fixture=await previews(page);
  await page.goto('/files/renders#access='+token);
  const thumbnail=page.locator('.image-preview'),slider=page.getByRole('slider',{name:'Preview size'});
  await expect(thumbnail).toHaveAttribute('data-preview-state','ready');
  await expect(thumbnail.locator('img')).toBeVisible();
  await expect(thumbnail).toHaveCSS('width','160px');
  await slider.fill('320');await expect(thumbnail).toHaveCSS('width','320px');
  await page.screenshot({path:'.cache/preview-size-desktop.png',fullPage:true});
  expect(fixture.requests()).toBe(1);
  await page.reload();await expect(slider).toHaveValue('320');
  await expect(thumbnail).toHaveAttribute('data-preview-state','ready');
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.cache/preview-size-mobile.png',fullPage:true});
  await page.getByRole('link',{name:/Render 1.png/}).click();
  await expect(page.locator('.detail-image')).toHaveAttribute('data-preview-state','ready');
  await expect(page.getByRole('button',{name:'Download file'})).toBeEnabled();
  await page.goto('/files/share/'+token);
  await expect(page.locator('.detail-image')).toHaveAttribute('data-preview-state','ready');
  await expect(page.getByRole('link',{name:'All files',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preview integrity failure keeps file actions usable and leaves the original download available',async({page})=>{
  await previews(page,{broken:true});await page.goto('/files/renders#access='+token);
  await expect(page.locator('.image-preview')).toHaveAttribute('data-preview-state','unavailable');
  await expect(page.locator('.image-preview img')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Download Render 1.png',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Copy link to Render 1.png',exact:true})).toBeEnabled();
});

test('previews load lazily with bounded concurrency and stop when navigating away',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fixture=await previews(page,{count:20,slow:true});
  await page.goto('/files/renders#access='+token);
  await expect(page.locator('.image-preview img').first()).toBeVisible();
  expect(fixture.requests()).toBeLessThan(20);
  expect(await page.evaluate(()=>window.maxPreviews)).toBeLessThanOrEqual(2);
  await page.getByRole('link',{name:/Render 1.png/}).click();
  await expect(page.locator('.detail-image')).toHaveAttribute('data-preview-state','ready');
  await expect.poll(()=>page.evaluate(()=>window.activePreviews)).toBe(0);
  expect(errors).toEqual([]);
});


test('video failures and oversized files keep downloads available',async({page})=>{
  const fixture=await previews(page,{videoBytes:Buffer.from('invalid video'),broken:true});
  await page.goto('/files/share/'+token);
  await page.getByRole('button',{name:'Load video preview'}).click();
  await expect(page.locator('[data-video-preview] [role=status]')).toContainText('Preview unavailable');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Download file',exact:true})).toBeEnabled();
  fixture.images[0].size=129*1024*1024;
  await page.reload();
  await expect(page.locator('[data-video-preview]')).toContainText('128 MB preview limit');
  await expect(page.getByRole('button',{name:'Load video preview'})).toBeHidden();
  expect(fixture.requests()).toBe(1);
});

test('video preview loads on demand, plays, seeks and cleans up on desktop and mobile',async({page})=>{
  await page.goto('/');
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
    recorder.ondataavailable=e=>chunks.push(e.data);
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
    for(let i=0;i<12;i++){canvas.getContext('2d').fillStyle=i%2?'#d88739':'#121110';canvas.getContext('2d').fillRect(0,0,320,180);await new Promise(r=>setTimeout(r,100));}
    recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  const fixture=await previews(page,{videoBytes:Buffer.from(bytes)});
  await page.goto('/files/renders#access='+token);
  expect(fixture.requests()).toBe(0);
  await page.getByRole('link',{name:/Video 1.webm/}).click();
  const load=page.getByRole('button',{name:'Load video preview'});
  await expect(load).toBeEnabled();expect(fixture.requests()).toBe(0);
  await load.click();
  const video=page.getByLabel('Video preview: Video 1.webm');
  await expect(video).toBeVisible();
  await video.evaluate(async video=>{await video.play();});
  await expect.poll(()=>video.evaluate(video=>video.currentTime)).toBeGreaterThan(0);
  await video.evaluate(video=>{video.pause();video.currentTime=.3;});
  await expect.poll(()=>video.evaluate(video=>video.currentTime)).toBeCloseTo(.3,1);
  await page.screenshot({path:'.cache/video-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(video).toBeVisible();await page.screenshot({path:'.cache/video-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'All files',exact:true}).click();
  await expect(page.locator('video')).toHaveCount(0);
  await page.goto('/files/share/'+token);await page.getByRole('button',{name:'Load video preview'}).click();
  await expect(page.getByLabel('Video preview: Video 1.webm')).toBeVisible();
});
