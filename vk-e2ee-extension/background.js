/**
 * VK E2EE - Background Service Worker
 * Handles storage and messaging between popup and content scripts
 */

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  currentKey: null,
  contactKeys: {},
  keyId: null
};

/**
 * Get settings from storage
 * @returns {Promise<object>}
 */
async function getSettings() {
  try {
    const result = await browser.storage.local.get('vkE2EESettings');
    return {
      success: true,
      settings: result.vkE2EESettings || DEFAULT_SETTINGS
    };
  } catch (error) {
    console.error('[VK E2EE] Error getting settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save settings to storage
 * @param {object} settings 
 * @returns {Promise<object>}
 */
async function saveSettings(settings) {
  try {
    await browser.storage.local.set({ vkE2EESettings: settings });
    
    // Notify all tabs of settings change
    const tabs = await browser.tabs.query({});
    tabs.forEach(tab => {
      if (tab.url && tab.url.includes('vk.com')) {
        browser.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          settings: settings
        }).catch(() => {}); // Ignore errors for closed tabs
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('[VK E2EE] Error saving settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Export keys for backup
 * @returns {Promise<object>}
 */
async function exportKeys() {
  const settings = await getSettings();
  if (settings.success) {
    return {
      success: true,
      data: {
        currentKey: settings.settings.currentKey,
        keyId: settings.settings.keyId,
        contactKeys: settings.settings.contactKeys,
        exportDate: new Date().toISOString()
      }
    };
  }
  return settings;
}

/**
 * Import keys from backup
 * @param {object} keyData 
 * @returns {Promise<object>}
 */
async function importKeys(keyData) {
  try {
    const currentSettings = await getSettings();
    const newSettings = currentSettings.success ? currentSettings.settings : DEFAULT_SETTINGS;
    
    if (keyData.currentKey) {
      newSettings.currentKey = keyData.currentKey;
    }
    if (keyData.keyId) {
      newSettings.keyId = keyData.keyId;
    }
    if (keyData.contactKeys) {
      newSettings.contactKeys = { ...newSettings.contactKeys, ...keyData.contactKeys };
    }
    
    return await saveSettings(newSettings);
  } catch (error) {
    console.error('[VK E2EE] Error importing keys:', error);
    return { success: false, error: error.message };
  }
}

// Message listener
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'getSettings':
          sendResponse(await getSettings());
          break;
          
        case 'saveSettings':
          sendResponse(await saveSettings(message.settings));
          break;
          
        case 'exportKeys':
          sendResponse(await exportKeys());
          break;
          
        case 'importKeys':
          sendResponse(await importKeys(message.keyData));
          break;
          
        case 'toggleEncryption':
          const settings = await getSettings();
          if (settings.success) {
            settings.settings.enabled = !settings.settings.enabled;
            sendResponse(await saveSettings(settings.settings));
          } else {
            sendResponse(settings);
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[VK E2EE] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Initialize on install
browser.runtime.onInstalled.addListener((details) => {
  console.log('[VK E2EE] Extension installed:', details.reason);
  
  // Initialize storage with defaults
  getSettings().then(result => {
    if (!result.success || !result.settings) {
      saveSettings(DEFAULT_SETTINGS);
    }
  });
});

console.log('[VK E2EE] Background service worker initialized');
