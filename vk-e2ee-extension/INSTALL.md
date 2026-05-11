# VK E2EE Extension - Installation Guide

## Quick Start

### Firefox (Desktop & Mobile)

#### Temporary Installation (for testing)
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to the extension folder and select `manifest.json`
4. The extension is now loaded until Firefox restarts

#### Permanent Installation (Firefox Desktop)
1. Open Firefox and navigate to `about:config`
2. Search for `xpinstall.signatures.required` and set it to `false` (only in Firefox Developer Edition or Nightly)
3. Go to `about:addons`
4. Click the gear icon → "Install Add-on From File"
5. Select the extension folder or a packaged XPI file

#### Firefox Mobile (Android)
**Option 1: Firefox Nightly with Custom Extensions**
1. Install Firefox Nightly from Google Play
2. Open `about:config` in the address bar
3. Search for `extensions.install_origins.enabled` and enable it
4. Host the extension on a web server or use ADB to push it
5. Install via custom collection or direct installation

**Option 2: Build and Sign**
1. Create a Firefox Add-ons account at https://addons.mozilla.org
2. Package the extension: `zip -r vk-e2ee.xpi *`
3. Submit for signing (even if unlisted)
4. Download the signed XPI and install on mobile

### Chrome / Chromium

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the entire `vk-e2ee-extension` folder
5. The extension is now active

### Edge / Other Chromium Browsers

Same as Chrome - use `edge://extensions/` or equivalent.

## Configuration

### First-Time Setup

1. **Navigate to VK** - Go to https://vk.com and log in
2. **Open Extension Settings** - Click the extension icon in your browser toolbar
3. **Generate or Import Key**:
   - Click "Generate New Key" to create a new encryption key, OR
   - Import an existing key from a secure backup
4. **Enable Encryption** - Toggle the "Enable Encryption" button
5. **Verify Status** - You should see a green lock indicator (🔒 E2EE Active)

### Key Exchange (CRITICAL STEP)

⚠️ **Keys must be exchanged OUTSIDE of VK through a secure channel:**

**Recommended Methods:**
- **In-person**: Scan QR codes or exchange USB drives
- **Signal/WhatsApp**: Send base64 key strings through another E2EE app
- **Email with PGP**: If both parties use PGP-encrypted email
- **Secure file transfer**: Use services like OnionShare or Magic Wormhole

**Key Exchange Process:**
1. Generate your key pair in the extension
2. Export your public key (the same as private key in symmetric encryption)
3. Share it with your contact through a secure channel
4. Your contact imports your key in their extension under "Contact Keys"
5. Repeat for each contact you want to encrypt messages with

### Group Chats

For encrypted group chats:
1. Each member generates their own key
2. One person creates a shared group key (or use one member's key)
3. Share the group key with all members through secure channels
4. Each member adds the group key to their contact keys
5. All members use the same key for the group conversation

## Usage

### Sending Encrypted Messages

1. Ensure encryption is enabled (green lock indicator visible)
2. Type your message normally in VK chat
3. Click send - the message is automatically encrypted
4. Encrypted messages show a small lock icon (🔒)

### Receiving Encrypted Messages

- If you have the correct key: Messages are automatically decrypted
- Decrypted messages show a green dot indicator
- If you don't have the key: Message shows a warning (⚠️ Encrypted message (no key))

### Encryption Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🔒 E2EE Active | Encryption is enabled and working |
| ⚠️ Encryption Disabled | Extension installed but encryption turned off |
| 🔓 No Key Configured | Encryption enabled but no key imported |
| 🟢 Green dot on message | Successfully decrypted message |
| ⚠️ Red border on message | Encrypted message that couldn't be decrypted |

## Troubleshooting

### Extension Not Loading
- Check browser console for errors (F12 → Console)
- Ensure you're on vk.com domain
- Try refreshing the page
- Re-enable the extension in browser settings

### Messages Not Encrypting
1. Verify encryption is enabled (check status indicator)
2. Ensure you have a key configured
3. Check browser console for error messages
4. Try toggling encryption off and on

### Messages Not Decrypting
1. Verify you have the correct key imported
2. Check if the sender used a different key
3. Ensure the key format is valid base64
4. Try re-importing the key

### UI Issues on Mobile
- The status indicator may only show the icon (not text) on mobile
- Some VK mobile selectors may differ - report issues for updates
- Try switching to desktop mode if experiencing problems

### Compatibility Issues
- VK frequently updates their interface - selectors may need updating
- Check for extension updates periodically
- Report broken functionality with VK version details

## Security Best Practices

### DO:
✅ Exchange keys through verified secure channels
✅ Backup your keys in multiple secure locations
✅ Verify key fingerprints with contacts in person when possible
✅ Keep your extension updated
✅ Use strong, unique keys for different contacts/groups

### DON'T:
❌ Never share your private key through VK or email
❌ Don't use the same key for all contacts (compromise affects all)
❌ Don't skip key verification steps
❌ Don't ignore warning indicators
❌ Don't store key backups in cloud storage without encryption

## Technical Details

### Encryption Specification
- **Algorithm**: AES-256-GCM
- **Key Size**: 256 bits
- **IV Size**: 96 bits (12 bytes)
- **Authentication Tag**: 128 bits (16 bytes)
- **Key Derivation**: Direct import (user-provided keys)

### Message Format
```json
{
  "type": "e2ee",
  "version": "1.0",
  "data": "<base64 ciphertext>",
  "iv": "<base64 initialization vector>",
  "tag": "<base64 authentication tag>",
  "timestamp": <unix timestamp>
}
```

### Browser Compatibility
- Firefox 109+ (Desktop)
- Firefox 113+ (Android)
- Chrome 88+ (Manifest V3)
- Edge 88+
- Other Chromium-based browsers

## Development

### Building from Source
```bash
# Clone the repository
cd vk-e2ee-extension

# For Firefox
zip -r vk-e2ee-firefox.xpi *

# For Chrome
zip -r vk-e2ee-chrome.zip *
```

### Testing
1. Load the unpacked extension in your browser
2. Open VK in a new tab
3. Open browser developer tools (F12)
4. Check console for `[VK E2EE]` prefixed logs

### Contributing
- Report bugs with reproduction steps
- Submit pull requests for UI selector updates
- Suggest security improvements
- Help test on different browsers/devices

## Support

For issues, questions, or contributions:
- Check existing issues in the repository
- Read the troubleshooting section
- Review security best practices before reporting vulnerabilities

## License

MIT License - See LICENSE file for details

## Disclaimer

This extension is provided as-is without warranty. Users are responsible for:
- Securely managing their own encryption keys
- Verifying key authenticity with contacts
- Understanding the limitations of client-side encryption
- Complying with applicable laws and regulations

The extension developers are not responsible for:
- Lost or compromised keys
- Failed decryptions due to user error
- Any consequences of using or not using encryption
- VK platform changes that break functionality
