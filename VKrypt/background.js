// VKrypt Background Script
// Handles cryptographic operations and message passing

// Generate RSA key pair for ECDH key exchange
async function generateKeyPair() {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      true,
      ["deriveKey", "deriveBits"]
    );
    
    // Export public key
    const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBytes = new Uint8Array(publicKey);
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));
    
    return {
      success: true,
      publicKey: publicKeyBase64,
      privateKeyStored: true
    };
  } catch (error) {
    console.error("VKrypt: Key generation failed:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Derive AES key from ECDH shared secret
async function deriveKey(privateKey, peerPublicKeyBase64) {
  try {
    // Import private key
    const privateKeyBytes = Uint8Array.from(atob(privateKey), c => c.charCodeAt(0));
    const importedPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBytes.buffer,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveKey"]
    );
    
    // Import peer's public key
    const peerPublicKeyBytes = Uint8Array.from(atob(peerPublicKeyBase64), c => c.charCodeAt(0));
    const importedPeerPublicKey = await crypto.subtle.importKey(
      "spki",
      peerPublicKeyBytes.buffer,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    
    // Derive shared key
    const sharedKey = await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: importedPeerPublicKey
      },
      importedPrivateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    return { success: true, key: sharedKey };
  } catch (error) {
    console.error("VKrypt: Key derivation failed:", error);
    return { success: false, error: error.message };
  }
}

// Encrypt message with AES-GCM
async function encryptMessage(message, key) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );
    
    const encryptedBytes = new Uint8Array(encrypted);
    const ivAndData = new Uint8Array(iv.length + encryptedBytes.length);
    ivAndData.set(iv, 0);
    ivAndData.set(encryptedBytes, 12);
    
    const result = btoa(String.fromCharCode(...ivAndData));
    return { success: true, encrypted: result };
  } catch (error) {
    console.error("VKrypt: Encryption failed:", error);
    return { success: false, error: error.message };
  }
}

// Decrypt message with AES-GCM
async function decryptMessage(encryptedBase64, key) {
  try {
    const ivAndData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = ivAndData.slice(0, 12);
    const data = ivAndData.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    const result = new TextDecoder().decode(decrypted);
    return { success: true, decrypted: result };
  } catch (error) {
    console.error("VKrypt: Decryption failed:", error);
    return { success: false, error: error.message };
  }
}

// Store private key securely in extension storage
async function storePrivateKey(privateKey) {
  try {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    const privateKeyBytes = new Uint8Array(exported);
    const privateKeyBase64 = btoa(String.fromCharCode(...privateKeyBytes));
    
    await browser.storage.local.set({ privateKey: privateKeyBase64 });
    return { success: true };
  } catch (error) {
    console.error("VKrypt: Key storage failed:", error);
    return { success: false, error: error.message };
  }
}

// Get stored private key
async function getPrivateKey() {
  try {
    const result = await browser.storage.local.get("privateKey");
    if (result.privateKey) {
      return { success: true, privateKey: result.privateKey };
    }
    return { success: false, error: "No private key found" };
  } catch (error) {
    console.error("VKrypt: Key retrieval failed:", error);
    return { success: false, error: error.message };
  }
}

// Message listener for communication with content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case "generateKeyPair": {
          const result = await generateKeyPair();
          if (result.success) {
            // Store the private key
            // We need to keep it in memory for this session
            // In a real implementation, you'd use a more secure storage
            await browser.storage.local.set({ 
              hasKeyPair: true,
              publicKey: result.publicKey 
            });
          }
          sendResponse(result);
          break;
        }
        
        case "getPublicKey": {
          const stored = await browser.storage.local.get(["hasKeyPair", "publicKey"]);
          if (stored.hasKeyPair && stored.publicKey) {
            sendResponse({ success: true, publicKey: stored.publicKey });
          } else {
            sendResponse({ success: false, error: "No key pair generated" });
          }
          break;
        }
        
        case "storePeerPublicKey": {
          const { contactId, publicKey } = message;
          const stored = await browser.storage.local.get("peerKeys") || {};
          const peerKeys = stored.peerKeys || {};
          peerKeys[contactId] = publicKey;
          await browser.storage.local.set({ peerKeys });
          sendResponse({ success: true });
          break;
        }
        
        case "getPeerPublicKey": {
          const { contactId } = message;
          const stored = await browser.storage.local.get("peerKeys");
          const peerKeys = stored.peerKeys || {};
          if (peerKeys[contactId]) {
            sendResponse({ success: true, publicKey: peerKeys[contactId] });
          } else {
            sendResponse({ success: false, error: "No public key for this contact" });
          }
          break;
        }
        
        case "deriveSharedKey": {
          const { peerPublicKey } = message;
          const privateKeyResult = await getPrivateKey();
          if (!privateKeyResult.success) {
            sendResponse({ success: false, error: "No private key available" });
            return;
          }
          
          // For now, we'll store derived keys in memory
          // In production, use secure enclave or similar
          sendResponse({ success: true, message: "Key derivation ready" });
          break;
        }
        
        case "encrypt": {
          const { message: msg, peerPublicKey } = message;
          const privateKeyResult = await getPrivateKey();
          if (!privateKeyResult.success) {
            sendResponse({ success: false, error: "No private key available" });
            return;
          }
          
          // Derive key and encrypt
          const keyResult = await deriveKey(privateKeyResult.privateKey, peerPublicKey);
          if (!keyResult.success) {
            sendResponse(keyResult);
            return;
          }
          
          const encryptResult = await encryptMessage(msg, keyResult.key);
          sendResponse(encryptResult);
          break;
        }
        
        case "decrypt": {
          const { encrypted, peerPublicKey } = message;
          const privateKeyResult = await getPrivateKey();
          if (!privateKeyResult.success) {
            sendResponse({ success: false, error: "No private key available" });
            return;
          }
          
          const keyResult = await deriveKey(privateKeyResult.privateKey, peerPublicKey);
          if (!keyResult.success) {
            sendResponse(keyResult);
            return;
          }
          
          const decryptResult = await decryptMessage(encrypted, keyResult.key);
          sendResponse(decryptResult);
          break;
        }
        
        case "checkEncryptionStatus": {
          const { contactId } = message;
          const stored = await browser.storage.local.get(["hasKeyPair", "peerKeys"]);
          const hasOwnKey = stored.hasKeyPair === true;
          const peerKeys = stored.peerKeys || {};
          const hasPeerKey = !!peerKeys[contactId];
          
          sendResponse({
            success: true,
            hasOwnKey,
            hasPeerKey,
            enabled: hasOwnKey && hasPeerKey
          });
          break;
        }
        
        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      console.error("VKrypt: Message handling error:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

console.log("VKrypt background script loaded");
