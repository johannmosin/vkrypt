// VKrypt Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const keyStatusEl = document.getElementById('key-status');
  const chatStatusEl = document.getElementById('chat-status');
  const generateKeysBtn = document.getElementById('generate-keys-btn');
  const keyExchangeBtn = document.getElementById('key-exchange-btn');
  const groupSection = document.getElementById('group-section');
  const groupMembersEl = document.getElementById('group-members');
  
  // Load settings
  const settings = await browser.storage.local.get(['autoEncrypt', 'showMarkers']);
  document.getElementById('auto-encrypt').checked = settings.autoEncrypt !== false;
  document.getElementById('show-markers').checked = settings.showMarkers !== false;
  
  // Save settings on change
  document.getElementById('auto-encrypt').addEventListener('change', (e) => {
    browser.storage.local.set({ autoEncrypt: e.target.checked });
  });
  
  document.getElementById('show-markers').addEventListener('change', (e) => {
    browser.storage.local.set({ showMarkers: e.target.checked });
  });
  
  // Generate keys button
  generateKeysBtn.addEventListener('click', async () => {
    generateKeysBtn.disabled = true;
    generateKeysBtn.textContent = '⏳ Generating...';
    
    const response = await browser.runtime.sendMessage({ action: 'generateKeyPair' });
    
    if (response.success) {
      keyStatusEl.innerHTML = `
        <div class="vkrypt-status-active">
          <strong>✅ Keys Generated</strong>
          <p style="font-size: 12px; margin-top: 4px;">Your key pair is ready. Share your public key with contacts.</p>
        </div>
      `;
      keyStatusEl.className = 'vkrypt-status-card active';
      generateKeysBtn.style.display = 'none';
      updateChatStatus();
    } else {
      keyStatusEl.innerHTML = `
        <div class="vkrypt-status-error">
          <strong>❌ Generation Failed</strong>
          <p style="font-size: 12px; margin-top: 4px; color: var(--vk-error);">${response.error}</p>
        </div>
      `;
      keyStatusEl.className = 'vkrypt-status-card error';
      generateKeysBtn.disabled = false;
      generateKeysBtn.textContent = '🔑 Generate Key Pair';
    }
  });
  
  // Key exchange button
  keyExchangeBtn.addEventListener('click', () => {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'openKeyExchange' });
        window.close();
      }
    });
  });
  
  // Add member button
  document.getElementById('add-member-btn').addEventListener('click', () => {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'openKeyExchange' });
        window.close();
      }
    });
  });
  
  // Initial status check
  await checkKeyStatus();
  await updateChatStatus();
});

// Check key generation status
async function checkKeyStatus() {
  const keyStatusEl = document.getElementById('key-status');
  const generateKeysBtn = document.getElementById('generate-keys-btn');
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'getPublicKey' });
    
    if (response.success) {
      // Truncate key for display
      const shortKey = response.publicKey.substring(0, 30) + '...';
      keyStatusEl.innerHTML = `
        <div>
          <strong>✅ Keys Ready</strong>
          <p style="font-size: 11px; margin-top: 4px; word-break: break-all; color: var(--vk-text-secondary);">
            Public Key: ${shortKey}
          </p>
        </div>
      `;
      keyStatusEl.className = 'vkrypt-status-card active';
      generateKeysBtn.style.display = 'none';
    } else {
      keyStatusEl.innerHTML = `
        <div>
          <strong>⚠️ No Keys</strong>
          <p style="font-size: 12px; margin-top: 4px;">Generate a key pair to start encrypting messages.</p>
        </div>
      `;
      keyStatusEl.className = 'vkrypt-status-card inactive';
      generateKeysBtn.style.display = 'block';
    }
  } catch (error) {
    keyStatusEl.innerHTML = `
      <div>
        <strong>❌ Error</strong>
        <p style="font-size: 12px; margin-top: 4px; color: var(--vk-error);">${error.message}</p>
      </div>
    `;
    keyStatusEl.className = 'vkrypt-status-card error';
    generateKeysBtn.style.display = 'block';
  }
}

