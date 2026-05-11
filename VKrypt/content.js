// VKrypt Content Script - VK UI Integration

let currentChatId = null;
let isGroupChat = false;
let chatParticipants = [];
let encryptionEnabled = false;
let language = 'ru';

// Initialize
initializeContentScript();

async function initializeContentScript() {
  console.log('VKrypt content script loaded');
  
  // Get language setting
  const langResponse = await chrome.runtime.sendMessage({ action: 'getLanguage' });
  language = langResponse?.language || 'ru';
  
  // Detect VK language from page
  detectVKLanguage();
  
  // Start monitoring for chat changes
  monitorChatChanges();
  
  // Initial chat detection
  setTimeout(detectCurrentChat, 1000);
}

function detectVKLanguage() {
  // Check for VK language indicators in the page
  const htmlLang = document.documentElement.lang;
  const vkLangElement = document.querySelector('[data-lang]');
  
  let detectedLang = 'ru';
  
  if (htmlLang === 'en' || document.body.innerHTML.includes('"lang":"en"')) {
    detectedLang = 'en';
  } else if (htmlLang === 'ru' || document.body.innerHTML.includes('"lang":"ru"')) {
    detectedLang = 'ru';
  }
  
  vkLanguage = detectedLang;
  chrome.runtime.sendMessage({ action: 'detectVKLanguage', vkLang: detectedLang });
  
  // Update language if auto mode
  if (language === 'auto') {
    language = detectedLang;
  }
}

function monitorChatChanges() {
  // Use MutationObserver to detect URL and DOM changes
  const observer = new MutationObserver((mutations) => {
    checkForChatChange();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  
  // Also listen for popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    setTimeout(detectCurrentChat, 500);
  });
  
  // Listen for hash changes
  window.addEventListener('hashchange', () => {
    setTimeout(detectCurrentChat, 500);
  });
}

function checkForChatChange() {
  const url = window.location.href;
  
  // Check if we're still on a chat page
  if (!url.includes('/im')) {
    if (currentChatId) {
      // Left the chat, clean up
      currentChatId = null;
      removeEncryptionUI();
    }
    return;
  }
  
  // Extract chat ID from URL
  // Formats: 
  // https://vk.com/im?sel=c123 (old)
  // https://vk.com/im/convo/123 (new personal)
  // https://vk.com/im/convo/c456 (new group)
  // https://vk.com/im/convo/239940220?entrypoint=list_all
  
  const convoMatch = url.match(/\/im\/convo\/([a-z]?)(\d+)/i);
  const selMatch = url.match(/[?&]sel=([a-z]?)(\d+)/i);
  
  let newChatId = null;
  let newIsGroup = false;
  
  if (convoMatch) {
    const prefix = convoMatch[1].toLowerCase();
    const id = convoMatch[2];
    newChatId = prefix + id;
    newIsGroup = prefix === 'c';
  } else if (selMatch) {
    const prefix = selMatch[1].toLowerCase();
    const id = selMatch[2];
    newChatId = prefix + id;
    newIsGroup = prefix === 'c';
  }
  
  if (newChatId !== currentChatId) {
    currentChatId = newChatId;
    isGroupChat = newIsGroup;
    console.log('Chat changed:', currentChatId, 'Group:', isGroupChat);
    
    if (currentChatId) {
      detectChatParticipants();
      addEncryptionUI();
    } else {
      removeEncryptionUI();
    }
  }
}

function detectCurrentChat() {
  checkForChatChange();
}

function detectChatParticipants() {
  if (!isGroupChat) {
    chatParticipants = [currentChatId];
    return;
  }
  
  // For group chats, try to extract participant IDs from the page
  // VK stores participant info in various places
  const participantElements = document.querySelectorAll('[data-peer-id], .peer[data-peer-id]');
  
  chatParticipants = [];
  participantElements.forEach(el => {
    const peerId = el.getAttribute('data-peer-id');
    if (peerId && !chatParticipants.includes(peerId)) {
      chatParticipants.push(peerId);
    }
  });
  
  // If we couldn't find participants, use the chat ID
  if (chatParticipants.length === 0) {
    chatParticipants = [currentChatId];
  }
  
  console.log('Detected participants:', chatParticipants);
}

// UI Management
let encryptionButton = null;
let statusBadge = null;

