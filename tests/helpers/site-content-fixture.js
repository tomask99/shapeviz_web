import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';

export async function siteContentFixture() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await readFile(new URL('../../supabase/migrations/20261115105042_site_content.sql', import.meta.url), 'utf8'));
  let unavailable = false;
  const send = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') {
      if (options.headers.Authorization === 'Bearer owner') return Response.json({id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test'});
      if (options.headers.Authorization === 'Bearer visitor') return Response.json({id: 'visitor'});
      return Response.json({error: 'Denied'}, {status: 401});
    }
    if (url.pathname === '/rest/v1/presentation_admins') return Response.json(url.searchParams.get('user_id') === 'eq.11111111-1111-4111-8111-111111111111' ? [{role: 'owner'}] : []);
    if (url.pathname === '/rest/v1/site_content') {
      if (unavailable) return Response.json({error: 'Unavailable'}, {status: 503});
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        const version = Number(url.searchParams.get('version').slice(3));
        const result = await db.query('update site_content set companies=$1, version=$2, updated_at=$3 where id=1 and version=$4 returning companies,version', [JSON.stringify(body.companies), body.version, body.updated_at, version]);
        return Response.json(result.rows);
      }
      return Response.json((await db.query('select companies,version from site_content where id=1')).rows);
    }
    if (url.pathname.includes('crm_time')) return Response.json({entries: [], items: [], timer: null, active: null});
    return Response.json([]);
  };
  const server = createApp({env: {SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'test'}, send});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (action, body, role = 'owner') => fetch(origin + '/api/admin?action=' + action, {
    method: body ? 'POST' : 'GET',
    headers: {...(role ? {Cookie: 'sv_access=' + role} : {}), ...(body ? {Origin: origin, 'Content-Type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  return {
    db, origin, request,
    setUnavailable(value) { unavailable = value; },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await db.close();
    }
  };
}
