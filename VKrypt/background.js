// VKrypt Background Script - Crypto operations and key management

// Global state
let currentLanguage = 'ru';
let vkLanguage = 'ru';

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('VKrypt installed');
  initializeStorage();
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case 'generateKeyPair':
        const keys = await generateKeyPair();
        await saveKeys(keys);
        sendResponse({ success: true, publicKey: keys.publicKey });
        break;
      
      case 'getKeyPair':
        const storedKeys = await getStoredKeys();
        sendResponse(storedKeys);
        break;
      
      case 'saveContactKey':
        await saveContactKey(request.contactId, request.publicKey, request.name);
        sendResponse({ success: true });
        break;
      
      case 'getContactKeys':
        const contactKeys = await getAllContactKeys();
        sendResponse({ keys: contactKeys });
        break;
      
      case 'encryptMessage':
        const encrypted = await encryptMessage(request.message, request.contactId, request.isGroup, request.participantIds);
        sendResponse({ success: true, encryptedData: encrypted });
        break;
      
      case 'decryptMessage':
        const decrypted = await decryptMessage(request.encryptedData, request.senderId);
        sendResponse(decrypted);
        break;
      
      case 'getCurrentChat':
        const chatInfo = await getCurrentChatInfo();
        sendResponse(chatInfo);
        break;
      
      case 'setLanguage':
        currentLanguage = request.language;
        await chrome.storage.local.set({ language: currentLanguage });
        sendResponse({ success: true });
        break;
      
      case 'getLanguage':
        const lang = await getLanguage();
        sendResponse({ language: lang });
        break;
      
      case 'detectVKLanguage':
        vkLanguage = request.vkLang;
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('VKrypt error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function initializeStorage() {
  const existing = await chrome.storage.local.get(['language', 'keys', 'contactKeys']);
  if (!existing.language) {
    await chrome.storage.local.set({ language: 'ru' });
  }
  if (!existing.keys) {
    console.log('No keys found, user needs to generate');
  }
}

async function getLanguage() {
  const result = await chrome.storage.local.get(['language', 'autoLanguage']);
  if (result.autoLanguage !== false && vkLanguage) {
    return vkLanguage === 'en' ? 'en' : 'ru';
  }
  return result.language || 'ru';
}

// Crypto Functions
async function generateKeyPair() {
  console.log('Generating ECDH P-256 key pair...');
  
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
  
  // Export public key
  const publicKeyBuffer = await crypto.subtle.exportKey(
    'spki',
    keyPair.publicKey
  );
  
  const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);
  
  // Store private key (never exported)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  console.log('Key pair generated successfully');
  
  return {
    publicKey: publicKeyBase64,
    privateKey: privateKeyJwk
  };
}

async function saveKeys(keys) {
  await chrome.storage.local.set({ 
    keys: {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey
    },
    keysGenerated: Date.now()
  });
  console.log('Keys saved to storage');
}

async function getStoredKeys() {
  const result = await chrome.storage.local.get(['keys', 'keysGenerated']);
  if (!result.keys || !result.keysGenerated) {
    return { hasKeys: false };
  }
  
  // Import private key from JWK
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    result.keys.privateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  
  return {
    hasKeys: true,
    publicKey: result.keys.publicKey,
    privateKey: privateKey,
    generatedAt: result.keysGenerated
  };
}

async function saveContactKey(contactId, publicKey, name) {
  const result = await chrome.storage.local.get(['contactKeys']);
  const contactKeys = result.contactKeys || {};
  
  contactKeys[contactId] = {
    publicKey: publicKey,
    name: name || contactId,
    addedAt: Date.now()
  };
  
  await chrome.storage.local.set({ contactKeys });
  console.log(`Contact key saved for ${contactId}`);
}

async function getAllContactKeys() {
  const result = await chrome.storage.local.get(['contactKeys']);
  return result.contactKeys || {};
}

async function getCurrentChatInfo() {
  // This will be called by content script which has access to the page
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getChatInfo' }, (response) => {
          resolve(response || { detected: false });
        });
      } else {
        resolve({ detected: false });
      }
    });
  });
}

// Encryption/Decryption
async function encryptMessage(message, contactId, isGroup = false, participantIds = []) {
  const keyData = await getStoredKeys();
  if (!keyData.hasKeys) {
    throw new Error('No keys generated');
  }
  
  let sharedSecret;
  
  if (isGroup) {
    // For groups, we need all participant keys
    const contactKeys = await getAllContactKeys();
    const participantKeys = [];
    
    for (const pid of participantIds) {
      if (contactKeys[pid]) {
        const publicKeyBuffer = base64ToArrayBuffer(contactKeys[pid].publicKey);
        const publicKey = await crypto.subtle.importKey(
          'spki',
          publicKeyBuffer,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          []
        );
        participantKeys.push(publicKey);
      }
    }
    
    if (participantKeys.length === 0) {
      throw new Error('No valid participant keys');
    }
    
    // Use first participant for shared secret (simplified - in production use group key agreement)
    sharedSecret = await deriveSharedSecret(keyData.privateKey, participantKeys[0]);
  } else {
    const contactKeys = await getAllContactKeys();
    if (!contactKeys[contactId]) {
      throw new Error('No key for contact');
    }
    
    const publicKeyBuffer = base64ToArrayBuffer(contactKeys[contactId].publicKey);
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
    
    sharedSecret = await deriveSharedSecret(keyData.privateKey, publicKey);
  }
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(sharedSecret);
  
  // Encrypt message
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    aesKey,
    encoder.encode(message)
  );
  
  // Package encrypted data
  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
    isGroup: isGroup,
    timestamp: Date.now()
  };
}

async function decryptMessage(encryptedData, senderId) {
  const keyData = await getStoredKeys();
  if (!keyData.hasKeys) {
    throw new Error('No keys available');
  }
  
  // Get sender's public key
  const contactKeys = await getAllContactKeys();
  if (!contactKeys[senderId]) {
    throw new Error('No key for sender');
  }
  
  const publicKeyBuffer = base64ToArrayBuffer(contactKeys[senderId].publicKey);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  
  // Derive shared secret
  const sharedSecret = await deriveSharedSecret(keyData.privateKey, publicKey);
  
  // Derive AES key
  const aesKey = await deriveAESKey(sharedSecret);
  
  // Decrypt
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return {
    success: true,
    message: decoder.decode(plaintext),
    timestamp: encryptedData.timestamp
  };
}

async function deriveSharedSecret(privateKey, publicKey) {
  return await crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 100000 },
    false,
    ['deriveKey', 'deriveBits']
  );
}

async function deriveAESKey(sharedSecret) {
  // Use the shared secret directly as key material
  const keyMaterial = await crypto.subtle.exportKey('raw', sharedSecret);
  
  return await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Utility functions
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Listen for tab updates to detect VK language changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('vk.com')) {
    // Try to detect VK language from URL or page
    chrome.tabs.sendMessage(tabId, { action: 'detectLanguage' }, (response) => {
      if (response && response.language) {
        vkLanguage = response.language;
      }
    });
  }
});

console.log('VKrypt background script loaded');
