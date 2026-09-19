const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function hasSupabase(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}

function baseUrl(env) {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

function headers(env, extra = {}) {
  return { apikey: env.SUPABASE_SECRET_KEY, ...extra };
}

function objectPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

export async function getPresentationProject(slug, { env, send = fetch }) {
  if (!hasSupabase(env) || !slugPattern.test(slug || '')) return null;
  const query = new URLSearchParams({
    deck_slug: `eq.${slug}`,
    select: 'deck_slug,source_type,template_key,client,title,presentation_date,description,locale,status,access_mode,analytics_enabled,slide_count,source_bucket,source_path,media_bucket,media_prefix,cover_path,content,updated_at',
    limit: '1'
  });
  const response = await send(`${baseUrl(env)}/rest/v1/presentation_projects?${query}`, { headers: headers(env) });
  if (!response.ok) throw new Error(`Presentation registry returned ${response.status}`);
  const projects = await response.json();
  return projects[0] || null;
}

export async function getPrivatePresentationSource(project, { env, send = fetch }) {
  const url = `${baseUrl(env)}/storage/v1/object/authenticated/${encodeURIComponent(project.source_bucket)}/${objectPath(project.source_path)}`;
  const response = await send(url, { headers: headers(env) });
  if (!response.ok) throw new Error(`Presentation source returned ${response.status}`);
  return response.text();
}

export function publicMediaBase(project, env) {
  if (!project.media_bucket || !project.media_prefix) return null;
  return `${baseUrl(env)}/storage/v1/object/public/${encodeURIComponent(project.media_bucket)}/${objectPath(project.media_prefix).replace(/%2F$/i, '')}`.replace(/\/$/, '') + '/';
}

export async function uploadStorageObject({ bucket, object, body, contentType, env, send = fetch }) {
  const response = await send(`${baseUrl(env)}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(object)}`, {
    method: 'POST',
    headers: headers(env, { 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' }),
    body
  });
  if (!response.ok) throw new Error(`Upload failed for ${bucket}/${object}: ${response.status} ${await response.text()}`);
}

export async function upsertPresentationProject(project, { env, send = fetch }) {
  const response = await send(`${baseUrl(env)}/rest/v1/presentation_projects?on_conflict=deck_slug`, {
    method: 'POST',
    headers: headers(env, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    }),
    body: JSON.stringify(project)
  });
  if (!response.ok) throw new Error(`Registry update failed: ${response.status} ${await response.text()}`);
  return (await response.json())[0];
}

export { slugPattern };
