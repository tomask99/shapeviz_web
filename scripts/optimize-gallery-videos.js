import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';

// Pass a local ffmpeg executable, or use one available on PATH.
const ffmpeg = process.argv[2] || 'ffmpeg';
let before = 0, after = 0;
for (const id of ['video_creative_02', 'video_creative_03']) {
  const input = `assets/galery/${id}.mp4`, output = `public/media/gallery/${id}.mp4`;
  before += (await stat(input)).size;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=-2:1080,fps=30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', output], { stdio: 'inherit' });
  after += (await stat(output)).size;
}
console.log(`Videos: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB, H.264 / fast start.`);
