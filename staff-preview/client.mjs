import { projectUrl, publishableKey } from './config.mjs';

const sessionKey = 'cloud-culture-demo-staff-session';
const customerKey = 'cloud-culture-demo-customer-session';
const origin = new URL(projectUrl);
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || !publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Configure the HTTPS project URL and its publishable key.');
}

function session(key = sessionKey) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.expires > Date.now() + 5000) return saved;
  } catch {}
  sessionStorage.removeItem(key);
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

function requestFor(key, action, payload, message) {
  const current = session(key);
  if (!current) throw new Error(message);
  return call('/rest/v1/rpc/cloudculture_demo_rpc', { token: current.token, body: { action, payload } });
}

export function rpc(action, payload = {}) {
  return requestFor(sessionKey, action, payload, 'Sign in to the Cloud Culture staff dashboard first.');
}

export function customerRpc(action, payload = {}) {
  return requestFor(customerKey, 'customer_' + action, payload, 'Sign in to your demo account first.');
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

export function customerSignUp(email, password) {
  const redirect = new URL('./account.html', location.href);
  return call('/auth/v1/signup?redirect_to=' + encodeURIComponent(redirect.href), { body: { email, password } });
}

export async function customerSignIn(email, password) {
  const auth = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
  sessionStorage.setItem(customerKey, JSON.stringify({ token: auth.access_token, expires: Date.now() + auth.expires_in * 1000 }));
  try { return await customerRpc('account'); }
  catch (error) { sessionStorage.removeItem(customerKey); throw error; }
}

export async function customerSignOut() {
  const current = session(customerKey);
  sessionStorage.removeItem(customerKey);
  if (current) await call('/auth/v1/logout?scope=local', { token: current.token }).catch(() => {});
}

export function hasCustomerSession() { return Boolean(session(customerKey)); }
