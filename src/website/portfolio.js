import {renderPortfolioLayout} from '../../public/site/portfolio-layout.js';
import {defaultPortfolio} from './portfolio-default.js';
import {withLegalFooter} from './legal.js';
import {SITE_ORIGIN} from './seo.js';

export function renderPortfolioPage(locale = 'sk', content = defaultPortfolio) {
  return withLegalFooter(renderPortfolioLayout(content, locale, {origin: SITE_ORIGIN}), locale);
}
