import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 32768;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: COST, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${COST}$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, r, p, salt, digest] = encoded.split('$');
  if (algorithm !== 'scrypt' || cost !== String(COST) || r !== '8' || p !== '1' || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'hex');
  const actual = await derive(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