// Update chat status
async function updateChatStatus() {
  const chatStatusEl = document.getElementById('chat-status');
  const keyExchangeBtn = document.getElementById('key-exchange-btn');
  const groupSection = document.getElementById('group-section');
  
  try {
    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].url.includes('vk.com')) {
      chatStatusEl.innerHTML = `
        <div>
          <strong>ℹ️ Not on VK</strong>
          <p style="font-size: 12px; margin-top: 4px;">Open VK Messages to see encryption status.</p>
        </div>
      `;
      chatStatusEl.className = 'vkrypt-status-card';
      keyExchangeBtn.style.display = 'none';
      groupSection.style.display = 'none';
      return;
    }
    
    // Get status from content script
    const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getStatus' });
    
    if (response && response.contactId) {
      const isGroup = response.contactId.startsWith('-');
      
      if (isGroup) {
        groupSection.style.display = 'block';
        await loadGroupMembers(response.contactId);
      } else {
        groupSection.style.display = 'none';
      }
      
      if (response.encryptionEnabled) {
        chatStatusEl.innerHTML = `
          <div>
            <strong>🔒 Encryption Active</strong>
            <p style="font-size: 12px; margin-top: 4px;">Messages with this contact are encrypted.</p>
          </div>
        `;
        chatStatusEl.className = 'vkrypt-status-card active';
        keyExchangeBtn.style.display = 'none';
      } else if (response.hasPeerKey) {
        chatStatusEl.innerHTML = `
          <div>
            <strong>⚠️ Key Mismatch</strong>
            <p style="font-size: 12px; margin-top: 4px;">You have their key, but they may not have yours.</p>
          </div>
        `;
        chatStatusEl.className = 'vkrypt-status-card inactive';
        keyExchangeBtn.style.display = 'block';
        keyExchangeBtn.textContent = '🔄 Share Your Key';
      } else {
        chatStatusEl.innerHTML = `
          <div>
            <strong>🔓 Not Encrypted</strong>
            <p style="font-size: 12px; margin-top: 4px;">Exchange keys to enable encryption.</p>
          </div>
        `;
        chatStatusEl.className = 'vkrypt-status-card inactive';
        keyExchangeBtn.style.display = 'block';
        keyExchangeBtn.textContent = '🔄 Exchange Keys';
      }
    } else {
      chatStatusEl.innerHTML = `
        <div>
          <strong>ℹ️ No Chat Selected</strong>
          <p style="font-size: 12px; margin-top: 4px;">Open a conversation to see encryption status.</p>
        </div>
      `;
      chatStatusEl.className = 'vkrypt-status-card';
      keyExchangeBtn.style.display = 'none';
      groupSection.style.display = 'none';
    }
  } catch (error) {
    chatStatusEl.innerHTML = `
      <div>
        <strong>ℹ️ Checking...</strong>
        <p style="font-size: 12px; margin-top: 4px;">Navigate to a VK chat.</p>
      </div>
    `;
    chatStatusEl.className = 'vkrypt-status-card';
    keyExchangeBtn.style.display = 'none';
    groupSection.style.display = 'none';
  }
}

// Load group members
async function loadGroupMembers(groupId) {
  const groupMembersEl = document.getElementById('group-members');
  
  try {
    const stored = await browser.storage.local.get('peerKeys');
    const peerKeys = stored.peerKeys || {};
    
    // For groups, we'd need a separate group membership list
    // This is a simplified version
    const members = Object.entries(peerKeys).filter(([id]) => id !== groupId);
    
    if (members.length === 0) {
      groupMembersEl.innerHTML = '<p class="vkrypt-hint">No member keys added yet.</p>';
      return;
    }
    
    groupMembersEl.innerHTML = members.map(([memberId, publicKey]) => `
      <div class="vkrypt-group-member">
        <span class="member-name">User ${memberId}</span>
        <div class="member-actions">
          <button class="remove-btn" data-member="${memberId}" title="Remove key">&times;</button>
        </div>
      </div>
    `).join('');
    
    // Add remove listeners
    groupMembersEl.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const memberId = e.target.dataset.member;
        await removeMemberKey(memberId);
      });
    });
  } catch (error) {
    groupMembersEl.innerHTML = '<p class="vkrypt-hint">Error loading members.</p>';
  }
}

// Remove member key
async function removeMemberKey(memberId) {
  try {
    const stored = await browser.storage.local.get('peerKeys');
    const peerKeys = stored.peerKeys || {};
    delete peerKeys[memberId];
    await browser.storage.local.set({ peerKeys });
    
    // Reload list
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const match = tabs[0].url.match(/\/im\?sel=(-?\d+)/);
      if (match) {
        loadGroupMembers(match[1]);
      }
    }
  } catch (error) {
    console.error('VKrypt: Failed to remove member:', error);
  }
}

// Refresh status when popup opens
window.addEventListener('focus', () => {
  checkKeyStatus();
  updateChatStatus();
});
