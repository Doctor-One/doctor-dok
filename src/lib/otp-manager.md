# OTP Manager

The OTP Manager is a module that manages time-based passwords (OTPs) in memory per user session. It replaces direct calls to `generateTimeBasedPassword()` to ensure consistent OTP usage across user sessions.

## Purpose

- **Session Consistency**: Ensures the same OTP is used throughout a user's session for encryption/decryption operations
- **Memory Management**: Automatically cleans up expired OTPs to prevent memory leaks
- **User Isolation**: Each user (identified by `keyLocatorHash`) has their own OTP stored separately

## Key Features

- **Automatic Cleanup**: Expired OTPs are automatically removed (30-minute expiration)
- **Memory Efficient**: Uses Map for O(1) lookups and automatic cleanup
- **Thread Safe**: Singleton pattern ensures consistent state across the application
- **Logging**: Comprehensive logging for debugging and monitoring

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
  // OTP not found or expired
}

// Update OTP when new key is generated
otpManager.updateOTP(keyLocatorHash);

// Get or generate OTP (generates new one if not found)
const otp = otpManager.getOrGenerateOTP(keyLocatorHash);
```

### API Routes Integration

The OTP manager is automatically integrated into:
- `/api/db/authorize` - Generates OTP during user login
- `/api/db/refresh` - Updates OTP during token refresh
- `authorizeRequestContext` - Retrieves OTP for decryption operations

### Configuration

- **Max Age**: 30 minutes (configurable via `MAX_AGE` constant)
- **Cleanup Interval**: 1 hour (configurable via `CLEANUP_INTERVAL` constant)
- **Storage**: In-memory Map with automatic expiration

## Migration from Direct OTP Generation

### Before (Old Way)
```typescript
import { generateTimeBasedPassword } from '@/lib/totp';

// Each call generates a new OTP
const otp = generateTimeBasedPassword();
```

### After (New Way)
```typescript
import { otpManager } from '@/lib/otp-manager';

// During login/refresh - generate and store
const otp = otpManager.generateAndStoreOTP(keyLocatorHash);

// During decryption - retrieve stored OTP
const otp = otpManager.getOTP(keyLocatorHash);
```

## Benefits

1. **Consistent Encryption**: Same OTP used throughout session
2. **Better Security**: OTPs are tied to specific user sessions
3. **Memory Management**: Automatic cleanup prevents memory leaks
4. **Debugging**: Better logging for troubleshooting
5. **Performance**: O(1) lookups instead of regenerating OTPs

## Monitoring

The module provides statistics for monitoring:

```typescript
const stats = otpManager.getStats();
console.log(`Total OTP entries: ${stats.totalEntries}`);
console.log(`Oldest entry: ${stats.oldestEntry}`);
console.log(`Newest entry: ${stats.newestEntry}`);
``` 