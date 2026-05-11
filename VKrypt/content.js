// VKrypt Content Script - Integrates with VK chat interface

let encryptionEnabled = false;
let currentChatId = null;
let contactKeys = {};
let hasLocalKeys = false;
let myPublicKey = null;

// Initialize content script
async function init() {
  // Load saved data
  const storage = await browser.storage.local.get(['hasKeys', 'publicKey', 'contactKeys', 'encryptionEnabled']);
  hasLocalKeys = storage.hasKeys || false;
  myPublicKey = storage.publicKey || null;
  contactKeys = storage.contactKeys || {};
  encryptionEnabled = storage.encryptionEnabled || false;
  
  // Watch for URL changes
  observeUrlChanges();
  
  // Initial check
  checkCurrentChat();
  
  console.log("VKrypt content script initialized");
}

// Observe URL changes to detect chat switches
function observeUrlChanges() {
  let lastUrl = location.href;
  
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      checkCurrentChat();
    }
  }).observe(document, { subtree: true, childList: true });
}

// Check current chat and update UI
async function checkCurrentChat() {
  const url = location.href;
  
  // Match VK chat URLs: /im?sel=... or /im/convo/...
  const chatMatch = url.match(/vk\.com\/im(?:\?sel=|\/convo\/)(\d+)/);
  
  if (chatMatch) {
    currentChatId = chatMatch[1];
    await injectEncryptionUI();
  } else {
    currentChatId = null;
    removeEncryptionUI();
  }
}

// Inject encryption UI into chat
async function injectEncryptionUI() {
  // Wait for chat interface to load
  await waitForElement('.ConversationCard');
  
  // Remove existing badges
  removeExistingBadges();
  
  // Add status badge
  addStatusBadge();
  
  // Monitor for new messages
  monitorMessages();
}

// Wait for an element to appear
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      resolve(document.querySelector(selector));
      return;
    }
    
    const observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        obs.disconnect();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timeout waiting for element'));
    }, timeout);
  });
}

// Remove existing badges before adding new ones
function removeExistingBadges() {
  document.querySelectorAll('.vkrypt-status-badge').forEach(el => el.remove());
}

// Add status badge to chat header
function addStatusBadge() {
  const header = document.querySelector('.ConversationCard .Header');
  if (!header) return;
  
  const badge = document.createElement('div');
  badge.className = 'vkrypt-status-badge';
  
  if (!hasLocalKeys) {
    badge.classList.add('vkrypt-status-inactive');
    badge.textContent = '⚠️ Нет ключей';
  } else if (!contactKeys[currentChatId]) {
    badge.classList.add('vkrypt-status-inactive');
    badge.textContent = '⚠️ Нет ключа контакта';
  } else if (encryptionEnabled) {
    badge.classList.add('vkrypt-status-active');
    badge.textContent = '🔒 Шифрование активно';
  } else {
    badge.classList.add('vkrypt-status-disabled');
    badge.textContent = '🔓 Шифрование отключено';
  }
  
  header.style.position = 'relative';
  header.appendChild(badge);
}

// Monitor messages for encryption indicators
function monitorMessages() {
  const messageContainer = document.querySelector('.MessageRow');
  if (!messageContainer) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('MessageRow')) {
          checkMessageForEncryption(node);
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Check individual message for encryption
function checkMessageForEncryption(messageEl) {
  // Look for encrypted message markers in the content
  const textContent = messageEl.textContent;
  
  if (textContent.startsWith('VKRYPT_ENC:')) {
    // This is an encrypted message
    messageEl.classList.add('vkrypt-encrypted-marker');
    
    // Add tooltip or indicator
    const indicator = document.createElement('span');
    indicator.className = 'vkrypt-message-indicator';
    indicator.textContent = '🔒';
    indicator.title = 'Зашифрованное сообщение';
    
    const messageText = messageEl.querySelector('.MessageText');
    if (messageText && !messageText.querySelector('.vkrypt-message-indicator')) {
      messageText.prepend(indicator);
    }
  }
}

// Remove encryption UI when leaving chat
function removeEncryptionUI() {
  removeExistingBadges();
  currentChatId = null;
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateStatus") {
    checkCurrentChat();
    sendResponse({ success: true });
  }
  
  if (message.action === "getChatInfo") {
    sendResponse({
      chatId: currentChatId,
      hasKeys: hasLocalKeys,
      hasContactKey: currentChatId ? !!contactKeys[currentChatId] : false,
      encryptionEnabled: encryptionEnabled
    });
  }
  
  return true;
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log("VKrypt content script loaded");
