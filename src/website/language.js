export const supportedLanguages = ['sk', 'en'];
export function preferredLanguage(headers = {}, env = {}) {
  const saved = /(?:^|;\s*)sv_language=(sk|en)(?:;|$)/.exec(headers.cookie || '')?.[1];
  if (saved) return saved;
  // Vercel supplies the country header. Local requests use browser preferences.
  if (env.VERCEL === '1' && headers['x-vercel-ip-country'] === 'SK') return 'sk';
  const languages = String(headers['accept-language'] || '').split(',').map((part, index) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const quality = params.find(value => value.trim().startsWith('q='));
    return {language: tag.split('-')[0], quality: quality ? Number(quality.trim().slice(2)) : 1, index};
  }).filter(item => supportedLanguages.includes(item.language) && item.quality > 0 && item.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return languages[0]?.language || 'en';
}
