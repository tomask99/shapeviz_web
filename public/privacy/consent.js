export const CONSENT_COOKIE = 'sv_analytics';
export const CONSENT_VERSION = '1';
export const CONSENT_MAX_AGE = 180 * 86400;

export function readConsent(cookies, now = Date.now()) {
  const values = String(cookies || '').split(';').map(v => v.trim()).filter(v => v.startsWith(CONSENT_COOKIE + '='));
  if (values.length !== 1) return null;
  const match = /^sv_analytics=(1)\.(yes|no)\.(\d{13})$/.exec(values[0]);
  if (!match) return null;
  const time = Number(match[3]);
  if (time > now || now - time >= CONSENT_MAX_AGE * 1000) return null;
  return {analytics: match[2] === 'yes', time, version: match[1]};
}

export function analyticsAllowed() {
  return navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl && readConsent(document.cookie)?.analytics === true;
}
