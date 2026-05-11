// VKrypt Popup Script

let currentLanguage = 'ru';
let translations = {};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('VKrypt popup initialized');
  
  // Load language setting
  await loadLanguage();
  
  // Apply translations
  applyTranslations();
  
  // Check key status
  await checkKeyStatus();
  
  // Load saved contact keys
  await loadContactKeys();
  
  // Get current chat info
  await getCurrentChatInfo();
  
  // Setup event listeners
  setupEventListeners();
});

async function loadLanguage() {
  const response = await chrome.runtime.sendMessage({ action: 'getLanguage' });
  currentLanguage = response?.language || 'ru';
  
  // Update language select
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.value = currentLanguage;
  }
}

function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = getTranslation(key);
    
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.hasAttribute('placeholder')) {
        el.placeholder = translation;
      }
    } else {
      el.textContent = translation;
    }
  });
  
  // Update HTML lang attribute
  document.documentElement.lang = currentLanguage;
}

function getTranslation(key) {
  const translations = {
    ru: {
      extensionDescription: 'Сквозное шифрование для ВКонтакте',
      statusInactive: 'Нужны ключи',
      statusActive: 'Шифрование активно',
      statusDisabled: 'Отключено',
      generateKeys: 'Сгенерировать ключи',
      yourPublicKey: 'Ваш открытый ключ:',
      importContactKey: 'Импорт ключа контакта:',
      contactName: 'Имя контакта:',
      contactPublicKey: 'Открытый ключ контакта:',
      save: 'Сохранить',
      cancel: 'Отмена',
      copyToClipboard: 'Копировать',
      pasteFromClipboard: 'Вставить',
      copied: 'Скопировано!',
      settings: 'Настройки',
      language: 'Язык:',
      autoLanguage: 'Авто (как VK)',
      russian: 'Русский',
      english: 'English',
      groupParticipants: 'Участники:',
      chatDetected: 'Чат:',
      noChatDetected: 'Чат не обнаружен',
      personalChat: 'Личный чат',
      groupChat: 'Групповой чат',
      remove: 'Удалить'
    },
    en: {
      extensionDescription: 'End-to-End Encryption for VKontakte',
      statusInactive: 'Keys Needed',
      statusActive: 'Encryption Active',
      statusDisabled: 'Disabled',
      generateKeys: 'Generate Keys',
      yourPublicKey: 'Your Public Key:',
      importContactKey: 'Import Contact Key:',
      contactName: 'Contact Name:',
      contactPublicKey: 'Contact Public Key:',
      save: 'Save',
      cancel: 'Cancel',
      copyToClipboard: 'Copy',
      pasteFromClipboard: 'Paste',
      copied: 'Copied!',
      settings: 'Settings',
      language: 'Language:',
      autoLanguage: 'Auto (like VK)',
      russian: 'Русский',
      english: 'English',
      groupParticipants: 'Participants:',
      chatDetected: 'Chat:',
      noChatDetected: 'No chat detected',
      personalChat: 'Personal Chat',
      groupChat: 'Group Chat',
      remove: 'Remove'
    }
  };
  
  const lang = currentLanguage || 'ru';
  return translations[lang]?.[key] || translations.ru[key] || key;
}

async function checkKeyStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'getKeyPair' });
  
  const statusIndicator = document.getElementById('status-indicator');
  const statusIcon = statusIndicator?.querySelector('.status-icon');
  const statusText = statusIndicator?.querySelector('.status-text');
  const keyGenerationSection = document.getElementById('key-generation-section');
  const keysSection = document.getElementById('keys-section');
  
  if (response?.hasKeys) {
    // Keys exist
    if (statusIndicator) {
      statusIndicator.className = 'status-indicator vkrypt-status-active';
      statusIcon.textContent = '✅';
      statusText.textContent = getTranslation('statusActive');
    }
    
    if (keyGenerationSection) keyGenerationSection.style.display = 'none';
    if (keysSection) keysSection.style.display = 'block';
    
    // Display public key (full, not truncated)
    const publicKeyTextarea = document.getElementById('public-key-textarea');
    if (publicKeyTextarea) {
      publicKeyTextarea.value = response.publicKey;
    }
  } else {
    // No keys
    if (statusIndicator) {
      statusIndicator.className = 'status-indicator vkrypt-status-warning';
      statusIcon.textContent = '⚠️';
      statusText.textContent = getTranslation('statusInactive');
    }
    
    if (keyGenerationSection) keyGenerationSection.style.display = 'block';
    if (keysSection) keysSection.style.display = 'none';
  }
}

