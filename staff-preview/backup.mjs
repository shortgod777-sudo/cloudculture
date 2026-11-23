const encode = new TextEncoder();
const toBase64 = bytes => Array.from(bytes, byte => String.fromCharCode(byte)).join('');
const pack = bytes => btoa(toBase64(bytes));
const unpack = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const rounds = 600000;

async function derive(password, salt) {
  if (typeof password !== 'string' || password.length < 16) throw new Error('Use a backup passphrase of at least 16 characters.');
  const base = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(snapshot, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encode.encode(JSON.stringify(snapshot))));
  return { format: 'cloud-culture-encrypted-v1', salt: pack(salt), iv: pack(iv), data: pack(data) };
}

export async function decryptBackup(envelope, password) {
  if (envelope.format !== 'cloud-culture-encrypted-v1') throw new Error('Unknown Cloud Culture backup format.');
  const salt = unpack(envelope.salt);
  const iv = unpack(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid backup metadata.');
  const key = await derive(password, salt);
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unpack(envelope.data));
  return JSON.parse(new TextDecoder().decode(bytes));
}
