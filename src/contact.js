export const services = ['Visual identity', 'CGI & 3D', 'Motion & content', 'Something else'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Please complete the form.';
  if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100 || /[\r\n]/.test(body.name)) return 'Please enter your name (2–100 characters).';
  if (typeof body.email !== 'string' || body.email.length > 254 || !emailPattern.test(body.email.trim())) return 'Please enter a valid email address.';
  if (typeof body.company !== 'string' || body.company.length > 150) return 'Please keep the company name under 150 characters.';
  if (!Array.isArray(body.services) || body.services.length > services.length || body.services.some(value => !services.includes(value))) return 'Please choose one of the listed services.';
  if (typeof body.message !== 'string' || body.message.trim().length < 20 || body.message.length > 5000) return 'Tell us a little more about your project (20–5,000 characters).';
  if (body.consent !== true) return 'Please allow us to use your details to respond to this inquiry.';
  return null;
}

export function createContactHandler({ env, send }) {
  const attempts = new Map();
  return async (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: status === 200, message }));
    };
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); reply(405, 'Use the contact form to send an inquiry.'); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { reply(415, 'Please submit the contact form.'); return; }
    if (req.headers.origin) {
      const allowed = env.SITE_URL ? new URL(env.SITE_URL).origin : `http://${req.headers.host}`;
      if (req.headers.origin !== allowed) { reply(403, 'This request could not be accepted.'); return; }
    }
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
    // Only trust the direct peer. Forwarded IP headers can be forged unless a proxy is configured.
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) || { count: 0, expires: now + 600_000 };
    if (attempt.count >= 5) { res.setHeader('Retry-After', String(Math.ceil((attempt.expires - now) / 1000))); reply(429, 'Please wait a few minutes before sending another inquiry.'); return; }
    attempt.count++;
    attempts.set(ip, attempt);
    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16_384) { reply(413, 'Your message is too long. Please keep it under 5,000 characters.'); return; }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { reply(400, 'The form could not be read. Please try again.'); return; }
    if (body?.website) { reply(400, 'This request could not be accepted.'); return; }
    const error = validateContact(body);
    if (error) { reply(400, error); return; }
    if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
      reply(503, 'The contact form is not accepting messages yet. Your message has not been sent. Please try again later.'); return;
    }
    try {
      const result = await send('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM_EMAIL,
          to: [env.CONTACT_TO_EMAIL],
          reply_to: body.email.trim(),
          subject: `Shapeviz inquiry — ${body.name.trim()}`,
          text: `Name: ${body.name.trim()}\nEmail: ${body.email.trim()}\nCompany: ${body.company.trim() || 'Not specified'}\nInterested in: ${body.services.join(', ') || 'Let’s discuss'}\n\n${body.message.trim()}\n\nPermission to respond: yes`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const receipt = result.ok ? await result.json() : null;
      if (!receipt?.id) throw new Error('Delivery provider did not accept the message');
      reply(200, 'Thank you. Your inquiry is on its way. We’ll be in touch.');
    } catch { reply(502, 'Your message could not be sent. Your details are still here — please try again.'); }
  };
}
