import {createWebsiteEventHandler} from './events.js';
import {createShopHandler} from '../shop/handler.js';
import {createPublicPageHandler} from './page.js';

// Share a Vercel function to stay within the project's Hobby function limit.
export function createWebsiteHandler(options = {}) {
  const events = createWebsiteEventHandler(options);
  const shop = createShopHandler(options);
  const page = createPublicPageHandler(options);
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('route') === 'page') return page(req, res);
    return url.pathname === '/api/shop' || url.searchParams.get('route') === 'shop'
      ? shop(req, res)
      : events(req, res);
  };
}