async function loadContactKeys() {
  const response = await chrome.runtime.sendMessage({ action: 'getContactKeys' });
  const keys = response?.keys || {};
  
  const savedKeysList = document.getElementById('saved-keys-list');
  if (!savedKeysList) return;
  
  savedKeysList.innerHTML = '';
  
  const keyEntries = Object.entries(keys);
  if (keyEntries.length === 0) {
    savedKeysList.innerHTML = `<li style="color: #666677; justify-content: center;">${currentLanguage === 'en' ? 'No contacts added' : 'Контакты не добавлены'}</li>`;
    return;
  }
  
  keyEntries.forEach(([contactId, keyData]) => {
    const li = document.createElement('li');
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'key-name';
    nameSpan.textContent = `${keyData.name || contactId}`;
    nameSpan.title = `ID: ${contactId}`;
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'key-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = getTranslation('remove');
    deleteBtn.onclick = () => deleteContactKey(contactId);
    
    actionsDiv.appendChild(deleteBtn);
    li.appendChild(nameSpan);
    li.appendChild(actionsDiv);
    savedKeysList.appendChild(li);
  });
}

async function deleteContactKey(contactId) {
  const result = await chrome.storage.local.get(['contactKeys']);
  const contactKeys = result.contactKeys || {};
  
  delete contactKeys[contactId];
  
  await chrome.storage.local.set({ contactKeys });
  await loadContactKeys();
  
  // Update content script if VK tab is open
  updateContentScript();
}

function setupEventListeners() {
  // Generate keys button
  const generateBtn = document.getElementById('generate-keys-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', generateKeyPair);
  }
  
  // Copy public key button
  const copyPublicKeyBtn = document.getElementById('copy-public-key-btn');
  if (copyPublicKeyBtn) {
    copyPublicKeyBtn.addEventListener('click', copyPublicKey);
  }
  
  // Paste contact key button
  const pasteContactKeyBtn = document.getElementById('paste-contact-key-btn');
  if (pasteContactKeyBtn) {
    pasteContactKeyBtn.addEventListener('click', pasteContactKey);
  }
  
  // Save contact key button
  const saveContactKeyBtn = document.getElementById('save-contact-key-btn');
  if (saveContactKeyBtn) {
    saveContactKeyBtn.addEventListener('click', saveContactKey);
  }
  
  // Language select
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.addEventListener('change', changeLanguage);
  }
}

async function generateKeyPair() {
  const generateBtn = document.getElementById('generate-keys-btn');
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = currentLanguage === 'en' ? 'Generating...' : 'Генерация...';
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'generateKeyPair' });
    
    if (response.success) {
      console.log('Keys generated successfully');
      await checkKeyStatus();
      await loadContactKeys();
    } else {
      alert(currentLanguage === 'en' ? 'Failed to generate keys' : 'Не удалось сгенерировать ключи');
    }
  } catch (error) {
    console.error('Key generation error:', error);
    alert(currentLanguage === 'en' ? 'Error: ' + error.message : 'Ошибка: ' + error.message);
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = getTranslation('generateKeys');
    }
  }
}

