import CryptoJS from 'crypto-js';
import { logger } from './logger';

const MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY;

if (!MASTER_KEY || MASTER_KEY.length < 32) {
  logger.error('MASTER_ENCRYPTION_KEY must be at least 32 characters');
  process.exit(1);
}

export const encrypt = (text: string): string => {
  try {
    const encrypted = CryptoJS.AES.encrypt(text, MASTER_KEY!).toString();
    return encrypted;
  } catch (error) {
    logger.error('Encryption failed', { error });
    throw new Error('Failed to encrypt data');
  }
};

export const decrypt = (encryptedText: string): string => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, MASTER_KEY!);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    logger.error('Decryption failed', { error });
    throw new Error('Failed to decrypt data');
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.hash(password, 10);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.compare(password, hash);
};

export const generateWebhookSignature = (payload: string, secret: string): string => {
  return CryptoJS.HmacSHA256(payload, secret).toString();
};

export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string
): boolean => {
  const expectedSignature = generateWebhookSignature(payload, secret);
  return signature === expectedSignature;
};