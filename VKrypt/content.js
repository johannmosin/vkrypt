// VKrypt Content Script
// Integrates with VK's native message interface

let currentContactId = null;
let encryptionEnabled = false;
let peerPublicKey = null;
let ownPublicKey = null;

// VKrypt UI Elements
const VKRYPT_STYLE_PREFIX = "vkrypt-";

// Initialize the extension
async function init() {
  console.log("VKrypt: Initializing...");
  
  // Check if we have keys
  const status = await checkEncryptionStatus();
  if (!status.hasOwnKey) {
    showKeyGenerationPrompt();
  }
  
  // Monitor URL changes for chat navigation
  observeChatNavigation();
  
  // Inject UI into chat interface
  injectUI();
  
  console.log("VKrypt: Initialized");
}

// Check encryption status for current contact
async function checkEncryptionStatus() {
  return new Promise((resolve) => {
    browser.runtime.sendMessage({ 
      action: "checkEncryptionStatus", 
      contactId: currentContactId 
    }, (response) => {
      resolve(response || { hasOwnKey: false, hasPeerKey: false, enabled: false });
    });
  });
}

// Show key generation prompt in popup
function showKeyGenerationPrompt() {
  // Will be handled by popup
  console.log("VKrypt: Key generation needed");
}

// Observe chat navigation
function observeChatNavigation() {
  // Monitor for chat page changes
  let lastUrl = location.href;
  
  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleNavigation();
    }
    
    // Also check for dynamic chat changes (SPA navigation)
    checkCurrentChat();
  });
  
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  
  // Initial check
  setTimeout(checkCurrentChat, 1000);
  setTimeout(checkCurrentChat, 3000);
}

// Handle navigation events
function handleNavigation() {
  console.log("VKrypt: Navigation detected");
  setTimeout(checkCurrentChat, 500);
}

// Check current chat and extract contact ID
function checkCurrentChat() {
  const url = location.href;
  
  // VK chat URL patterns
  const match = url.match(/\/im\?sel=(-?\d+)/);
  if (match && match[1]) {
    const newContactId = match[1];
    if (newContactId !== currentContactId) {
      currentContactId = newContactId;
      console.log("VKrypt: Contact changed to", currentContactId);
      updateEncryptionStatus();
      injectMessageObserver();
    }
  }
}

// Update encryption status UI
async function updateEncryptionStatus() {
  if (!currentContactId) return;
  
  const status = await checkEncryptionStatus();
  encryptionEnabled = status.enabled;
  
  updateStatusBadge(status);
}

// Update status badge in chat header
function updateStatusBadge(status) {
  // Remove existing badge
  const existingBadge = document.querySelector('.vkrypt-status-badge');
  if (existingBadge) {
    existingBadge.remove();
  }
  
  // Find chat header
  const chatHeader = document.querySelector('.chat_header, .top_profile_info, .TopProfileInfo');
  if (!chatHeader) return;
  
  // Create badge
  const badge = document.createElement('div');
  badge.className = 'vkrypt-status-badge';
  
  if (!status.hasOwnKey) {
    badge.textContent = '⚠️ VKrypt: Generate Keys';
    badge.title = 'Click to generate encryption keys';
    badge.style.backgroundColor = '#ff9800';
    badge.onclick = () => browser.runtime.sendMessage({ action: "openPopup" });
  } else if (!status.hasPeerKey) {
    badge.textContent = '🔓 VKrypt: Add Contact Key';
    badge.title = 'Click to add contact\'s public key';
    badge.style.backgroundColor = '#2196f3';
    badge.onclick = () => openKeyExchangeDialog();
  } else if (status.enabled) {
    badge.textContent = '🔒 VKrypt Active';
    badge.title = 'End-to-end encryption enabled';
    badge.style.backgroundColor = '#4caf50';
  }
  
  chatHeader.appendChild(badge);
}

