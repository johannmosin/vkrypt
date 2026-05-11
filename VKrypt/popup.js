// VKrypt Popup Script
let currentLanguage = 'auto';

// Translation function
function translatePage(lang) {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = browser.i18n.getMessage(key);
    if (translation) {
      el.textContent = translation;
    }
  });
  
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = browser.i18n.getMessage(key);
    if (translation) {
      el.placeholder = translation;
    }
  });
}

// Detect VK language
function detectVKLanguage() {
  return new Promise((resolve) => {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        resolve('ru'); // Default to Russian
        return;
      }
      
      // Try to get VK language from page or storage
      // For now, default to Russian as VK's primary language
      resolve('ru');
    });
  });
}

// Get effective language
async function getEffectiveLanguage() {
  if (currentLanguage === 'auto') {
    return await detectVKLanguage();
  }
  return currentLanguage;
}

// Initialize popup
async function initPopup() {
  // Load saved language
  const response = await browser.runtime.sendMessage({ action: "getLanguage" });
  currentLanguage = response || 'auto';
  document.getElementById('language-select').value = currentLanguage;
  
  // Apply translations
  const effectiveLang = await getEffectiveLanguage();
  translatePage(effectiveLang);
  
  // Check keys status
  await checkKeysStatus();
  
  // Check chat status
  await checkChatStatus();
}

// Check if keys exist
async function checkKeysStatus() {
  const result = await browser.runtime.sendMessage({ action: "getKeys" });
  const noKeysDiv = document.getElementById('no-keys');
  const hasKeysDiv = document.getElementById('has-keys');
  const statusDiv = document.getElementById('status');
  const publicKeyDisplay = document.getElementById('public-key-display');
  
  if (result.hasKeys && result.publicKey) {
    noKeysDiv.classList.add('hidden');
    hasKeysDiv.classList.remove('hidden');
    statusDiv.className = 'status status-active';
    
    const effectiveLang = await getEffectiveLanguage();
    statusDiv.querySelector('span').textContent = browser.i18n.getMessage('statusActive');
    
    // Display full public key without truncation
    publicKeyDisplay.value = result.publicKey;
  } else {
    noKeysDiv.classList.remove('hidden');
    hasKeysDiv.classList.add('hidden');
    statusDiv.className = 'status status-inactive';
    
    const effectiveLang = await getEffectiveLanguage();
    statusDiv.querySelector('span').textContent = browser.i18n.getMessage('statusInactive');
    
    publicKeyDisplay.value = '';
  }
}

// Check if chat is open
async function checkChatStatus() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].url) {
      showNoChat();
      return;
    }
    
    const url = tabs[0].url;
    // Match VK chat URLs: /im?sel=... or /im/convo/...
    const chatMatch = url.match(/vk\.com\/im(?:\?sel=|\/convo\/)(\d+)/);
    
    if (chatMatch) {
      const chatId = chatMatch[1];
      const isGroup = chatId.startsWith('2') && chatId.length > 9; // Group chats typically start with 2
      
      showHasChat(isGroup);
    } else {
      showNoChat();
    }
  } catch (error) {
    console.error("Error checking chat status:", error);
    showNoChat();
  }
}

function showNoChat() {
  const noChatDiv = document.getElementById('no-chat');
  const hasChatDiv = document.getElementById('has-chat');
  
  noChatDiv.classList.remove('hidden');
  hasChatDiv.classList.add('hidden');
}

function showHasChat(isGroup) {
  const noChatDiv = document.getElementById('no-chat');
  const hasChatDiv = document.getElementById('has-chat');
  const chatTypeEl = document.getElementById('chat-type');
  
  noChatDiv.classList.add('hidden');
  hasChatDiv.classList.remove('hidden');
  
  const effectiveLang = await getEffectiveLanguage();
  chatTypeEl.textContent = isGroup 
    ? browser.i18n.getMessage('groupChat')
    : browser.i18n.getMessage('personalChat');
}

