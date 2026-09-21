// Keep ownership metadata with the project so cleanup can be retried even after
// its HTML has been removed. Never delete Storage metadata directly in SQL.
const buckets = new Set(['presentation-source', 'presentation-media']);
export function referencedMedia(html, root) {
  const scopes = [];
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
    let url; try { url=new URL(match[0].replaceAll('&amp;','&')); } catch { continue; }
    const base=new URL(root);
    if (url.origin !== base.origin || !url.pathname.startsWith('/storage/v1/object/public/presentation-media/')) continue;
    const path=decodeURIComponent(url.pathname.slice('/storage/v1/object/public/presentation-media/'.length));
    scopes.push({bucket:'presentation-media',path});
  }
  return scopes;
}
export function storageScopes(project) {
  const scopes = [...(project.content?._storageScopes || [])];
  if (project.source_bucket && project.source_path) scopes.push({bucket:project.source_bucket, path:project.source_path});
  if (project.media_bucket && project.media_prefix) scopes.push({bucket:project.media_bucket, prefix:project.media_prefix});
  for (const scope of scopes) {
    const value = scope.path || scope.prefix;
    if (!buckets.has(scope.bucket) || typeof value !== 'string' || !value || value.startsWith('/') || value.split('/').some(p => p === '..' || p === '.')) throw new Error('Invalid storage ownership metadata');
    if (scope.prefix && (!scope.prefix.endsWith('/') || !scope.prefix.slice(0,-1).includes('/'))) throw new Error('Storage prefix must identify a specific upload');
  }
  return scopes;
}

export async function removeProjectFiles(project, call) {
  const scopes = storageScopes(project);
  const others = [];
  for (let offset=0;;offset+=500) {
    const rows = await call(`/rest/v1/presentation_projects?deck_slug=neq.${project.deck_slug}&select=*&order=deck_slug&limit=500&offset=${offset}`);
    if (!Array.isArray(rows)) throw new Error('Could not read storage references');
    others.push(...rows);
    if (rows.length < 500) break;
  }
  const protectedScopes = others.flatMap(storageScopes);
  // Old standalone records without ownership metadata cannot safely participate
  // in shared-media cleanup. Fail closed rather than breaking their media.
  if (others.some(p => p.source_type === 'standalone' && !p.content?._storageScopes && !p.media_prefix)) throw Object.assign(new Error('An older presentation needs storage ownership metadata before files can be deleted.'),{status:409});
  const files = new Map();
  async function list(bucket, prefix) {
    for (let offset=0;;offset+=100) {
      const rows = await call(`/storage/v1/object/list/${bucket}`, {method:'POST',body:{prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}}});
      if (!Array.isArray(rows)) throw new Error('Could not list presentation files');
      for (const row of rows) {
        if (!row.name || row.name.includes('/') || row.name === '..' || row.name === '.') throw new Error('Invalid storage listing');
        const name = prefix + row.name;
        if (row.id) files.set(bucket+'/'+name,{bucket,path:name});
        else await list(bucket,name+'/');
      }
      if (rows.length < 100) break;
    }
  }
  for (const scope of scopes) {
    if (scope.path) files.set(scope.bucket+'/'+scope.path,scope);
    else await list(scope.bucket,scope.prefix);
  }
  const removable = [...files.values()].filter(file => !protectedScopes.some(scope => scope.bucket === file.bucket && (scope.path === file.path || scope.prefix && file.path.startsWith(scope.prefix))));
  // Media first, HTML last. A failure leaves the registry/manifest for retry.
  for (const bucket of ['presentation-media','presentation-source']) {
    const paths = removable.filter(file => file.bucket === bucket).map(file => file.path);
    for (let offset=0;offset<paths.length;offset+=100) await call(`/storage/v1/object/${bucket}`,{method:'DELETE',body:{prefixes:paths.slice(offset,offset+100)}});
  }
  return {deletedFiles:removable.length,sharedFiles:files.size-removable.length};
}