// Open key exchange dialog
function openKeyExchangeDialog() {
  // Remove existing dialog
  closeKeyExchangeDialog();
  
  const dialog = document.createElement('div');
  dialog.id = 'vkrypt-key-exchange';
  dialog.className = 'vkrypt-dialog';
  dialog.innerHTML = `
    <div class="vkrypt-dialog-content">
      <div class="vkrypt-dialog-header">
        <h3>🔑 VKrypt Key Exchange</h3>
        <button class="vkrypt-close-btn">&times;</button>
      </div>
      <div class="vkrypt-dialog-body">
        <p>To enable encryption, you need to exchange public keys with your contact outside of VK.</p>
        
        <div class="vkrypt-section">
          <h4>Your Public Key:</h4>
          <textarea id="vkrypt-own-key" readonly></textarea>
          <button id="vkrypt-copy-own-key" class="vkrypt-btn">Copy Key</button>
        </div>
        
        <div class="vkrypt-section">
          <h4>Contact's Public Key:</h4>
          <p class="vkrypt-hint">Paste the public key your contact shared with you:</p>
          <textarea id="vkrypt-peer-key" placeholder="Paste contact's public key here..."></textarea>
          <button id="vkrypt-save-peer-key" class="vkrypt-btn vkrypt-btn-primary">Save Key</button>
        </div>
        
        <div id="vkrypt-key-status" class="vkrypt-status"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Load own public key
  loadOwnPublicKey();
  
  // Event listeners
  dialog.querySelector('.vkrypt-close-btn').onclick = closeKeyExchangeDialog;
  dialog.querySelector('#vkrypt-copy-own-key').onclick = copyOwnKey;
  dialog.querySelector('#vkrypt-save-peer-key').onclick = savePeerKey;
  
  // Close on outside click
  dialog.onclick = (e) => {
    if (e.target === dialog) closeKeyExchangeDialog();
  };
}

function closeKeyExchangeDialog() {
  const dialog = document.getElementById('vkrypt-key-exchange');
  if (dialog) dialog.remove();
}

async function loadOwnPublicKey() {
  const textarea = document.getElementById('vkrypt-own-key');
  if (!textarea) return;
  
  const response = await browser.runtime.sendMessage({ action: "getPublicKey" });
  if (response.success) {
    textarea.value = response.publicKey;
  } else {
    textarea.value = "Error loading key. Please generate keys first.";
  }
}

async function copyOwnKey() {
  const textarea = document.getElementById('vkrypt-own-key');
  if (textarea) {
    textarea.select();
    document.execCommand('copy');
    showStatus('Key copied to clipboard!', 'success');
  }
}

async function savePeerKey() {
  const textarea = document.getElementById('vkrypt-peer-key');
  const peerKey = textarea ? textarea.value.trim() : '';
  
  if (!peerKey) {
    showStatus('Please paste a valid public key', 'error');
    return;
  }
  
  const response = await browser.runtime.sendMessage({
    action: "storePeerPublicKey",
    contactId: currentContactId,
    publicKey: peerKey
  });
  
  if (response.success) {
    showStatus('Contact key saved! Encryption enabled.', 'success');
    setTimeout(() => {
      closeKeyExchangeDialog();
      updateEncryptionStatus();
    }, 1500);
  } else {
    showStatus('Error saving key: ' + response.error, 'error');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('vkrypt-key-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `vkrypt-status vkrypt-${type}`;
  }
}

// Inject UI elements
function injectUI() {
  // Add encrypt button near send button
  addEncryptButton();
  
  // Add indicator for encrypted messages
  markEncryptedMessages();
}

// Add encrypt/decrypt toggle button
function addEncryptButton() {
  // Remove existing button
  const existing = document.querySelector('.vkrypt-encrypt-toggle');
  if (existing) existing.remove();
  
  // Find message input area
  const inputArea = document.querySelector('.message_input, .MessageInput, .message_field');
  if (!inputArea) return;
  
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'vkrypt-encrypt-toggle';
  toggleBtn.innerHTML = encryptionEnabled ? '🔒' : '🔓';
  toggleBtn.title = encryptionEnabled ? 'Encryption ON - Click to disable' : 'Encryption OFF - Click to enable';
  toggleBtn.onclick = toggleEncryption;
  
  inputArea.parentElement.insertBefore(toggleBtn, inputArea);
}

// Toggle encryption state
function toggleEncryption() {
  encryptionEnabled = !encryptionEnabled;
  addEncryptButton(); // Re-render button
  
  const btn = document.querySelector('.vkrypt-encrypt-toggle');
  if (btn) {
    btn.title = encryptionEnabled ? 'Encryption ON' : 'Encryption OFF';
  }
}

// Inject message observer to detect new messages
function injectMessageObserver() {
  const messageContainer = document.querySelector('.messages, .Messages, .conversation_messages');
  if (!messageContainer) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          checkMessageForEncryption(node);
        }
      });
    });
  });
  
  observer.observe(messageContainer, {
    childList: true,
    subtree: true
  });
  
  // Mark existing messages
  document.querySelectorAll('.message, .Message, .conversation_message').forEach(checkMessageForEncryption);
}

// Check if message is encrypted and mark it
function checkMessageForEncryption(messageEl) {
  if (!messageEl.classList || messageEl.classList.contains('vkrypt-processed')) return;
  
  messageEl.classList.add('vkrypt-processed');
  
  const textContent = messageEl.textContent || messageEl.innerText;
  
  // Check for encrypted message marker
  if (textContent.startsWith('[VKRYPT]')) {
    messageEl.classList.add('vkrypt-encrypted-message');
    
    // Add decrypt button
    const decryptBtn = document.createElement('span');
    decryptBtn.className = 'vkrypt-decrypt-btn';
    decryptBtn.textContent = '🔒 Decrypt';
    decryptBtn.onclick = () => decryptMessageInPlace(messageEl);
    
    messageEl.appendChild(decryptBtn);
  }
}

// Mark encrypted messages in the thread
function markEncryptedMessages() {
  document.querySelectorAll('.message, .Message, .conversation_message').forEach((msg) => {
    checkMessageForEncryption(msg);
  });
}

// Decrypt message in place
async function decryptMessageInPlace(messageEl) {
  if (!peerPublicKey) {
    alert('No encryption key for this contact. Please add their public key first.');
    return;
  }
  
  const content = messageEl.textContent || messageEl.innerText;
  const encryptedData = content.replace('[VKRYPT]', '').trim();
  
  const response = await browser.runtime.sendMessage({
    action: "decrypt",
    encrypted: encryptedData,
    peerPublicKey: peerPublicKey
  });
  
  if (response.success) {
    messageEl.innerHTML = `<span class="vkrypt-decrypted">${response.decrypted}</span>`;
    messageEl.classList.add('vkrypt-decrypted');
  } else {
    alert('Decryption failed: ' + response.error);
  }
}

// Intercept send to encrypt if enabled
function interceptSend() {
  // This will be implemented based on VK's specific send mechanism
  console.log("VKrypt: Send interception ready");
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "updateStatus":
      updateEncryptionStatus();
      sendResponse({ success: true });
      break;
      
    case "getStatus":
      sendResponse({
        contactId: currentContactId,
        encryptionEnabled: encryptionEnabled,
        hasPeerKey: !!peerPublicKey
      });
      break;
      
    case "openKeyExchange":
      openKeyExchangeDialog();
      sendResponse({ success: true });
      break;
  }
  
  return true;
});

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log("VKrypt content script loaded");
