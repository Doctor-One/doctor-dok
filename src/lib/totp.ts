// src/timePassword.ts
import { totp } from 'otplib';
import { randomBytes } from 'crypto';

/**
 * Your shared secret.  In a real app load it from ENV or a vault.
 * keep it BASE-32 | 160 bit or longer.
 */
const SECRET = process.env.TOTP_SECRET ??
               randomBytes(20).toString('base64' as BufferEncoding);

/**
 * Configure a 20-minute window (600 s) and an 8-digit code.
 * SHA-256 is a good default hash these days.
 */
totp.options = {
  step: 1200,          // 20 minutes, a little bit longer than jwt tokens
  digits: 24,          // length of the password
  algorithm: 'sha256' as any // any HMAC supported by Node's crypto
};

/** Return the current 10-minute password */
export const generateTimeBasedPassword = (): string => totp.generate(SECRET);

/** Validate a password that the client sent back */
export const verifyTimeBasedPassword = (token: string): boolean =>
  totp.check(token, SECRET);

/** Optional helpers for UX / logging */
export const secondsRemaining = (): number => totp.timeRemaining();
export const secondsElapsed   = (): number => totp.timeUsed();