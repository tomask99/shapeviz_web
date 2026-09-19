import sharp from 'sharp';
import { readdir, mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Run explicitly after changing assets/galery; production serves the prepared files.
const source = 'assets/galery', output = 'public/media/gallery';
const prepareMedia = !process.argv.includes('--markup-only');
await mkdir(output, { recursive: true });
const groups = [
  { id: 'lifestyle', title: 'Lifestyle shots', description: 'Objects in their element. Spaces with a story.', items: [] },
  { id: 'details', title: 'Details / material variations', description: 'A closer look. Texture, colour and the feeling of a finish.', items: [] },
  { id: 'studio', title: 'Studio shots', description: 'Pure form. Nothing to distract from the design.', items: [] },
  { id: 'videos', title: 'Videos', description: 'Light, form and atmosphere. In motion.', items: [] },
];
const descriptions = {
  'detail_01': 'Mustard upholstered chair with sculpted stitching in sunlight',
  'detail_02': 'Close-up of a textured green armchair and its curved upholstery',
  'detail_04': 'Hand resting on a cream sofa, highlighting soft upholstery and seams',
  'final-2w': 'Minimal kitchen with warm cabinetry and soft natural light',
  'lifestyle_01': 'Cream modular sofa in a sunlit room with tall windows',
  'lifestyle_02': 'Cream sofa beside a fireplace in a warm classical interior',
  'lifestyle_03': 'Sunlight and a resting hand across a cream modular sofa',
  'lifestyle_05': 'Mustard chair in a light-filled interior with tall windows',
  'lifestyle_06': 'Green lounge chair framed by windows and flowing curtains',
  'lifestyle_07': 'Open kitchen drawer with neatly arranged utensils',
  'lifestyle_08': 'Kitchen storage with ceramics and warm natural materials',
  'material-variation_01': 'Modular sofa in a light cream material',
  'material-variation_02': 'Modular sofa in a warm brown material',
  'material-variation_03': 'Modular sofa in a cool grey material',
  'shapeviz-kitchen-scene1_4_girl_2': 'Woman in a minimal kitchen with pale cabinetry and natural light',
  'social_ad_03': 'Green upholstered chair styled with dried grasses and warm materials',
  'studio_01': 'Terracotta modular sofa against a neutral studio background',
  'studio_02': 'Studio close-up of a terracotta sofa arm and textured fabric',
  'studio_03': 'Cream modular corner sofa against a white studio background',
  'studio_04': 'Rear view of a cream modular sofa against a white background',
};
let inputBytes = 0, fullBytes = 0;
for (const file of (await readdir(source)).sort()) {
  const ext = path.extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) throw new Error(`Unsupported gallery file: ${file}`);
  const id = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]+/g, '-');
  const input = path.join(source, file);
  if (ext === '.mp4') {
    if (prepareMedia) await copyFile(input, `${output}/${id}.mp4`);
    groups[3].items.push({ id, video: true, file });
    continue;
  }
  inputBytes += (await stat(input)).size;
  const metadata = await sharp(input).metadata();
  const widths = [...new Set([Math.min(640, metadata.width), Math.min(1280, metadata.width), Math.min(1920, metadata.width)])];
  const variants = [];
  for (const width of widths) {
    const filename = `${id}-${width}.webp`;
    if (prepareMedia) await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(`${output}/${filename}`);
    variants.push({ width, url: `/media/gallery/${filename}` });
  }
  fullBytes += (await stat(`public${variants.at(-1).url}`)).size;
  const group = /^studio_/.test(id) ? groups[2] : /^(detail_|material-)/.test(id) ? groups[1] : groups[0];
  group.items.push({ id, file, width: metadata.width, height: metadata.height, alt: descriptions[id] || group.title, variants });
}
const arrow = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M12 4v16m-7-7 7 7 7-7"/></svg>';
const image = item => `<button class="image-button" type="button" aria-label="Enlarge: ${item.alt}" data-lightbox="${item.variants.at(-1).url}"><span class="media-clip"><img data-gallery-src="${item.variants[0].url}" data-gallery-srcset="${item.variants.map(v => `${v.url} ${v.width}w`).join(', ')}" sizes="(max-width: 700px) 90vw, 43vw" width="${item.width}" height="${item.height}" alt="${item.alt}" loading="lazy" decoding="async"></span></button>`;
const video = item => `<div class="video-frame"><div class="media-clip"><video width="${item.id.endsWith('02') ? 2160 : 1720}" height="${item.id.endsWith('02') ? 3840 : 2136}" muted loop playsinline preload="none" controls data-autoplay data-src="/media/gallery/${item.id}.mp4" data-gallery-poster="/media/gallery/${item.id}-poster.webp" aria-label="Furniture motion study ${item.id.endsWith('02') ? '02' : '03'}"></video><div class="video-controls" hidden><button type="button" class="video-play" aria-label="Play video"><span aria-hidden="true">&#9654;</span></button><span class="micro">IN MOTION</span><button type="button" class="video-sound" aria-label="Unmute video" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="sound-off" d="m16 9 6 6m0-6-6 6"/><path class="sound-on" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg></button></div></div></div>`;
const markup = `<!-- GALLERY START -->
      <div class="gallery-toggle-wrap"><button id="gallery-toggle" class="gallery-toggle micro" aria-expanded="false" aria-controls="expanded-gallery"><span>EXPAND GALLERY</span>${arrow}</button><span class="gallery-count micro">20 IMAGES / 02 FILMS</span></div>
      <div id="expanded-gallery" hidden>
        <header class="gallery-intro"><div><span class="micro accent">THE SHAPEVIZ COLLECTION</span><h3>A study in<br><span>desire.</span></h3></div><p>Spaces, surfaces and stories.<br>A closer look at the worlds we create.</p></header>
        <div class="gallery-toolbar"><div class="gallery-tabs" role="tablist" aria-label="Gallery categories">${groups.map((group, index) => `<button type="button" role="tab" id="tab-${group.id}" aria-controls="collection-${group.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${['Lifestyle', 'Details & materials', 'Studio', 'Films'][index]}<sup>${String(group.items.length).padStart(2, '0')}</sup></button>`).join('')}</div><button class="gallery-collapse micro" type="button" aria-controls="expanded-gallery">CLOSE ${arrow}</button></div>
        ${groups.map((group, index) => `<section class="gallery-section" id="collection-${group.id}" role="tabpanel" aria-labelledby="tab-${group.id}" tabindex="0"${index ? ' hidden' : ''}><header class="gallery-heading"><span class="micro accent">0${index + 1} / ${String(group.items.length).padStart(2, '0')} ${index === 3 ? 'FILMS' : 'IMAGES'}</span><h3 id="gallery-${group.id}">${group.title}</h3><p>${group.description}</p></header><div class="gallery-grid">${group.items.map((item, i) => `<div class="gallery-slot"><figure class="gallery-item${item.video ? ' gallery-film' : ''}" data-gallery-file="${item.file}">${item.video ? video(item) : image(item)}<figcaption><span>${group.id === 'videos' ? 'MOTION STUDY' : 'SHAPEVIZ'}</span><span>${String(i + 1).padStart(2, '0')} / ${String(group.items.length).padStart(2, '0')}</span></figcaption></figure></div>`).join('\n')}</div></section>`).join('\n')}
        <div class="gallery-end"><p class="micro">DESIGNED TO BE DESIRED.</p><button class="gallery-collapse micro" type="button" aria-controls="expanded-gallery">CLOSE GALLERY ${arrow}</button></div>
      </div>
      <!-- GALLERY END -->`;
let html = await readFile('public/index.html', 'utf8');
if (html.includes('<!-- GALLERY START -->')) html = html.replace(/<!-- GALLERY START -->[\s\S]*?<!-- GALLERY END -->/, markup);
if (!html.includes('<!-- GALLERY START -->')) html = html.replace(/(    <\/section>\s*<section class="clients)/, `${markup}\n$1`);
await writeFile('public/index.html', html);
await writeFile(`${output}/manifest.json`, JSON.stringify(groups, null, 2) + '\n');
console.log(`${groups.reduce((n, g) => n + g.items.length, 0)} gallery assets prepared. Images: ${(inputBytes / 1e6).toFixed(1)} MB originals -> ${(fullBytes / 1e6).toFixed(1)} MB largest WebP variants.`);
