import { generateEncryptionKey } from './crypto';
import { generateTimeBasedPassword } from './totp';

interface OTPEntry {
  otp: string;
  timestamp: number;
  keyLocatorHash: string;
}

interface OTPManagerOptions {
  useTimeBasedPasswords?: boolean; // Default: true
  maxAge?: number; // Default: 30 minutes
  cleanupInterval?: number; // Default: 1 hour
}

class OTPManager {
  private otpStore: Map<string, OTPEntry> = new Map();
  private readonly useTimeBasedPasswords: boolean;
  private readonly CLEANUP_INTERVAL: number;
  private readonly MAX_AGE: number;

  constructor(options: OTPManagerOptions = {}) {
    this.useTimeBasedPasswords = options.useTimeBasedPasswords ?? true;
    this.MAX_AGE = options.maxAge ?? 30 * 60 * 1000; // 30 minutes in milliseconds
    this.CLEANUP_INTERVAL = options.cleanupInterval ?? 60 * 60 * 1000; // 1 hour in milliseconds

    // Only set up cleanup if not using time-based passwords
    if (!this.useTimeBasedPasswords) {
      setInterval(() => {
        this.cleanupExpiredEntries();
      }, this.CLEANUP_INTERVAL);
    }
  }

  /**
   * Generate and store a new time-based password for a specific keyLocatorHash
   * This should be called when user logs in or refreshes their token
   */
  generateAndStoreOTP(keyLocatorHash: string): string {
    if (this.useTimeBasedPasswords) {
      // In time-based mode, just generate and return without storing
      const otp = generateTimeBasedPassword();
      return otp;
    } else {
      // In storage mode, generate and store
      const otp = generateEncryptionKey();
      const entry: OTPEntry = {
        otp,
        timestamp: Date.now(),
        keyLocatorHash
      };

      this.otpStore.set(keyLocatorHash, entry);
      
      return otp;
    }
  }

  /**
   * Retrieve the stored time-based password for a specific keyLocatorHash
   * Returns null if not found or expired
   */
  getOTP(keyLocatorHash: string): string | null {
    if (this.useTimeBasedPasswords) {
      // In time-based mode, generate fresh OTP
      const otp = generateTimeBasedPassword();
      return otp;
    } else {
      // In storage mode, retrieve from store
      const entry = this.otpStore.get(keyLocatorHash);
      
      if (!entry) {
        return null;
      }

      // Check if entry is expired
      const age = Date.now() - entry.timestamp;
      if (age > this.MAX_AGE) {
        this.otpStore.delete(keyLocatorHash);
        return null;
      }

      return entry.otp;
    }
  }

  /**
   * Update the OTP for a specific keyLocatorHash
   * This can be used when a new key is generated
   */
  updateOTP(keyLocatorHash: string): string {
    return this.generateAndStoreOTP(keyLocatorHash);
  }

  /**
   * Remove OTP for a specific keyLocatorHash
   */
  removeOTP(keyLocatorHash: string): boolean {
    if (this.useTimeBasedPasswords) {
      // In time-based mode, nothing to remove
      return false;
    } else {
      // In storage mode, remove from store
      const deleted = this.otpStore.delete(keyLocatorHash);
      return deleted;
    }
  }

  /**
   * Get or generate OTP for a keyLocatorHash
   * If no OTP exists or it's expired, generates a new one
   */
  getOrGenerateOTP(keyLocatorHash: string): string {
    if (this.useTimeBasedPasswords) {
      // In time-based mode, always generate fresh
      return this.generateAndStoreOTP(keyLocatorHash);
    } else {
      // In storage mode, try to get existing or generate new
      const existingOTP = this.getOTP(keyLocatorHash);
      if (existingOTP) {
        return existingOTP;
      }
      
      return this.generateAndStoreOTP(keyLocatorHash);
    }
  }

  /**
   * Clean up expired entries (only used in storage mode)
   */
  private cleanupExpiredEntries(): void {
    if (this.useTimeBasedPasswords) {
      return; // No cleanup needed in time-based mode
    }

    const now = Date.now();
    let cleanedCount = 0;

    const entries = Array.from(this.otpStore.entries());
    for (const [keyLocatorHash, entry] of entries) {
      const age = now - entry.timestamp;
      if (age > this.MAX_AGE) {
        this.otpStore.delete(keyLocatorHash);
        cleanedCount++;
      }
    }

  }

  /**
   * Get statistics about the OTP store
   */
  getStats(): { totalEntries: number; oldestEntry: number | null; newestEntry: number | null; mode: string } {
    if (this.useTimeBasedPasswords) {
      return { 
        totalEntries: 0, 
        oldestEntry: null, 
        newestEntry: null,
        mode: 'time-based'
      };
    }

    if (this.otpStore.size === 0) {
      return { 
        totalEntries: 0, 
        oldestEntry: null, 
        newestEntry: null,
        mode: 'storage'
      };
    }

    const timestamps = Array.from(this.otpStore.values()).map(entry => entry.timestamp);
    return {
      totalEntries: this.otpStore.size,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps),
      mode: 'storage'
    };
  }

  /**
   * Clear all stored OTPs (useful for testing or emergency cleanup)
   */
  clearAll(): void {
    if (this.useTimeBasedPasswords) {
      return;
    }

    const count = this.otpStore.size;
    this.otpStore.clear();
  }

  /**
   * Get the current mode of the OTP manager
   */
  getMode(): string {
    return this.useTimeBasedPasswords ? 'time-based' : 'storage';
  }
}

// Export a singleton instance with default time-based mode
export const otpManager = new OTPManager({ useTimeBasedPasswords: true });

// Export the class for testing purposes
export { OTPManager }; 