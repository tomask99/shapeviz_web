export function requestOrigin(req, env) {
  if (env.VERCEL) return `https://${req.headers.host}`;
  return env.SITE_URL ? new URL(env.SITE_URL).origin : `http://${req.headers.host}`;
}

export async function readJson(req, maximum = 8192) {
  if (req.body !== undefined) {
    const value = req.body;
    const encoded = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
    if (Buffer.byteLength(encoded) > maximum) throw Object.assign(new Error('Payload too large'), { status: 413 });
    return typeof value === 'string' || Buffer.isBuffer(value) ? JSON.parse(value.toString()) : value;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maximum) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
