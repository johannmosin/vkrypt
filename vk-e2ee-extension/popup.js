/**
 * VK E2EE - Popup Script
 * Handles UI interactions in the extension popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const encryptionStatus = document.getElementById('encryptionStatus');
  const toggleEncryptionBtn = document.getElementById('toggleEncryption');
  const keyImport = document.getElementById('keyImport');
  const importKeyBtn = document.getElementById('importKey');
  const exportKeysBtn = document.getElementById('exportKeys');
  const generateKeyBtn = document.getElementById('generateKey');
  const contactName = document.getElementById('contactName');
  const contactKey = document.getElementById('contactKey');
  const addContactKeyBtn = document.getElementById('addContactKey');
  const contactList = document.getElementById('contactList');

  // Load current settings
  await loadSettings();

  /**
   * Load and display current settings
   */
  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getSettings' });
      
      if (response && response.success) {
        const settings = response.settings;
        
        // Update status indicator
        updateStatusIndicator(settings.enabled, !!settings.currentKey);
        
        // Update toggle button text
        toggleEncryptionBtn.textContent = settings.enabled ? 'Disable Encryption' : 'Enable Encryption';
        
        // Display current key ID if available
        if (settings.keyId) {
          keyImport.placeholder = `Current key ID: ${settings.keyId}`;
        }
        
        // Load contact keys
        renderContactList(settings.contactKeys || {});
      }
    } catch (error) {
      console.error('[VK E2EE] Error loading settings:', error);
      encryptionStatus.innerHTML = '<span class="status-icon">❌</span><span class="status-text">Error loading settings</span>';
    }
  }

  /**
   * Update the status indicator
   * @param {boolean} enabled 
   * @param {boolean} hasKey 
   */
  function updateStatusIndicator(enabled, hasKey) {
    if (!enabled) {
      encryptionStatus.className = 'status-indicator status-warning';
      encryptionStatus.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">Encryption Disabled</span>';
    } else if (!hasKey) {
      encryptionStatus.className = 'status-indicator status-error';
      encryptionStatus.innerHTML = '<span class="status-icon">🔓</span><span class="status-text">No Key Configured</span>';
    } else {
      encryptionStatus.className = 'status-indicator status-success';
      encryptionStatus.innerHTML = '<span class="status-icon">🔒</span><span class="status-text">Encryption Active</span>';
    }
  }

  /**
   * Toggle encryption on/off
   */
  toggleEncryptionBtn.addEventListener('click', async () => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'toggleEncryption' });
      
      if (response && response.success) {
        await loadSettings();
      } else {
        alert('Failed to toggle encryption: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[VK E2EE] Error toggling encryption:', error);
      alert('Error toggling encryption');
    }
  });

  /**
   * Import a key
   */
  importKeyBtn.addEventListener('click', async () => {
    const keyValue = keyImport.value.trim();
    
    if (!keyValue) {
      alert('Please enter a key to import');
      return;
    }
    
    try {
      // Validate key format (should be base64)
      atob(keyValue);
      
      const currentResponse = await browser.runtime.sendMessage({ action: 'getSettings' });
      const settings = currentResponse.success ? currentResponse.settings : {};
      
      settings.currentKey = keyValue;
      settings.enabled = true;
      
      const saveResponse = await browser.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: settings 
      });
      
      if (saveResponse && saveResponse.success) {
        alert('Key imported successfully! Encryption enabled.');
        keyImport.value = '';
        await loadSettings();
      } else {
        alert('Failed to save key: ' + (saveResponse?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[VK E2EE] Error importing key:', error);
      alert('Invalid key format. Please ensure it\'s a valid base64 string.');
    }
  });

  /**
   * Export keys
   */
  exportKeysBtn.addEventListener('click', async () => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'exportKeys' });
      
      if (response && response.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `vk-e2ee-keys-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        alert('Keys exported successfully! Store this file securely and never share it.');
      } else {
        alert('Failed to export keys: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[VK E2EE] Error exporting keys:', error);
      alert('Error exporting keys');
    }
  });

  /**
   * Generate a new key
   */
  generateKeyBtn.addEventListener('click', async () => {
    if (!confirm('Generate a new encryption key? Make sure to backup your current key first if you have one!')) {
      return;
    }
    
    try {
      // Use the crypto module to generate a key
      const keyPair = await VK_E2EE_CRYPTO.generateKeyPair();
      
      const currentResponse = await browser.runtime.sendMessage({ action: 'getSettings' });
      const settings = currentResponse.success ? currentResponse.settings : {};
      
      settings.currentKey = keyPair.privateKey;
      settings.keyId = keyPair.keyId;
      settings.enabled = true;
      
      const saveResponse = await browser.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: settings 
      });
      
      if (saveResponse && saveResponse.success) {
        alert(`New key generated!\n\nKey ID: ${keyPair.keyId}\n\nIMPORTANT: Share your public key with contacts through a secure channel (NOT through VK).`);
        await loadSettings();
      } else {
        alert('Failed to save key: ' + (saveResponse?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[VK E2EE] Error generating key:', error);
      alert('Error generating key');
    }
  });

  /**
   * Add a contact key
   */
  addContactKeyBtn.addEventListener('click', async () => {
    const name = contactName.value.trim();
    const key = contactKey.value.trim();
    
    if (!name || !key) {
      alert('Please enter both contact name and key');
      return;
    }
    
    try {
      // Validate key format
      atob(key);
      
      const currentResponse = await browser.runtime.sendMessage({ action: 'getSettings' });
      const settings = currentResponse.success ? currentResponse.settings : {};
      
      if (!settings.contactKeys) {
        settings.contactKeys = {};
      }
      
      settings.contactKeys[name] = key;
      
      const saveResponse = await browser.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: settings 
      });
      
      if (saveResponse && saveResponse.success) {
        contactName.value = '';
        contactKey.value = '';
        await loadSettings();
        alert(`Contact key added for ${name}`);
      } else {
        alert('Failed to add contact key: ' + (saveResponse?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[VK E2EE] Error adding contact key:', error);
      alert('Invalid key format. Please ensure it\'s a valid base64 string.');
    }
  });

  /**
   * Render the contact list
   * @param {object} contacts 
   */
  function renderContactList(contacts) {
    contactList.innerHTML = '';
    
    const contactNames = Object.keys(contacts);
    
    if (contactNames.length === 0) {
      contactList.innerHTML = '<p class="help-text">No contact keys added yet.</p>';
      return;
    }
    
    const ul = document.createElement('ul');
    ul.className = 'contact-list-items';
    
    contactNames.forEach(name => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="contact-name">${escapeHtml(name)}</span>
        <button class="btn btn-small btn-danger" data-contact="${escapeHtml(name)}">Remove</button>
      `;
      ul.appendChild(li);
    });
    
    contactList.appendChild(ul);
    
    // Add event listeners to remove buttons
    ul.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const contactName = btn.dataset.contact;
        await removeContactKey(contactName);
      });
    });
  }

  /**
   * Remove a contact key
   * @param {string} name 
   */
  async function removeContactKey(name) {
    if (!confirm(`Remove key for ${name}?`)) {
      return;
    }
    
    try {
      const currentResponse = await browser.runtime.sendMessage({ action: 'getSettings' });
      const settings = currentResponse.success ? currentResponse.settings : {};
      
      if (settings.contactKeys) {
        delete settings.contactKeys[name];
        
        const saveResponse = await browser.runtime.sendMessage({ 
          action: 'saveSettings', 
          settings: settings 
        });
        
        if (saveResponse && saveResponse.success) {
          await loadSettings();
        } else {
          alert('Failed to remove contact key');
        }
      }
    } catch (error) {
      console.error('[VK E2EE] Error removing contact key:', error);
      alert('Error removing contact key');
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str 
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
