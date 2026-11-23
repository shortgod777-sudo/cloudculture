import { projectUrl, publishableKey } from './config.mjs';

const sessionKey = 'cloud-culture-demo-staff-session';
const origin = new URL(projectUrl);
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || !publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Configure the HTTPS project URL and its publishable key.');
}

function session() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (saved?.expires > Date.now() + 5000) return saved;
  } catch {}
  sessionStorage.removeItem(sessionKey);
  return null;
}

async function call(path, { token, body, method = 'POST' } = {}) {
  const response = await fetch(new URL(path, origin), {
    method, cache: 'no-store',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.msg || result.error_description || 'Cloud Culture request failed.');
  return result;
}

export function rpc(action, payload = {}) {
  const current = session();
  if (!current) throw new Error('Sign in to the Cloud Culture staff dashboard first.');
  return call('/rest/v1/rpc/cloudculture_demo_rpc', { token: current.token, body: { action, payload } });
}

export async function signIn(email, password) {
  const auth = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
  sessionStorage.setItem(sessionKey, JSON.stringify({ token: auth.access_token, expires: Date.now() + auth.expires_in * 1000 }));
  try { await rpc('dashboard'); }
  catch (error) { sessionStorage.removeItem(sessionKey); throw error; }
}

export async function signOut() {
  const current = session();
  sessionStorage.removeItem(sessionKey);
  if (current) await call('/auth/v1/logout?scope=local', { token: current.token }).catch(() => {});
}

export function hasSession() { return Boolean(session()); }
