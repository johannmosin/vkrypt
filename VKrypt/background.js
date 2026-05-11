// VKrypt - Background script for E2EE on VK
// Handles key generation, encryption, and decryption

// Generate ECDH P-256 key pair
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
    
    // Export public key to JWK then to base64
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const publicKeyJson = JSON.stringify(publicKeyJwk);
    const publicKeyBase64 = btoa(unescape(encodeURIComponent(publicKeyJson)));
    
    // Store private key securely (not exportable in normal usage)
    // We'll store the keyPair object reference in memory for this session
    // For persistence, we need to store the private key separately
    
    return {
      success: true,
      publicKey: publicKeyBase64,
      keyPair: keyPair
    };
  } catch (error) {
    console.error("Key generation error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Derive shared secret from private key and contact's public key
async function deriveSharedSecret(privateKey, contactPublicKeyBase64) {
  try {
    // Import contact's public key
    const contactPublicKeyJson = JSON.parse(decodeURIComponent(escape(atob(contactPublicKeyBase64))));
    const contactPublicKey = await crypto.subtle.importKey(
      "jwk",
      contactPublicKeyJson,
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      false,
      []
    );
    
    // Derive bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: contactPublicKey
      },
      privateKey,
      256
    );
    
    return derivedBits;
  } catch (error) {
    console.error("Derive shared secret error:", error);
    throw error;
  }
}

// Encrypt message using AES-GCM
async function encryptMessage(message, sharedSecret) {
  try {
    // Create AES key from shared secret
    const aesKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encodedMessage = new TextEncoder().encode(message);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      aesKey,
      encodedMessage
    );
    
    // Combine IV + encrypted data
    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv, 0);
    combined.set(encryptedArray, iv.length);
    
    // Convert to base64
    const encryptedBase64 = btoa(String.fromCharCode(...combined));
    
    return {
      success: true,
      encrypted: encryptedBase64
    };
  } catch (error) {
    console.error("Encryption error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Decrypt message using AES-GCM
async function decryptMessage(encryptedBase64, sharedSecret) {
  try {
    // Create AES key from shared secret
    const aesKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      aesKey,
      encryptedData
    );
    
    const decodedMessage = new TextDecoder().decode(decrypted);
    
    return {
      success: true,
      decrypted: decodedMessage
    };
  } catch (error) {
    console.error("Decryption error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Message listener for communication with popup and content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "generateKeyPair") {
    generateKeyPair().then(result => {
      if (result.success) {
        // Store keys in storage
        browser.storage.local.set({
          hasKeys: true,
          publicKey: result.publicKey
        }).then(() => {
          // Store keyPair in a way that can be retrieved later
          // For Firefox, we need to handle this differently
          sendResponse(result);
        });
      } else {
        sendResponse(result);
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (message.action === "getKeys") {
    browser.storage.local.get(["hasKeys", "publicKey"]).then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  if (message.action === "encrypt") {
    // Get private key from storage and encrypt
    browser.storage.local.get(["privateKeyJwk"]).then(async (storage) => {
      if (!storage.privateKeyJwk) {
        sendResponse({ success: false, error: "No private key found" });
        return;
      }
      
      try {
        const privateKey = await crypto.subtle.importKey(
          "jwk",
          JSON.parse(storage.privateKeyJwk),
          {
            name: "ECDH",
            namedCurve: "P-256"
          },
          false,
          ["deriveKey", "deriveBits"]
        );
        
        const sharedSecret = await deriveSharedSecret(privateKey, message.contactPublicKey);
        const encrypted = await encryptMessage(message.text, sharedSecret);
        sendResponse(encrypted);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }
  
  if (message.action === "decrypt") {
    browser.storage.local.get(["privateKeyJwk"]).then(async (storage) => {
      if (!storage.privateKeyJwk) {
        sendResponse({ success: false, error: "No private key found" });
        return;
      }
      
      try {
        const privateKey = await crypto.subtle.importKey(
          "jwk",
          JSON.parse(storage.privateKeyJwk),
          {
            name: "ECDH",
            namedCurve: "P-256"
          },
          false,
          ["deriveKey", "deriveBits"]
        );
        
        const sharedSecret = await deriveSharedSecret(privateKey, message.contactPublicKey);
        const decrypted = await decryptMessage(message.encryptedText, sharedSecret);
        sendResponse(decrypted);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }
  
  if (message.action === "saveContactKey") {
    browser.storage.local.get(["contactKeys"]).then((storage) => {
      const contactKeys = storage.contactKeys || {};
      contactKeys[message.contactId] = {
        name: message.name,
        publicKey: message.publicKey
      };
      browser.storage.local.set({ contactKeys }).then(() => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  if (message.action === "getContactKeys") {
    browser.storage.local.get(["contactKeys"]).then((storage) => {
      sendResponse(storage.contactKeys || {});
    });
    return true;
  }
  
  if (message.action === "savePrivateKey") {
    browser.storage.local.set({
      privateKeyJwk: message.privateKeyJwk,
      hasKeys: true,
      publicKey: message.publicKey
    }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === "setLanguage") {
    browser.storage.local.set({ language: message.language }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === "getLanguage") {
    browser.storage.local.get(["language"]).then((storage) => {
      sendResponse(storage.language || "auto");
    });
    return true;
  }
});

console.log("VKrypt background script loaded");