function addEncryptionUI() {
  if (!currentChatId) return;
  
  // Wait for chat header to be available
  const waitForHeader = setInterval(() => {
    // Try multiple selectors for VK chat header
    const headerSelectors = [
      '.chat_header',
      '.TopProfile',
      '.im-chat-header',
      '[class*="chatHeader"]',
      '.ConversationCard'
    ];
    
    let header = null;
    for (const selector of headerSelectors) {
      header = document.querySelector(selector);
      if (header) break;
    }
    
    if (!header) {
      // Try finding by structure
      const mainContent = document.querySelector('.page_layout_content, .im-page-wrap');
      if (mainContent) {
        header = mainContent.querySelector('div[class]:first-child');
      }
    }
    
    if (header) {
      clearInterval(waitForHeader);
      injectEncryptionControls(header);
    }
  }, 500);
  
  // Timeout after 5 seconds
  setTimeout(() => clearInterval(waitForHeader), 5000);
}

function injectEncryptionControls(header) {
  // Remove existing controls if any
  removeEncryptionUI();
  
  // Create status badge
  statusBadge = document.createElement('div');
  statusBadge.className = 'vkrypt-status-badge';
  updateStatusBadge();
  
  // Create encryption toggle button
  encryptionButton = document.createElement('button');
  encryptionButton.className = 'vkrypt-encrypt-btn';
  encryptionButton.innerHTML = getTranslation('encryptionToggle');
  encryptionButton.onclick = toggleEncryption;
  
  // Find a good place to insert
  const headerActions = header.querySelector('.chat_actions, .top_profile_actions, [class*="actions"]');
  
  if (headerActions) {
    headerActions.appendChild(statusBadge);
    headerActions.appendChild(encryptionButton);
  } else {
    // Append to header directly
    header.style.position = 'relative';
    header.appendChild(statusBadge);
    header.appendChild(encryptionButton);
  }
  
  // Add message input listener
  addMessageInputListener();
  
  console.log('VKrypt UI injected');
}

function removeEncryptionUI() {
  if (statusBadge) {
    statusBadge.remove();
    statusBadge = null;
  }
  if (encryptionButton) {
    encryptionButton.remove();
    encryptionButton = null;
  }
  
  // Remove encrypted message markers
  document.querySelectorAll('.vkrypt-encrypted-marker').forEach(el => el.remove());
  
  // Remove input listeners
  const inputField = getMessageInput();
  if (inputField) {
    inputField.removeEventListener('keydown', handleEncryptedSend);
  }
}

function updateStatusBadge() {
  if (!statusBadge) return;
  
  chrome.runtime.sendMessage({ action: 'getKeyPair' }, (response) => {
    if (!response || !response.hasKeys) {
      statusBadge.textContent = '⚠️';
      statusBadge.title = getTranslation('statusInactive');
      statusBadge.className = 'vkrypt-status-badge vkrypt-status-warning';
    } else {
      // Check if contact key exists
      chrome.runtime.sendMessage({ action: 'getContactKeys' }, (resp) => {
        const keys = resp?.keys || {};
        const hasContactKey = keys[currentChatId] || (isGroupChat && Object.keys(keys).length > 0);
        
        if (hasContactKey && encryptionEnabled) {
          statusBadge.textContent = '🔒';
          statusBadge.title = getTranslation('statusActive');
          statusBadge.className = 'vkrypt-status-badge vkrypt-status-active';
        } else if (hasContactKey) {
          statusBadge.textContent = '🔓';
          statusBadge.title = getTranslation('statusDisabled');
          statusBadge.className = 'vkrypt-status-badge vkrypt-status-disabled';
        } else {
          statusBadge.textContent = '⚠️';
          statusBadge.title = getTranslation('statusInactive');
          statusBadge.className = 'vkrypt-status-badge vkrypt-status-warning';
        }
      });
    }
  });
}

function toggleEncryption() {
  if (!encryptionEnabled) {
    // Check if we have keys
    chrome.runtime.sendMessage({ action: 'getKeyPair' }, (response) => {
      if (!response || !response.hasKeys) {
        alert(getTranslation('keysNotGenerated'));
        return;
      }
      
      // Check if we have contact key
      chrome.runtime.sendMessage({ action: 'getContactKeys' }, (resp) => {
        const keys = resp?.keys || {};
        const hasContactKey = keys[currentChatId] || (isGroupChat && Object.keys(keys).length > 0);
        
        if (!hasContactKey) {
          alert(getTranslation('statusInactive'));
          return;
        }
        
        encryptionEnabled = true;
        updateStatusBadge();
        addMessageInputListener();
      });
    });
  } else {
    encryptionEnabled = false;
    updateStatusBadge();
  }
}

function getMessageInput() {
  // Multiple selectors for VK message input
  const selectors = [
    '.message_field textarea',
    '.im-message-field textarea',
    '[data-placeholder*="message" i] textarea',
    '.editable',
    '[contenteditable="true"]'
  ];
  
  for (const selector of selectors) {
    const input = document.querySelector(selector);
    if (input) return input;
  }
  
  return null;
}

