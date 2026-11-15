import {CONSENT_COOKIE, CONSENT_VERSION, CONSENT_MAX_AGE, readConsent} from './consent.js';

const sk = document.documentElement.lang === 'sk';
const copy = sk ? {
  title:'Meranie návštevnosti',
  body:'S tvojím súhlasom meriame návštevy, čas na webe, typ zariadenia, približnú polohu a zdroj návštevy. Odmietnutie neobmedzí používanie webu. Voľbu môžeš kedykoľvek zmeniť v pätičke.',
  accept:'Povoliť analytiku', reject:'Odmietnuť analytiku', close:'Zavrieť', privacy:'Ochrana osobných údajov',
} : {
  title:'Website analytics',
  body:'With your consent, we measure visits, time on the site, device type, approximate location and referral source. Declining does not limit access to the site. You can change your choice in the footer at any time.',
  accept:'Allow analytics', reject:'Decline analytics', close:'Close', privacy:'Privacy notice',
};
const dialog = document.createElement('dialog');
dialog.className = 'privacy-dialog';
dialog.setAttribute('aria-labelledby', 'privacy-title');
dialog.setAttribute('aria-describedby', 'privacy-description');
dialog.innerHTML = `<h2 id="privacy-title">${copy.title}</h2><p id="privacy-description">${copy.body}</p><a href="${sk ? '/sk/ochrana-osobnych-udajov' : '/en/privacy'}">${copy.privacy}</a><div class="privacy-actions"><button type="button" data-choice="no">${copy.reject}</button><button type="button" data-choice="yes">${copy.accept}</button></div><button type="button" class="privacy-close" aria-label="${copy.close}">${copy.close}</button>`;
document.body.append(dialog);
function choose(analytics) {
  document.cookie = `${CONSENT_COOKIE}=${CONSENT_VERSION}.${analytics ? 'yes' : 'no'}.${Date.now()}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  if (!analytics) { try { sessionStorage.removeItem('sv-website-session-v1'); } catch {} }
  dispatchEvent(new Event('shapeviz:consent'));
  dialog.close();
}
dialog.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice === 'yes')));
dialog.querySelector('.privacy-close').addEventListener('click', () => dialog.close());
document.querySelectorAll('[data-privacy-settings]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  if (dialog.open) dialog.close();
  dialog.showModal();
}));
// Closing or ignoring the dialog never grants consent. Shop/legal pages do not track.
if (document.querySelector('script[src="/site-tracker.js"]') && !readConsent(document.cookie) && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl) dialog.show();
