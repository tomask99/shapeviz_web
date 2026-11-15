// Reproducible preparation of CC0 illustrations for the first article.
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const api='https://ambientcg.com/api/v2/full_json?id=WoodFloor051&include=previewData';
const response=await fetch(api);if(!response.ok)throw new Error('ambientCG unavailable');
const asset=(await response.json()).foundAssets.find(a=>a.assetId==='WoodFloor051');
if(!asset)throw new Error('CC0 source material not found');
const maps=new URLSearchParams(new URL(asset.previewLinks.find(p=>p.name.slug==='pbr-one-material-shading').url).hash.slice(1));
const images=[
  ['wood-pbr-material',asset.previewImage['2048-JPG-242424']],
  ['wood-base-color',maps.get('color_url')],
  ['wood-roughness',maps.get('roughness_url')],
  ['wood-normal',maps.get('normal_url')],
];
await mkdir('public/media/articles',{recursive:true});
const records=[];
for(const [name,source] of images){
  const res=await fetch(source);if(!res.ok)throw new Error(`Download failed: ${res.status}`);
  const input=Buffer.from(await res.arrayBuffer());
  const media=await sharp(input).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:83,effort:6}).toBuffer({resolveWithObject:true});
  const small=await sharp(media.data).resize({width:800,height:800,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:6}).toBuffer();
  await writeFile(`public/media/articles/${name}.webp`,media.data);
  await writeFile(`public/media/articles/${name}-small.webp`,small);
  records.push({name,source,width:media.info.width,height:media.info.height,originalBytes:input.length,webpBytes:media.data.length,smallBytes:small.length});
}
await writeFile('docs/article-images.json',JSON.stringify({asset:'WoodFloor051',creator:'ambientCG',assetPage:'https://ambientcg.com/a/WoodFloor051',license:'CC0 1.0 Universal',licenseUrl:'https://docs.ambientcg.com/license/',retrievedAt:new Date().toISOString(),notes:'Material render and map previews supplied by ambientCG. Resized and encoded to WebP for editorial display, not production texture downloads. The normal-map illustration uses the source DirectX convention.',images:records},null,2)+'\n');
console.log(records);