async function copyPublicKey() {
  const publicKeyTextarea = document.getElementById('public-key-textarea');
  if (!publicKeyTextarea) return;
  
  try {
    await navigator.clipboard.writeText(publicKeyTextarea.value);
    
    const copyBtn = document.getElementById('copy-public-key-btn');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = getTranslation('copied');
      copyBtn.classList.add('copy-success');
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove('copy-success');
      }, 1500);
    }
  } catch (error) {
    // Fallback for older browsers
    publicKeyTextarea.select();
    document.execCommand('copy');
  }
}

async function pasteContactKey() {
  const contactKeyTextarea = document.getElementById('contact-key-textarea');
  if (!contactKeyTextarea) return;
  
  try {
    const text = await navigator.clipboard.readText();
    contactKeyTextarea.value = text;
  } catch (error) {
    alert(currentLanguage === 'en' ? 'Failed to paste from clipboard' : 'Не удалось вставить из буфера обмена');
  }
}

async function saveContactKey() {
  const contactNameInput = document.getElementById('contact-name-input');
  const contactKeyTextarea = document.getElementById('contact-key-textarea');
  
  if (!contactNameInput || !contactKeyTextarea) return;
  
  const contactName = contactNameInput.value.trim();
  const contactKey = contactKeyTextarea.value.trim();
  
  if (!contactKey) {
    alert(currentLanguage === 'en' ? 'Please enter a public key' : 'Введите открытый ключ');
    return;
  }
  
  // Validate key format (basic check)
  if (!contactKey.startsWith('MFkw') && !contactKey.startsWith('MIIB')) {
    const confirmSave = confirm(
      currentLanguage === 'en' 
        ? 'This key format looks unusual. Continue anyway?' 
        : 'Формат ключа выглядит необычно. Продолжить?'
    );
    if (!confirmSave) return;
  }
  
  // Use contact name or generate ID
  const contactId = contactName || 'contact_' + Date.now();
  
  try {
    await chrome.runtime.sendMessage({
      action: 'saveContactKey',
      contactId: contactId,
      publicKey: contactKey,
      name: contactName || contactId
    });
    
    // Clear inputs
    contactNameInput.value = '';
    contactKeyTextarea.value = '';
    
    // Reload keys list
    await loadContactKeys();
    
    // Update content script
    updateContentScript();
    
    alert(currentLanguage === 'en' ? 'Contact key saved!' : 'Ключ контакта сохранён!');
  } catch (error) {
    console.error('Save contact key error:', error);
    alert(currentLanguage === 'en' ? 'Failed to save key' : 'Не удалось сохранить ключ');
  }
}

async function changeLanguage(event) {
  const newLanguage = event.target.value;
  currentLanguage = newLanguage;
  
  await chrome.runtime.sendMessage({
    action: 'setLanguage',
    language: newLanguage
  });
  
  applyTranslations();
  await checkKeyStatus();
  await loadContactKeys();
}

async function getCurrentChatInfo() {
  const chatInfoDiv = document.getElementById('current-chat-info');
  if (!chatInfoDiv) return;
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('vk.com/im')) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getChatInfo' });
      
      if (response?.detected) {
        const chatType = response.isGroup 
          ? getTranslation('groupChat') 
          : getTranslation('personalChat');
        
        chatInfoDiv.className = 'chat-info has-chat';
        chatInfoDiv.innerHTML = `
          <strong>${response.chatId}</strong><br>
          ${chatType}
          ${response.participants?.length > 1 ? `<br>${getTranslation('groupParticipants')} ${response.participants.length}` : ''}
        `;
        return;
      }
    }
    
    chatInfoDiv.className = 'chat-info';
    chatInfoDiv.textContent = getTranslation('noChatDetected');
  } catch (error) {
    chatInfoDiv.className = 'chat-info';
    chatInfoDiv.textContent = getTranslation('noChatDetected');
  }
}

function updateContentScript() {
  chrome.tabs.query({ url: 'https://vk.com/im*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateKeys' }).catch(() => {});
    });
  });
}

// Refresh chat info when popup opens
window.addEventListener('focus', () => {
  getCurrentChatInfo();
});
