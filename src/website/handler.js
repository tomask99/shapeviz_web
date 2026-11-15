import {createWebsiteEventHandler} from './events.js';
import {createShopHandler} from '../shop/handler.js';
import {createPublicPageHandler} from './page.js';
import {createProductPageHandler} from '../shop/pages.js';
import {createArticlesHandler} from '../articles/pages.js';

// Share a Vercel function to stay within the project's Hobby function limit.
export function createWebsiteHandler(options = {}) {
  const events = createWebsiteEventHandler(options);
  const shop = createShopHandler(options);
  const page = createPublicPageHandler(options);
  const product = createProductPageHandler(options);
  const articles = createArticlesHandler(options);
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (['articles','articles-sitemap'].includes(url.searchParams.get('route')) || url.pathname === '/sitemap-articles.xml' || /^\/articles(?:\/[a-z0-9-]+)?\/?$/.test(url.pathname)) return articles(req,res);
    if (['product','shop-sitemap'].includes(url.searchParams.get('route')) || url.pathname === '/sitemap-products.xml' || /^\/shop\/[a-z0-9-]+\/?$/.test(url.pathname)) return product(req,res);
    if (url.searchParams.get('route') === 'page') return page(req, res);
    return url.pathname === '/api/shop' || url.searchParams.get('route') === 'shop'
      ? shop(req, res)
      : events(req, res);
  };
}
