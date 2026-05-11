# VKrypt - E2EE for VK Messages

End-to-end encryption extension for VK (VKontakte) messages. Works on Firefox (desktop & mobile) and Chrome.

## Features

- 🔐 **True E2EE** - AES-256-GCM encryption with ECDH key exchange
- 🔑 **External Key Exchange** - Keys are shared outside of VK (via secure messaging apps, QR codes, etc.)
- 📱 **Cross-Platform** - Works on Firefox Desktop, Firefox Mobile, and Chrome
- 💬 **Group Support** - Encrypt messages in group chats with multiple participants
- 🎨 **Dark Theme** - Matches VK's native dark interface
- ⚡ **Minimal UI Disruption** - Subtle status indicators that don't interfere with normal usage
- 🔍 **Mixed Message Support** - Handles both encrypted and unencrypted messages seamlessly

## Installation

### Firefox Desktop

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the `VKrypt` folder and select `manifest.json`
5. The extension will be loaded until Firefox is restarted

### Firefox Mobile (Android)

**Option 1: Firefox Nightly with Custom Extensions**

1. Install Firefox Nightly from Google Play
2. Enable custom extensions:
   - Go to `about:config`
   - Search for `xpinstall.signatures.required`
   - Set it to `false`
3. Download the extension as a `.xpi` file
4. Install via `about:addons` → Gear icon → "Install Add-on From File"

**Option 2: Collectable Extension (Recommended)**

1. Package the extension using `web-ext build`
2. Sign it through Mozilla AMO
3. Distribute to users

### Chrome / Chromium

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `VKrypt` folder
5. The extension will be loaded

## Usage

### First-Time Setup

1. **Generate Your Keys**
   - Click the VKrypt extension icon
   - Click "Generate Key Pair"
   - Wait for generation to complete

2. **Share Your Public Key**
   - In the popup, click "Copy Key"
   - Send it to your contact via a secure channel (Signal, Telegram Secret Chat, in-person, etc.)
   - ⚠️ **Never share your private key!**

3. **Add Contact's Public Key**
   - Receive their public key through your secure channel
   - In VK chat, click the "🔓 VKrypt: Add Contact Key" badge
   - Paste their public key and click "Save Key"

4. **Start Encrypting**
   - Once both keys are exchanged, the badge will show "🔒 VKrypt Active"
   - Toggle encryption with the lock icon near the message input
   - Encrypted messages will have a 🔒 indicator

### Sending Encrypted Messages

1. Ensure encryption is enabled (lock icon shows 🔒)
2. Type your message normally
3. The extension will automatically encrypt before sending
4. Messages appear with `[VKRYPT]` prefix when encrypted

### Receiving Encrypted Messages

- Encrypted messages show with a 🔒 icon
- Click "🔒 Decrypt" to decrypt the message
- Decrypted text appears in green

### Group Chats

1. Open the VKrypt popup while in a group chat
2. Add each member's public key individually
3. All members must have each other's keys for group encryption
4. Messages are encrypted with a shared group key

## Security Notes

### Key Management

- **Private keys** are stored in browser storage (encrypted by the browser)
- **Public keys** can be freely shared
- Keys are generated using ECDH P-256 curve
- Encryption uses AES-256-GCM (authenticated encryption)

### Best Practices

1. ✅ Exchange keys through verified secure channels
2. ✅ Verify key fingerprints with contacts
3. ✅ Keep backups of your private key (export feature coming soon)
4. ❌ Never share your private key
5. ❌ Don't use encryption if you see warning indicators

### Limitations

- Keys are stored in browser storage (not hardware-backed)
- No forward secrecy (keys persist across sessions)
- Manual key verification recommended for high-security use cases
- Group encryption requires all members to have each other's keys

## Troubleshooting

### Key Generation Fails

- Ensure you're using a modern browser (Firefox 109+, Chrome 88+)
- Check browser console for errors (`Ctrl+Shift+J` or `F12`)
- Try restarting the browser

### Encryption Not Working

1. Verify both you and your contact have exchanged keys
2. Check the status badge in the chat header
3. Ensure the encryption toggle is enabled (shows 🔒)
4. Try refreshing the VK page

### Messages Not Decrypting

- Ensure you have the correct public key for the sender
- Check if the message was actually encrypted (has `[VKRYPT]` prefix)
- Verify the key wasn't corrupted during exchange

## Development

### Building from Source

```bash
# Install web-ext tool
npm install -g web-ext

# Run in development mode
web-ext run

# Build for distribution
web-ext build
```

### Project Structure

```
VKrypt/
├── manifest.json      # Extension manifest (MV3)
├── background.js      # Background service worker
├── content.js         # Content script (VK integration)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── popup.css          # Popup styles (dark theme)
├── styles.css         # Content script styles
└── icons/             # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Privacy Policy

VKrypt:
- Does NOT collect any user data
- Does NOT transmit keys or messages to external servers
- Stores all data locally in browser storage
- Does NOT track usage or analytics
- Is completely open-source

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please submit issues and pull requests on GitHub.

## Support

For questions or issues:
- Check the troubleshooting section
- Review the security notes
- Open an issue on GitHub

---

**Remember**: E2EE only works if both parties properly exchange and verify keys. Always use secure channels for key exchange!
