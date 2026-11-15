export function companyProjectUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('Use a project URL of at most 2048 characters.');
  }
  const input = value.trim();
  if (!input) return '';
  if (/[\u0000-\u0020\u007f\\]/.test(input)) {
    throw new Error('Use a valid project URL without spaces.');
  }
  const internal = input.startsWith('/') && !input.startsWith('//');
  let url;
  try {
    url = new URL(input, internal ? 'https://www.shapeviz.com' : undefined);
  } catch {
    throw new Error('Enter an https:// URL or a site path such as /p/project.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS project URL without login details.');
  }
  const normalized = internal ? url.pathname + url.search + url.hash : url.href;
  if (normalized.length > 2048 || normalized.startsWith('//')) {
    throw new Error('Use a project URL of at most 2048 characters or a path starting with one slash.');
  }
  return normalized;
}