// Generate key pair
async function generateKeyPair() {
  const generateBtn = document.getElementById('generate-btn');
  const originalText = generateBtn.textContent;
  
  const effectiveLang = await getEffectiveLanguage();
  generateBtn.textContent = browser.i18n.getMessage('generatingKeys');
  generateBtn.disabled = true;
  
  try {
    const result = await browser.runtime.sendMessage({ action: "generateKeyPair" });
    
    if (result.success) {
      // Store the private key
      const publicKeyJwk = JSON.parse(decodeURIComponent(escape(atob(result.publicKey))));
      
      // We need to export and store the private key separately
      // Generate a new keypair that we can export both keys from
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        true,
        ["deriveKey", "deriveBits"]
      );
      
      const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const publicKeyJwkNew = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      
      // Convert to base64 for storage
      const publicKeyBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(publicKeyJwkNew))));
      const privateKeyJwkString = JSON.stringify(privateKeyJwk);
      
      await browser.runtime.sendMessage({ 
        action: "savePrivateKey",
        publicKey: publicKeyBase64,
        privateKeyJwk: privateKeyJwkString
      });
      
      alert(browser.i18n.getMessage('keysGeneratedSuccess'));
      await checkKeysStatus();
    } else {
      alert(browser.i18n.getMessage('keysGenerationError') + ': ' + result.error);
    }
  } catch (error) {
    console.error("Key generation error:", error);
    alert(browser.i18n.getMessage('keysGenerationError') + ': ' + error.message);
  } finally {
    generateBtn.textContent = originalText;
    generateBtn.disabled = false;
  }
}

// Copy public key to clipboard
async function copyPublicKey() {
  const publicKeyDisplay = document.getElementById('public-key-display');
  
  try {
    await navigator.clipboard.writeText(publicKeyDisplay.value);
    
    const effectiveLang = await getEffectiveLanguage();
    const originalText = document.getElementById('copy-public-key-btn').textContent;
    document.getElementById('copy-public-key-btn').textContent = browser.i18n.getMessage('copied');
    
    setTimeout(() => {
      document.getElementById('copy-public-key-btn').textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error("Copy error:", error);
    // Fallback for older browsers
    publicKeyDisplay.select();
    document.execCommand('copy');
  }
}

// Paste contact key from clipboard
async function pasteContactKey() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('contact-public-key').value = text;
  } catch (error) {
    console.error("Paste error:", error);
    alert("Failed to paste from clipboard. Please paste manually.");
  }
}

// Save contact key
async function saveContactKey() {
  const contactName = document.getElementById('contact-name').value.trim();
  const contactPublicKey = document.getElementById('contact-public-key').value.trim();
  
  if (!contactName) {
    alert(browser.i18n.getMessage('enterContactName'));
    return;
  }
  
  if (!contactPublicKey) {
    alert(browser.i18n.getMessage('enterPublicKey'));
    return;
  }
  
  // Validate key format (basic check)
  try {
    // Try to decode the key to validate format
    const decoded = decodeURIComponent(escape(atob(contactPublicKey)));
    JSON.parse(decoded);
  } catch (error) {
    alert(browser.i18n.getMessage('invalidKeyFormat'));
    return;
  }
  
  // Generate a simple ID based on name for now
  // In a real implementation, this would be the actual contact ID
  const contactId = 'contact_' + Date.now();
  
  await browser.runtime.sendMessage({
    action: "saveContactKey",
    contactId: contactId,
    name: contactName,
    publicKey: contactPublicKey
  });
  
  alert(browser.i18n.getMessage('keySaved'));
  
  // Clear fields
  document.getElementById('contact-name').value = '';
  document.getElementById('contact-public-key').value = '';
}

// Language change handler
document.getElementById('language-select').addEventListener('change', async (e) => {
  currentLanguage = e.target.value;
  
  await browser.runtime.sendMessage({ 
    action: "setLanguage", 
    language: currentLanguage 
  });
  
  const effectiveLang = await getEffectiveLanguage();
  translatePage(effectiveLang);
  
  // Update status text
  await checkKeysStatus();
});

// Event listeners
document.getElementById('generate-btn').addEventListener('click', generateKeyPair);
document.getElementById('copy-public-key-btn').addEventListener('click', copyPublicKey);
document.getElementById('paste-contact-key-btn').addEventListener('click', pasteContactKey);
document.getElementById('save-contact-key-btn').addEventListener('click', saveContactKey);

// Initialize on load
initPopup();
