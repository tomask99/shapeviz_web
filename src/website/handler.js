import {createWebsiteEventHandler} from './events.js';
import {createShopHandler} from '../shop/handler.js';

// Share a Vercel function to stay within the project's Hobby function limit.
export function createWebsiteHandler(options = {}) {
  const events = createWebsiteEventHandler(options);
  const shop = createShopHandler(options);
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    return url.pathname === '/api/shop' || url.searchParams.get('route') === 'shop'
      ? shop(req, res)
      : events(req, res);
  };
}
