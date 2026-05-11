/**
 * VK E2EE - Content Script
 * Integrates with VK's message interface to provide E2EE functionality
 */

(function() {
  'use strict';

  // State management
  const state = {
    currentChatId: null,
    isEncryptionEnabled: false,
    encryptionKey: null,
    contactKeys: {},
    initialized: false
  };

  // Selectors for VK's DOM elements (may need updates as VK changes their UI)
  const SELECTORS = {
    MESSAGE_INPUT: '[data-placeholder="Напишите сообщение..."], [data-placeholder="Write a message..."], .im-editable',
    MESSAGE_CONTAINER: '.im-chat-messages, .im-dialogs-list',
    MESSAGE_BUBBLE: '.im-message-snippet, .im-message--text, .wall_module .post_text, .message_text',
    SEND_BUTTON: '.im-send-btn, button[data-action="send_message"]',
    CHAT_HEADER: '.im-chat-header, .top_profile_info',
    CONVERSATION_LIST: '.im-dialogs-item'
  };

  /**
   * Initialize the extension
   */
  async function init() {
    if (state.initialized) return;
    
    await loadSettings();
    setupMessageObserver();
    setupSendInterceptor();
    addEncryptionIndicator();
    state.initialized = true;
    
    console.log('[VK E2EE] Initialized');
  }

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getSettings' });
      if (response && response.success) {
        state.isEncryptionEnabled = response.settings.enabled || false;
        state.contactKeys = response.settings.contactKeys || {};
        
        if (response.settings.currentKey) {
          state.encryptionKey = await VK_E2EE_CRYPTO.importKey(response.settings.currentKey);
        }
      }
    } catch (error) {
      console.warn('[VK E2EE] Could not load settings:', error);
    }
  }

  /**
   * Set up MutationObserver to watch for new messages
   */
  function setupMessageObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it's a message bubble
            if (node.matches && node.matches(SELECTORS.MESSAGE_BUBBLE)) {
              processIncomingMessage(node);
            }
            
            // Check children for message bubbles
            const messageBubbles = node.querySelectorAll ? 
              node.querySelectorAll(SELECTORS.MESSAGE_BUBBLE) : [];
            messageBubbles.forEach(processIncomingMessage);
          }
        });
      });
    });

    // Start observing
    setTimeout(() => {
      const container = document.querySelector(SELECTORS.MESSAGE_CONTAINER) || document.body;
      observer.observe(container, { childList: true, subtree: true });
      
      // Process existing messages
      processExistingMessages();
    }, 1000);
  }

  /**
   * Process existing messages on page load
   */
  async function processExistingMessages() {
    const messages = document.querySelectorAll(SELECTORS.MESSAGE_BUBBLE);
    for (const msg of messages) {
      await processIncomingMessage(msg);
    }
  }

  /**
   * Process an incoming message to decrypt if encrypted
   * @param {Element} messageElement 
   */
  async function processIncomingMessage(messageElement) {
    if (!messageElement || messageElement.dataset.e2eeProcessed) return;
    
    messageElement.dataset.e2eeProcessed = 'true';
    
    // Get message text
    let textContent = messageElement.textContent?.trim();
    if (!textContent) return;
    
    // Check if message is encrypted
    if (textContent.startsWith('{"type":"e2ee"')) {
      try {
        const result = await VK_E2EE_CRYPTO.parseMessagePayload(textContent, state.encryptionKey);
        
        if (result.isEncrypted) {
          // Replace content with decrypted text
          messageElement.textContent = result.content;
          messageElement.classList.add('e2ee-decrypted');
          
          // Add decryption indicator
          const indicator = document.createElement('span');
          indicator.className = 'e2ee-indicator e2ee-lock';
          indicator.title = 'Decrypted message';
          messageElement.insertBefore(indicator, messageElement.firstChild);
        }
      } catch (error) {
        console.warn('[VK E2EE] Failed to decrypt message:', error);
        messageElement.classList.add('e2ee-encrypted-error');
        messageElement.title = 'Encrypted message (cannot decrypt - missing key)';
      }
    }
  }

  /**
   * Intercept message sending to encrypt before transmission
   */
  function setupSendInterceptor() {
    // Override the send function
    const originalSend = window.fetch;
    
    window.fetch = async function(url, options) {
      if (url && url.includes('vk.com') && url.includes('im')) {
        // Check if this is a message send request
        if (options && options.method === 'POST' && options.body) {
          try {
            const bodyParams = new URLSearchParams(options.body);
            if (bodyParams.has('message')) {
              const message = bodyParams.get('message');
              
              // Encrypt if enabled for this chat
              if (state.isEncryptionEnabled && state.encryptionKey) {
                const encryptedPayload = await VK_E2EE_CRYPTO.createEncryptedPayload(
                  message,
                  state.encryptionKey
                );
                
                bodyParams.set('message', encryptedPayload);
                options.body = bodyParams.toString();
              }
            }
          } catch (error) {
            console.warn('[VK E2EE] Failed to encrypt outgoing message:', error);
          }
        }
      }
      
      return originalSend.apply(this, arguments);
    };

    // Also listen for click events on send button
    document.addEventListener('click', async (e) => {
      if (e.target.closest(SELECTORS.SEND_BUTTON)) {
        const input = document.querySelector(SELECTORS.MESSAGE_INPUT);
        if (input && state.isEncryptionEnabled && state.encryptionKey) {
          const message = input.textContent || input.value;
          if (message && !message.startsWith('{"type":"e2ee"')) {
            try {
              const encryptedPayload = await VK_E2EE_CRYPTO.createEncryptedPayload(
                message,
                state.encryptionKey
              );
              
              // Update input with encrypted message
              if (input.tagName === 'DIV') {
                input.textContent = encryptedPayload;
              } else {
                input.value = encryptedPayload;
              }
              
              // Trigger input event to notify VK
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (error) {
              console.warn('[VK E2EE] Failed to encrypt message:', error);
            }
          }
        }
      }
    });
  }

  /**
   * Add encryption status indicator to the UI
   */
  function addEncryptionIndicator() {
    // Create indicator element
    const indicator = document.createElement('div');
    indicator.id = 'vk-e2ee-status';
    indicator.className = 'vk-e2ee-status';
    
    updateEncryptionIndicator(indicator);
    
    // Insert into header
    const header = document.querySelector(SELECTORS.CHAT_HEADER);
    if (header) {
      header.appendChild(indicator);
    } else {
      // Fallback: add to top of page
      document.body.appendChild(indicator);
    }
    
    // Listen for settings changes
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'settingsUpdated') {
        state.isEncryptionEnabled = message.settings.enabled;
        updateEncryptionIndicator(indicator);
      }
    });
  }

  /**
   * Update the encryption indicator based on current state
   * @param {Element} indicator 
   */
  function updateEncryptionIndicator(indicator) {
    indicator.innerHTML = '';
    
    if (!state.isEncryptionEnabled) {
      indicator.className = 'vk-e2ee-status vk-e2ee-warning';
      indicator.innerHTML = '<span class="e2ee-icon">⚠️</span><span class="e2ee-text">Encryption disabled</span>';
      indicator.title = 'Click extension icon to enable encryption';
    } else if (state.encryptionKey) {
      indicator.className = 'vk-e2ee-status vk-e2ee-enabled';
      indicator.innerHTML = '<span class="e2ee-icon">🔒</span><span class="e2ee-text">E2EE Active</span>';
      indicator.title = 'End-to-end encryption is active';
    } else {
      indicator.className = 'vk-e2ee-status vk-e2ee-no-key';
      indicator.innerHTML = '<span class="e2ee-icon">🔓</span><span class="e2ee-text">No key configured</span>';
      indicator.title = 'Import your encryption key in extension settings';
    }
  }

  /**
   * Handle navigation and chat changes
   */
  function setupNavigationObserver() {
    // Observe URL changes for SPA navigation
    let lastUrl = location.href;
    
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        // Re-initialize for new chat
        setTimeout(init, 500);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Setup navigation observer
  setupNavigationObserver();

})();
