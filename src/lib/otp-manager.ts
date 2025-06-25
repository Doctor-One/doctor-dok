import { generateTimeBasedPassword } from './totp';

interface OTPEntry {
  otp: string;
  timestamp: number;
  keyLocatorHash: string;
}

class OTPManager {
  private otpStore: Map<string, OTPEntry> = new Map();
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
  private readonly MAX_AGE = 30 * 60 * 1000; // 30 minutes in milliseconds

  constructor() {
    // Set up periodic cleanup to remove expired entries
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Generate and store a new time-based password for a specific keyLocatorHash
   * This should be called when user logs in or refreshes their token
   */
  generateAndStoreOTP(keyLocatorHash: string): string {
    const otp = generateTimeBasedPassword();
    const entry: OTPEntry = {
      otp,
      timestamp: Date.now(),
      keyLocatorHash
    };

    this.otpStore.set(keyLocatorHash, entry);
    console.log(`Generated and stored OTP for keyLocatorHash: ${keyLocatorHash}`);
    
    return otp;
  }

  /**
   * Retrieve the stored time-based password for a specific keyLocatorHash
   * Returns null if not found or expired
   */
  getOTP(keyLocatorHash: string): string | null {
    const entry = this.otpStore.get(keyLocatorHash);
    
    if (!entry) {
      console.log(`No OTP found for keyLocatorHash: ${keyLocatorHash}`);
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - entry.timestamp;
    if (age > this.MAX_AGE) {
      console.log(`OTP expired for keyLocatorHash: ${keyLocatorHash}, age: ${age}ms`);
      this.otpStore.delete(keyLocatorHash);
      return null;
    }

    console.log(`Retrieved OTP for keyLocatorHash: ${keyLocatorHash}`);
    return entry.otp;
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
    const deleted = this.otpStore.delete(keyLocatorHash);
    if (deleted) {
      console.log(`Removed OTP for keyLocatorHash: ${keyLocatorHash}`);
    }
    return deleted;
  }

  /**
   * Get or generate OTP for a keyLocatorHash
   * If no OTP exists or it's expired, generates a new one
   */
  getOrGenerateOTP(keyLocatorHash: string): string {
    const existingOTP = this.getOTP(keyLocatorHash);
    if (existingOTP) {
      return existingOTP;
    }
    
    return this.generateAndStoreOTP(keyLocatorHash);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
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

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired OTP entries`);
    }
  }

  /**
   * Get statistics about the OTP store
   */
  getStats(): { totalEntries: number; oldestEntry: number | null; newestEntry: number | null } {
    if (this.otpStore.size === 0) {
      return { totalEntries: 0, oldestEntry: null, newestEntry: null };
    }

    const timestamps = Array.from(this.otpStore.values()).map(entry => entry.timestamp);
    return {
      totalEntries: this.otpStore.size,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps)
    };
  }

  /**
   * Clear all stored OTPs (useful for testing or emergency cleanup)
   */
  clearAll(): void {
    const count = this.otpStore.size;
    this.otpStore.clear();
    console.log(`Cleared all ${count} OTP entries`);
  }
}

// Export a singleton instance
export const otpManager = new OTPManager();

// Export the class for testing purposes
export { OTPManager }; 