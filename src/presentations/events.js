import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPresentationProject, hasSupabase } from './remote.js';
import { readJson, requestOrigin } from '../http.js';
import { notifyPresentationOpened } from './telegram.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventTypes = new Set([
  'session_started', 'slide_viewed', 'slide_reached_max',
  'video_started', 'video_completed', 'session_heartbeat', 'session_ended', 'website_clicked'
]);

function json(res, status, body, headers = {}) {
  const value = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(value), ...headers });
  res.end(value);
}

function cleanEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Invalid event'), { status: 400 });
  if (!slugPattern.test(body.deck || '') || !uuidPattern.test(body.sessionId || '') || !uuidPattern.test(body.eventId || '') || !eventTypes.has(body.eventType)) {
    throw Object.assign(new Error('Invalid event'), { status: 400 });
  }
  const integer = (value, minimum, maximum, fallback = null) => {
    if (value === undefined || value === null) return fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw Object.assign(new Error('Invalid event'), { status: 400 });
    return value;
  };
  const slideIndex = integer(body.slideIndex, 1, 1000);
  const activeSeconds = integer(body.activeSeconds, 0, 300, 0);
  const videoId = body.videoId === undefined ? null : body.videoId;
  if (videoId !== null && (typeof videoId !== 'string' || videoId.length < 1 || videoId.length > 120)) {
    throw Object.assign(new Error('Invalid event'), { status: 400 });
  }
  const videoProgress = body.videoProgress === undefined ? null : body.videoProgress;
  if (videoProgress !== null && (typeof videoProgress !== 'number' || videoProgress < 0 || videoProgress > 1)) {
    throw Object.assign(new Error('Invalid event'), { status: 400 });
  }
  return { deck: body.deck, sessionId: body.sessionId, eventId: body.eventId, eventType: body.eventType, slideIndex, activeSeconds, videoId, videoProgress };
}

function userAgentCategory(value = '') {
  if (/ipad|tablet/i.test(value)) return 'tablet';
  if (/mobile|android|iphone/i.test(value)) return 'mobile';
  return value ? 'desktop' : 'unknown';
}

export function createPresentationEventHandler({ env = process.env, send = fetch, presentationsRoot = path.resolve('presentations') } = {}) {
  const attempts = new Map();
  return async function presentationEvent(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    // HTML decks run in an opaque sandbox origin; analytics is public and never uses credentials.
    if (req.headers.origin === 'null') {
      res.setHeader('Access-Control-Allow-Origin', 'null');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    if (!/^(?:application\/json|text\/plain)(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { json(res, 415, { ok: false }); return; }

    const expectedOrigin = requestOrigin(req, env);
    if (req.headers.origin && req.headers.origin !== 'null' && expectedOrigin && req.headers.origin !== expectedOrigin) { json(res, 403, { ok: false }); return; }

    const peer = req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (attempts.get(peer) || []).filter(time => now - time < 60_000);
    if (recent.length >= 240) { json(res, 429, { ok: false }, { 'Retry-After': '60' }); return; }
    recent.push(now); attempts.set(peer, recent);

    let event;
    try { event = cleanEvent(await readJson(req)); }
    catch (error) { json(res, error.status || 400, { ok: false }); return; }

    if (!hasSupabase(env)) {
      let project;
      try { project = JSON.parse(await readFile(path.join(presentationsRoot, event.deck, 'project.json'), 'utf8')); }
      catch { json(res, 404, { ok: false }); return; }
      if (project.status !== 'published' || project.analytics?.enabled !== true) { res.writeHead(204, { 'X-Analytics-Status': 'disabled' }).end(); return; }
      res.writeHead(204, { 'X-Analytics-Status': 'not-configured' }).end();
      return;
    }

    let project;
    try { project = await getPresentationProject(event.deck, { env, send }); }
    catch { res.writeHead(204, { 'X-Analytics-Status': 'unavailable' }).end(); return; }
    if (!project || project.status !== 'published' || project.access_mode && project.access_mode !== 'unlisted' || project.analytics_enabled !== true) { res.writeHead(204, { 'X-Analytics-Status': 'disabled' }).end(); return; }

    const response = await send(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/record_presentation_event`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_session_id: event.sessionId,
        p_event_id: event.eventId,
        p_deck_slug: event.deck,
        p_event_type: event.eventType,
        p_slide_index: event.slideIndex,
        p_video_id: event.videoId,
        p_video_progress: event.videoProgress,
        p_active_seconds: event.activeSeconds,
        p_user_agent_category: userAgentCategory(req.headers['user-agent'])
      })
    }).catch(() => null);
    if (!response?.ok) { res.writeHead(204, { 'X-Analytics-Status': 'unavailable' }).end(); return; }
    await notifyPresentationOpened(event,project,{env,send,headers:req.headers});
    res.writeHead(204, { 'X-Analytics-Status': 'recorded' }).end();
  };
}
