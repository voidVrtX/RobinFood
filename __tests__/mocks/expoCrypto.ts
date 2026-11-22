import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const randomUUID = () => nodeRandomUUID();
export async function digestStringAsync(_algorithm: string, value: string): Promise<string> {
  return createHash('sha256').update(value).digest('hex');
}
