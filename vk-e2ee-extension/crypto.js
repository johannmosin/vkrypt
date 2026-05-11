/**
 * VK E2EE - Cryptography Utilities
 * Handles AES-256-GCM encryption/decryption with external key exchange
 */

const VK_E2EE_CRYPTO = {
  // Constants
  ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  TAG_LENGTH: 16,
  
  /**
   * Generate a new key pair for E2EE
   * @returns {Promise<{publicKey: string, privateKey: string}>}
   */
  async generateKeyPair() {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    
    const exportedKey = await crypto.subtle.exportKey('raw', key);
    const keyBytes = new Uint8Array(exportedKey);
    const base64Key = this.arrayBufferToBase64(keyBytes.buffer);
    
    return {
      publicKey: base64Key, // In symmetric encryption, public/private are the same
      privateKey: base64Key,
      keyId: this.generateKeyId()
    };
  },
  
  /**
   * Import a key from base64 string
   * @param {string} keyData - Base64 encoded key
   * @returns {Promise<CryptoKey>}
   */
  async importKey(keyData) {
    const keyBytes = this.base64ToArrayBuffer(keyData);
    return await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
  },
  
  /**
   * Encrypt a message
   * @param {string} plaintext - Message to encrypt
   * @param {CryptoKey} key - Encryption key
   * @returns {Promise<{encrypted: string, iv: string, tag: string}>}
   */
  async encrypt(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );
    
    const encryptedBytes = new Uint8Array(encrypted);
    // Extract tag (last 16 bytes)
    const tag = encryptedBytes.slice(-this.TAG_LENGTH);
    const ciphertext = encryptedBytes.slice(0, -this.TAG_LENGTH);
    
    return {
      encrypted: this.arrayBufferToBase64(ciphertext.buffer),
      iv: this.arrayBufferToBase64(iv.buffer),
      tag: this.arrayBufferToBase64(tag.buffer)
    };
  },
  
  /**
   * Decrypt a message
   * @param {string} encrypted - Encrypted ciphertext (base64)
   * @param {string} iv - Initialization vector (base64)
   * @param {string} tag - Authentication tag (base64)
   * @param {CryptoKey} key - Decryption key
   * @returns {Promise<string>} Decrypted plaintext
   */
  async decrypt(encrypted, iv, tag, key) {
    const ciphertext = this.base64ToArrayBuffer(encrypted);
    const ivBytes = this.base64ToArrayBuffer(iv);
    const tagBytes = this.base64ToArrayBuffer(tag);
    
    // Combine ciphertext and tag
    const combined = new Uint8Array(ciphertext.byteLength + tagBytes.byteLength);
    combined.set(new Uint8Array(ciphertext), 0);
    combined.set(new Uint8Array(tagBytes), ciphertext.byteLength);
    
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        combined
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error('Decryption failed: Invalid key or corrupted message');
    }
  },
  
  /**
   * Generate a unique key ID for identification
   * @returns {string}
   */
  generateKeyId() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  },
  
  /**
   * Convert ArrayBuffer to Base64
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
  
  /**
   * Convert Base64 to ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },
  
  /**
   * Create an encrypted message payload
   * @param {string} plaintext
   * @param {CryptoKey} key
   * @returns {Promise<string>} JSON string with encrypted data
   */
  async createEncryptedPayload(plaintext, key) {
    const result = await this.encrypt(plaintext, key);
    const payload = {
      type: 'e2ee',
      version: '1.0',
      data: result.encrypted,
      iv: result.iv,
      tag: result.tag,
      timestamp: Date.now()
    };
    return JSON.stringify(payload);
  },
  
  /**
   * Parse and decrypt a message payload
   * @param {string} payload - JSON string or plain text
   * @param {CryptoKey} key
   * @returns {Promise<{isEncrypted: boolean, content: string, metadata?: object}>}
   */
  async parseMessagePayload(payload, key) {
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'e2ee') {
        const decrypted = await this.decrypt(parsed.data, parsed.iv, parsed.tag, key);
        return {
          isEncrypted: true,
          content: decrypted,
          metadata: {
            version: parsed.version,
            timestamp: parsed.timestamp
          }
        };
      }
    } catch (e) {
      // Not a JSON payload, treat as plain text
    }
    
    return {
      isEncrypted: false,
      content: payload
    };
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VK_E2EE_CRYPTO;
}
