export function portfolioFixture() {
  const env = {SUPABASE_URL:'https://portfolio-test.supabase.co', SUPABASE_SECRET_KEY:'fixture-key'};
  const owner = 'a7a1bde4-b7f5-4f85-9f8a-4e7f50cbec37';
  const uploads = [];
  let snapshot = {portfolio:null, portfolio_version:1};
  async function send(input, options = {}) {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') {
      return options.headers.Authorization === 'Bearer owner-token'
        ? Response.json({id:owner, email:'owner@example.com'})
        : new Response(null, {status:401});
    }
    if (url.pathname === '/rest/v1/presentation_admins') return Response.json([{role:'owner'}]);
    if (url.pathname.startsWith('/storage/v1/object/upload/sign/site-portfolio/')) {
      uploads.push({path:url.pathname, method:options.method, upsert:options.headers['x-upsert']});
      return Response.json({url:url.pathname.slice('/storage/v1'.length) + '?token=test-signature'});
    }
    if (url.pathname === '/rest/v1/site_content') {
      if (options.method === 'PATCH') {
        if (url.searchParams.get('portfolio_version') !== 'eq.' + snapshot.portfolio_version) return Response.json([]);
        const {portfolio, portfolio_version} = JSON.parse(options.body);
        snapshot = {portfolio, portfolio_version};
      }
      return Response.json([{...snapshot, companies:[], version:1, gallery:null, about:null}]);
    }
    return Response.json([]);
  }
  return {env, send, owner, uploads};
}