function addMessageInputListener() {
  const inputField = getMessageInput();
  if (inputField) {
    inputField.removeEventListener('keydown', handleEncryptedSend);
    inputField.addEventListener('keydown', handleEncryptedSend);
  }
}

function handleEncryptedSend(event) {
  if (!encryptionEnabled || !event.shiftKey || event.key !== 'Enter') {
    return;
  }
  
  event.preventDefault();
  
  const inputField = getMessageInput();
  if (!inputField) return;
  
  const message = inputField.value.trim();
  if (!message) return;
  
  // Send encrypted message
  encryptAndSend(message);
}

async function encryptAndSend(message) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'encryptMessage',
      message: message,
      contactId: currentChatId,
      isGroup: isGroupChat,
      participantIds: chatParticipants
    });
    
    if (response.success) {
      // Convert to JSON string for sending
      const encryptedText = 'VKRYPT:' + JSON.stringify(response.encryptedData);
      
      // Insert into input field and send
      const inputField = getMessageInput();
      if (inputField) {
        inputField.value = encryptedText;
        
        // Trigger input event
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Send message (simulate Enter press)
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        inputField.dispatchEvent(enterEvent);
        
        // Clear input
        setTimeout(() => {
          inputField.value = '';
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }, 100);
      }
    }
  } catch (error) {
    console.error('Encryption failed:', error);
    alert('Failed to encrypt message: ' + error.message);
  }
}

// Message decryption and display
function processIncomingMessages() {
  const messageSelectors = [
    '.message',
    '.im-message',
    '[class*="messageRow"]'
  ];
  
  for (const selector of messageSelectors) {
    const messages = document.querySelectorAll(selector);
    messages.forEach(msg => {
      if (!msg.classList.contains('vkrypt-processed')) {
        msg.classList.add('vkrypt-processed');
        checkAndDecryptMessage(msg);
      }
    });
  }
}

async function checkAndDecryptMessage(messageElement) {
  const textContent = messageElement.textContent || messageElement.innerText;
  
  if (!textContent.startsWith('VKRYPT:')) {
    return;
  }
  
  try {
    const encryptedJson = textContent.substring(7);
    const encryptedData = JSON.parse(encryptedJson);
    
    // Extract sender ID from message element
    const senderId = messageElement.getAttribute('data-from-id') || 
                     messageElement.closest('[data-peer-id]')?.getAttribute('data-peer-id') ||
                     currentChatId;
    
    const response = await chrome.runtime.sendMessage({
      action: 'decryptMessage',
      encryptedData: encryptedData,
      senderId: senderId
    });
    
    if (response.success) {
      // Replace encrypted content with decrypted message
      const messageBody = messageElement.querySelector('.message_text, .im-message-text, [class*="text"]');
      if (messageBody) {
        messageBody.textContent = response.message;
        messageBody.classList.add('vkrypt-decrypted');
        
        // Add decryption indicator
        const indicator = document.createElement('span');
        indicator.className = 'vkrypt-encrypted-marker';
        indicator.textContent = '🔒';
        indicator.title = getTranslation('encryptedMessage');
        messageBody.insertBefore(indicator, messageBody.firstChild);
      }
    }
  } catch (error) {
    console.error('Decryption failed:', error);
    // Mark as failed decryption
    messageElement.classList.add('vkrypt-decrypt-failed');
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getChatInfo') {
    sendResponse({
      detected: !!currentChatId,
      chatId: currentChatId,
      isGroup: isGroupChat,
      participants: chatParticipants
    });
  }
  
  if (request.action === 'detectLanguage') {
    detectVKLanguage();
    sendResponse({ language: vkLanguage });
  }
  
  return true;
});

// Translation helper
function getTranslation(key) {
  const translations = {
    ru: {
      encryptionToggle: 'Шифрование',
      statusActive: '🔒 Шифрование активно',
      statusInactive: '⚠️ Нужны ключи',
      statusDisabled: '🔓 Отключено',
      keysNotGenerated: '❌ Ключи не сгенерированы. Откройте настройки расширения.',
      encryptedMessage: '🔒 Зашифровано'
    },
    en: {
      encryptionToggle: 'Encryption',
      statusActive: '🔒 Encryption Active',
      statusInactive: '⚠️ Keys Needed',
      statusDisabled: '🔓 Disabled',
      keysNotGenerated: '❌ Keys not generated. Open extension settings.',
      encryptedMessage: '🔒 Encrypted'
    }
  };
  
  const lang = language || 'ru';
  return translations[lang]?.[key] || translations.ru[key] || key;
}

// Monitor for new messages periodically
setInterval(processIncomingMessages, 2000);

// Initial message processing
setTimeout(processIncomingMessages, 2000);

console.log('VKrypt content script initialized');
