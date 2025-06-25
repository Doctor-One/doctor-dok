# OTP Manager

The OTP Manager is a module that manages time-based passwords (OTPs) with two modes of operation. It replaces direct calls to `generateTimeBasedPassword()` to ensure consistent OTP usage across user sessions.

## Purpose

- **Session Consistency**: Ensures the same OTP is used throughout a user's session for encryption/decryption operations
- **Memory Management**: Automatically cleans up expired OTPs to prevent memory leaks (storage mode only)
- **User Isolation**: Each user (identified by `keyLocatorHash`) has their own OTP stored separately (storage mode only)
- **Flexible Operation**: Supports both time-based and storage-based modes

## Key Features

- **Dual Mode Operation**: 
  - **Time-based mode** (default): Generates fresh OTPs using `generateTimeBasedPassword()` without storage
  - **Storage mode**: Stores OTPs in memory with automatic cleanup
- **Automatic Cleanup**: Expired OTPs are automatically removed (30-minute expiration, storage mode only)
- **Memory Efficient**: Uses Map for O(1) lookups and automatic cleanup (storage mode only)
- **Thread Safe**: Singleton pattern ensures consistent state across the application
- **Logging**: Comprehensive logging for debugging and monitoring

## Modes

### Time-based Mode (Default)
- **Behavior**: Generates fresh OTPs using `generateTimeBasedPassword()` each time
- **Storage**: No storage - OTPs are generated on-demand
- **Use Case**: When you want the same OTP within a time window (20 minutes by default)
- **Memory**: No memory usage for OTP storage

### Storage Mode
- **Behavior**: Stores OTPs in memory per user session
- **Storage**: In-memory Map with automatic expiration
- **Use Case**: When you need session-specific OTPs that persist across requests
- **Memory**: Uses memory for OTP storage with automatic cleanup

## Usage

### Basic Usage

```typescript
import { otpManager } from '@/lib/otp-manager';

// Generate and store OTP for a user (called during login/refresh)
const otp = otpManager.generateAndStoreOTP(keyLocatorHash);

// Retrieve OTP for decryption operations
const otp = otpManager.getOTP(keyLocatorHash);
if (otp) {
  // Use OTP for decryption
} else {
  // OTP not found or expired (storage mode only)
}

// Update OTP when new key is generated
otpManager.updateOTP(keyLocatorHash);

// Get or generate OTP (generates new one if not found)
const otp = otpManager.getOrGenerateOTP(keyLocatorHash);
```

### Configuration

```typescript
// Time-based mode (default)
const otpManager = new OTPManager({ useTimeBasedPasswords: true });

// Storage mode
const otpManager = new OTPManager({ 
  useTimeBasedPasswords: false,
  maxAge: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 60 * 60 * 1000 // 1 hour
});
```

### API Routes Integration

The OTP manager is automatically integrated into:
- `/api/db/authorize` - Generates OTP during user login
- `/api/db/refresh` - Updates OTP during token refresh
- `authorizeRequestContext` - Retrieves OTP for decryption operations

### Configuration Options

- **useTimeBasedPasswords**: `boolean` (default: `true`) - Enable time-based mode
- **maxAge**: `number` (default: `30 * 60 * 1000`) - Max age for stored OTPs in milliseconds
- **cleanupInterval**: `number` (default: `60 * 60 * 1000`) - Cleanup interval in milliseconds

## Migration from Direct OTP Generation

### Before (Old Way)
```typescript
import { generateTimeBasedPassword } from '@/lib/totp';

// Each call generates a new OTP
const otp = generateTimeBasedPassword();
```

### After (New Way - Time-based Mode)
```typescript
import { otpManager } from '@/lib/otp-manager';

// During login/refresh - generate fresh OTP
const otp = otpManager.generateAndStoreOTP(keyLocatorHash);

// During decryption - generate fresh OTP (same within time window)
const otp = otpManager.getOTP(keyLocatorHash);
```

### After (New Way - Storage Mode)
```typescript
import { otpManager } from '@/lib/otp-manager';

// During login/refresh - generate and store
const otp = otpManager.generateAndStoreOTP(keyLocatorHash);

// During decryption - retrieve stored OTP
const otp = otpManager.getOTP(keyLocatorHash);
```

## Benefits

1. **Consistent Encryption**: Same OTP used throughout session (storage mode) or time window (time-based mode)
2. **Better Security**: OTPs are tied to specific user sessions or time windows
3. **Memory Management**: Automatic cleanup prevents memory leaks (storage mode only)
4. **Debugging**: Better logging for troubleshooting
5. **Performance**: O(1) lookups instead of regenerating OTPs (storage mode)
6. **Flexibility**: Choose between time-based and storage modes based on requirements

## Monitoring

The module provides statistics for monitoring:

```typescript
const stats = otpManager.getStats();
console.log(`Mode: ${stats.mode}`);
console.log(`Total OTP entries: ${stats.totalEntries}`);
console.log(`Oldest entry: ${stats.oldestEntry}`);
console.log(`Newest entry: ${stats.newestEntry}`);

// Get current mode
const mode = otpManager.getMode();
console.log(`Current mode: ${mode}`);
```

## Mode Selection Guide

### Use Time-based Mode When:
- You want the same OTP within a time window (20 minutes)
- Memory usage is a concern
- OTPs should be consistent across the entire application within the time window
- You don't need session-specific OTPs

### Use Storage Mode When:
- You need session-specific OTPs that persist across requests
- You want to ensure the same OTP throughout a user's entire session
- You need fine-grained control over OTP lifecycle
- Memory usage is not a concern 