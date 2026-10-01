/**
 * Kurze, gut merkbare Kennungen statt fortlaufender Nummern.
 * Sitzungs-IDs tauchen in der URL und in Fenster-Namen auf, deshalb sind sie
 * alphanumerisch und url-tauglich.
 */

const ALPHABET = "abcdefghjkmnpqrstvwxyz23456789"; // ohne i, l, o, u, 0, 1

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** z. B. `k3f9qz` – ohne führende Ziffern, damit sie nicht wie eine Zahl wirkt. */
export function createId(prefix: string): string {
  let id = randomString(6);
  while (/^\d/.test(id)) id = randomString(6);
  return `${prefix}-${id}`;
}
