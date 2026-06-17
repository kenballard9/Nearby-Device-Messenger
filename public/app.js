/* Nearby Device Messenger
   - Location/map features work even when opened as index.html.
   - Messaging requires the Node server at http://localhost:3000 because Socket.IO is served by the server.
*/

document.addEventListener('DOMContentLoaded', () => {
  const locateBtn = document.getElementById('locateBtn');
  const watchBtn = document.getElementById('watchBtn');
  const stopBtn = document.getElementById('stopBtn');
  const registerBtn = document.getElementById('registerBtn');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const profileViewPhoto = document.getElementById('profileViewPhoto');
  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const profilePhotoPreview = document.getElementById('profilePhotoPreview');
  const removePhotoBtn = document.getElementById('removePhotoBtn');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const cancelEditProfileBtn = document.getElementById('cancelEditProfileBtn');
  const sendMessageBtn = document.getElementById('sendMessageBtn');
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const displayNameInput = document.getElementById('displayName');
  const accountEmailInput = document.getElementById('accountEmail');
  const accountPasswordInput = document.getElementById('accountPassword');
  const accountStatus = document.getElementById('accountStatus');
  const authForms = document.getElementById('authForms');
  const profileView = document.getElementById('profileView');
  const profileViewName = document.getElementById('profileViewName');
  const profileViewBio = document.getElementById('profileViewBio');
  const profileViewSkills = document.getElementById('profileViewSkills');
  const profileViewInterests = document.getElementById('profileViewInterests');
  const profileEditor = document.getElementById('profileEditor');
  const profileBio = document.getElementById('profileBio');
  const profileSkills = document.getElementById('profileSkills');
  const profileInterests = document.getElementById('profileInterests');
  const messageText = document.getElementById('messageText');
  const messagesBox = document.getElementById('messages');
  const floatingAssistantQuestion = document.getElementById('floatingAssistantQuestion');
  const floatingAskAssistantBtn = document.getElementById('floatingAskAssistantBtn');
  const floatingAssistantAnswer = document.getElementById('floatingAssistantAnswer');
  const floatingAssistantPlaces = document.getElementById('floatingAssistantPlaces');
  const nearbyCount = document.getElementById('nearbyCount');
  const statusBox = document.getElementById('status');
  const connectionStatus = document.getElementById('connectionStatus');
  const latText = document.getElementById('lat');
  const lngText = document.getElementById('lng');
  const accuracyText = document.getElementById('accuracy');
  const profileModal = document.getElementById('profileModal');
  const profileModalClose = document.getElementById('profileModalClose');
  const profileModalPhoto = document.getElementById('profileModalPhoto');
  const profileModalName = document.getElementById('profileModalName');
  const profileModalBio = document.getElementById('profileModalBio');
  const profileModalSkills = document.getElementById('profileModalSkills');
  const profileModalInterests = document.getElementById('profileModalInterests');
  const profileDirectConversation = document.getElementById('profileDirectConversation');
  const profileDirectMessageText = document.getElementById('profileDirectMessageText');
  const profileDirectMessageSendBtn = document.getElementById('profileDirectMessageSendBtn');
  const profileDirectMessageStatus = document.getElementById('profileDirectMessageStatus');
  const directMessageModal = document.getElementById('directMessageModal');
  const directMessageModalClose = document.getElementById('directMessageModalClose');
  const directMessageSenderPhoto = document.getElementById('directMessageSenderPhoto');
  const directMessageModalTitle = document.getElementById('directMessageModalTitle');
  const directMessageSenderName = document.getElementById('directMessageSenderName');
  const directMessageTextDisplay = document.getElementById('directMessageTextDisplay');
  const directMessageConversation = document.getElementById('directMessageConversation');
  const directMessageReplyText = document.getElementById('directMessageReplyText');
  const directMessageReplySendBtn = document.getElementById('directMessageReplySendBtn');
  const directMessageStatus = document.getElementById('directMessageStatus');
  const requiredElements = [locateBtn, watchBtn, stopBtn, registerBtn, loginBtn, logoutBtn, saveProfileBtn, profileViewPhoto, profilePhotoInput, profilePhotoPreview, removePhotoBtn, editProfileBtn, cancelEditProfileBtn, sendMessageBtn, radiusSlider, radiusValue, displayNameInput, accountEmailInput, accountPasswordInput, accountStatus, authForms, profileView, profileViewName, profileViewBio, profileViewSkills, profileViewInterests, profileEditor, profileBio, profileSkills, profileInterests, messageText, messagesBox, floatingAssistantQuestion, floatingAskAssistantBtn, floatingAssistantAnswer, floatingAssistantPlaces, nearbyCount, statusBox, connectionStatus, latText, lngText, accuracyText, profileModal, profileModalClose, profileModalPhoto, profileModalName, profileModalBio, profileModalSkills, profileModalInterests, profileDirectConversation, profileDirectMessageText, profileDirectMessageSendBtn, profileDirectMessageStatus, directMessageModal, directMessageModalClose, directMessageSenderPhoto, directMessageModalTitle, directMessageSenderName, directMessageTextDisplay, directMessageConversation, directMessageReplyText, directMessageReplySendBtn, directMessageStatus];
  const missingElements = requiredElements.filter(element => !element);
  if (missingElements.length) {
    console.error('One or more expected UI elements are missing. The app will keep loading whatever features are available.', missingElements);
  }


  let marker;
  let accuracyCircle;
  let fiveMileCircle;
  let watchId = null;
  let hasSharedLocation = false;
  let socketIsConnected = false;
  let socket = null;
  let currentLocation = null;
  let placeMarkers = [];
  let coverageRadiusMiles = 5;
  let currentAccount = null;
  let profilePhotoDataUrl = '';
  let activeProfileModalProfile = null;
  let activeDirectConversationProfile = null;
  const directConversationCache = new Map();

  const defaultProfilePhoto = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="%23dbeafe"/><circle cx="60" cy="46" r="22" fill="%232563eb"/><path d="M22 106c8-24 26-36 38-36s30 12 38 36" fill="%232563eb"/></svg>`);

  const map = L.map('map', { zoomControl: true }).setView([39.8283, -98.5795], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);


  function getCoverageRadiusMiles() {
    const value = Number(radiusSlider.value);
    if (!Number.isFinite(value)) return 5;
    return Math.min(50, Math.max(0, value));
  }

  function coverageRadiusMeters() {
    return coverageRadiusMiles * 1609.344;
  }

  function updateRadiusUi() {
    coverageRadiusMiles = getCoverageRadiusMiles();
    radiusValue.textContent = coverageRadiusMiles;

    if (fiveMileCircle) {
      fiveMileCircle.setRadius(coverageRadiusMeters());
    }

    if (socketIsConnected && socket) {
      socket.emit('coverage:update', { radiusMiles: coverageRadiusMiles });
    }

    if (currentLocation && socketIsConnected && socket) {
      socket.emit('location:update', {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        accuracy: currentLocation.accuracy,
        radiusMiles: coverageRadiusMiles
      });
    }
  }

  function setStatus(message) {
    statusBox.textContent = message;
  }

  function setConnectionStatus(_message) {
    // Connection details are intentionally hidden from the UI.
    connectionStatus.textContent = '';
    connectionStatus.classList.add('hidden');
  }

  function setAccountStatus(message) {
    accountStatus.textContent = message;
  }

  function displayOrFallback(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function setProfilePhotoElements(dataUrl) {
    const source = dataUrl || defaultProfilePhoto;
    if (profileViewPhoto) profileViewPhoto.src = source;
    if (profilePhotoPreview) profilePhotoPreview.src = source;
  }

  function populateProfileFields(account) {
    displayNameInput.value = account.displayName || '';
    profileBio.value = account.bio || '';
    profileSkills.value = account.skills || '';
    profileInterests.value = account.interests || '';
    profilePhotoDataUrl = account.profilePhoto || '';
    setProfilePhotoElements(profilePhotoDataUrl);
  }

  function populateProfileView(account) {
    profileViewName.textContent = displayOrFallback(account.displayName, 'Unnamed user');
    profileViewBio.textContent = displayOrFallback(account.bio, 'No bio added.');
    profileViewSkills.textContent = displayOrFallback(account.skills, 'No skills added.');
    profileViewInterests.textContent = displayOrFallback(account.interests, 'No interests added.');
    setProfilePhotoElements(account.profilePhoto || '');
  }

  function showProfileView() {
    authForms.classList.add('hidden');
    profileEditor.classList.add('hidden');
    profileView.classList.remove('hidden');
  }

  function showProfileEditor() {
    if (!currentAccount) return;
    populateProfileFields(currentAccount);
    authForms.classList.add('hidden');
    profileView.classList.add('hidden');
    profileEditor.classList.remove('hidden');
  }


  function updateMessageAuthState() {
    const isLoggedIn = Boolean(currentAccount);
    if (sendMessageBtn) sendMessageBtn.disabled = !isLoggedIn;
    if (messageText) {
      messageText.disabled = !isLoggedIn;
      messageText.placeholder = isLoggedIn
        ? 'Type a nearby message...'
        : 'Log in to post a nearby message...';
    }
  }
  function applyAccountToUi(account) {
    currentAccount = account || null;
    if (currentAccount) {
      populateProfileFields(currentAccount);
      populateProfileView(currentAccount);
      showProfileView();
      setAccountStatus('Logged in.');
      if (socketIsConnected && socket) {
        socket.emit('profile:update', { displayName: currentAccount.displayName, accountId: currentAccount.id });
      }
    } else {
      authForms.classList.remove('hidden');
      profileView.classList.add('hidden');
      profileEditor.classList.add('hidden');
      setAccountStatus('Not logged in. Create an account or log in.');
      if (socketIsConnected && socket) {
        socket.emit('profile:update', { displayName: '', accountId: '' });
      }
    }
    updateMessageAuthState();
    updateDirectMessageProfileButton();
  }

  async function authRequest(url, method, body = {}) {
    if (window.location.protocol === 'file:') {
      throw new Error('Profile login requires the server. Start the app with npm start, then open http://localhost:3000.');
    }

    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Account request failed.');
    return data;
  }

  async function loadCurrentAccount() {
    try {
      if (window.location.protocol === 'file:') {
        applyAccountToUi(null);
        setAccountStatus('Profile login requires http://localhost:3000.');
        return;
      }
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await response.json();
      applyAccountToUi(data.account);
    } catch {
      applyAccountToUi(null);
    }
  }

  async function registerAccount() {
    try {
      const data = await authRequest('/api/auth/register', 'POST', {
        email: accountEmailInput.value.trim(),
        password: accountPasswordInput.value,
        displayName: displayNameInput.value.trim()
      });
      // Creating an account should not sign the user in. Only the Log In button creates a signed-in session.
      applyAccountToUi(null);
      accountEmailInput.value = data.account?.email || accountEmailInput.value.trim();
      displayNameInput.value = data.account?.displayName || displayNameInput.value.trim();
      setAccountStatus(data.message || 'Account Created!');
      setStatus('Account Created!');
    } catch (error) {
      setAccountStatus(error.message);
    }
  }

  async function loginAccount() {
    try {
      const data = await authRequest('/api/auth/login', 'POST', {
        email: accountEmailInput.value.trim(),
        password: accountPasswordInput.value
      });
      accountPasswordInput.value = '';
      applyAccountToUi(data.account);
      setStatus('');
    } catch (error) {
      setAccountStatus(error.message);
    }
  }

  async function saveProfile() {
    try {
      const data = await authRequest('/api/profile', 'PUT', {
        accountId: currentAccount?.id || '',
        displayName: displayNameInput.value.trim(),
        bio: profileBio.value.trim(),
        skills: profileSkills.value.trim(),
        interests: profileInterests.value.trim(),
        profilePhoto: profilePhotoDataUrl
      });
      applyAccountToUi(data.account);
      setStatus('Profile saved.');
    } catch (error) {
      setAccountStatus(error.message);
    }
  }

  async function logoutAccount() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      currentAccount = null;
      accountPasswordInput.value = '';
      applyAccountToUi(null);
      setStatus('Logged out. Log in before posting another nearby message.');
    }
  }

  function handleProfilePhotoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAccountStatus('Choose an image file for the profile picture.');
      return;
    }
    if (file.size > 750 * 1024) {
      setAccountStatus('Profile picture must be smaller than 750 KB.');
      profilePhotoInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      profilePhotoDataUrl = String(reader.result || '');
      setProfilePhotoElements(profilePhotoDataUrl);
      setAccountStatus('Profile picture selected. Click Save Profile to keep it.');
    };
    reader.onerror = () => setAccountStatus('Could not read that image file.');
    reader.readAsDataURL(file);
  }

  function removeProfilePhoto() {
    profilePhotoDataUrl = '';
    if (profilePhotoInput) profilePhotoInput.value = '';
    setProfilePhotoElements('');
    setAccountStatus('Profile picture removed. Click Save Profile to keep this change.');
  }

  function setAssistantAnswer(message) {
    floatingAssistantAnswer.textContent = message;
  }

  function setAssistantButtonsDisabled(disabled) {
    floatingAskAssistantBtn.disabled = disabled;
  }

  function getAssistantQuestion(source) {
    const question = floatingAssistantQuestion.value.trim();
    return question;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clearPlaceMarkers() {
    placeMarkers.forEach(marker => map.removeLayer(marker));
    placeMarkers = [];
  }

  function renderPlaces(places) {
    floatingAssistantPlaces.innerHTML = '';
    clearPlaceMarkers();

    if (!places || places.length === 0) return;

    places.forEach(place => {
      const item = document.createElement('div');
      item.className = 'place-item';
      item.innerHTML = `
        <strong>${escapeHtml(place.name)}</strong>
        <small>${escapeHtml(place.category)} • ${escapeHtml(place.distanceMiles)} miles away${place.address ? ` • ${escapeHtml(place.address)}` : ''}</small>
      `;
      floatingAssistantPlaces.appendChild(item);

      if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
        const marker = L.marker([place.latitude, place.longitude]).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.category)}<br>${escapeHtml(place.distanceMiles)} miles away`);
        placeMarkers.push(marker);
      }
    });
  }

  function compactProfileFromMessage(profile, fallbackName = 'Nearby user') {
    const data = profile || {};
    return {
      id: data.id || data.accountId || '',
      displayName: displayOrFallback(data.displayName || fallbackName, 'Nearby user'),
      bio: displayOrFallback(data.bio, 'No bio added.'),
      skills: displayOrFallback(data.skills, 'No skills added.'),
      interests: displayOrFallback(data.interests, 'No interests added.'),
      profilePhoto: data.profilePhoto || defaultProfilePhoto
    };
  }

  function cacheDirectHistory(targetAccountId, messages) {
    if (!targetAccountId) return;
    directConversationCache.set(targetAccountId, Array.isArray(messages) ? messages : []);
  }

  function renderDirectConversation(container, targetAccountId) {
    if (!container) return;
    const messages = directConversationCache.get(targetAccountId) || [];
    container.innerHTML = '';
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'direct-history-empty';
      empty.textContent = 'No private messages yet.';
      container.appendChild(empty);
      return;
    }
    messages.forEach(message => {
      const row = document.createElement('div');
      const mine = currentAccount && message.fromAccountId === currentAccount.id;
      row.className = `direct-history-row${mine ? ' mine' : ''}`;
      const senderName = mine ? 'You' : (message.from || message.senderProfile?.displayName || 'Nearby user');
      row.innerHTML = `
        <strong>${escapeHtml(senderName)}</strong>
        <div>${escapeHtml(message.text || '')}</div>
        <small>${message.sentAt ? escapeHtml(new Date(message.sentAt).toLocaleString()) : ''}</small>
      `;
      container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
  }

  function requestDirectHistory(targetAccountId) {
    if (socketIsConnected && socket && currentAccount && targetAccountId) {
      socket.emit('direct:history', { targetAccountId });
    }
  }

  function openProfileModal(profile) {
    const data = compactProfileFromMessage(profile);
    activeProfileModalProfile = data;
    profileModalPhoto.src = data.profilePhoto;
    profileModalName.textContent = data.displayName;
    profileModalBio.textContent = data.bio;
    profileModalSkills.textContent = data.skills;
    profileModalInterests.textContent = data.interests;
    if (profileDirectMessageText) profileDirectMessageText.value = '';
    if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = '';
    renderDirectConversation(profileDirectConversation, data.id);
    updateDirectMessageProfileButton();
    profileModal.classList.remove('hidden');
    requestDirectHistory(data.id);
  }

  function closeProfileModal() {
    profileModal.classList.add('hidden');
    activeProfileModalProfile = null;
  }

  function updateDirectMessageProfileButton() {
    if (!profileDirectMessageSendBtn) return;
    const targetId = activeProfileModalProfile?.id || '';
    const isSelf = Boolean(currentAccount && targetId && targetId === currentAccount.id);
    const canMessage = Boolean(currentAccount && targetId && !isSelf);
    profileDirectMessageSendBtn.disabled = !canMessage;
    if (profileDirectMessageText) {
      profileDirectMessageText.disabled = !canMessage;
      profileDirectMessageText.placeholder = currentAccount
        ? (isSelf ? 'You cannot send a private message to yourself.' : 'Type a private message to this user...')
        : 'Log in to send private messages.';
    }
  }

  function sendDirectMessageFromProfileModal() {
    if (!currentAccount) {
      if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = 'Log in before sending a private message.';
      return;
    }
    if (!socketIsConnected || !socket) {
      if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = 'Messaging server is not connected.';
      return;
    }
    const targetAccountId = activeProfileModalProfile?.id;
    if (!targetAccountId) {
      if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = 'Choose a user to message.';
      return;
    }
    const text = (profileDirectMessageText?.value || '').trim();
    if (!text) {
      if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = 'Type a private message first.';
      return;
    }
    socket.emit('direct:send', { targetAccountId, text });
    if (profileDirectMessageStatus) profileDirectMessageStatus.textContent = 'Sending...';
  }

  function openDirectMessageModal(message) {
    const senderProfile = compactProfileFromMessage(message?.conversationWithProfile || message?.senderProfile, message?.from || 'Nearby user');
    activeDirectConversationProfile = senderProfile;
    if (Array.isArray(message?.history)) cacheDirectHistory(senderProfile.id, message.history);
    if (directMessageSenderPhoto) directMessageSenderPhoto.src = senderProfile.profilePhoto;
    if (directMessageModalTitle) directMessageModalTitle.textContent = 'Private Message';
    if (directMessageSenderName) directMessageSenderName.textContent = senderProfile.displayName;
    if (directMessageTextDisplay) directMessageTextDisplay.textContent = message?.text || '';
    renderDirectConversation(directMessageConversation, senderProfile.id);
    if (directMessageReplyText) directMessageReplyText.value = '';
    if (directMessageStatus) directMessageStatus.textContent = '';
    if (directMessageReplySendBtn) directMessageReplySendBtn.disabled = !Boolean(currentAccount && senderProfile.id);
    directMessageModal.classList.remove('hidden');
    requestDirectHistory(senderProfile.id);
  }

  function closeDirectMessageModal() {
    directMessageModal.classList.add('hidden');
    activeDirectConversationProfile = null;
  }

  function sendDirectMessageReply() {
    if (!currentAccount) {
      if (directMessageStatus) directMessageStatus.textContent = 'Log in before replying.';
      return;
    }
    if (!socketIsConnected || !socket) {
      if (directMessageStatus) directMessageStatus.textContent = 'Messaging server is not connected.';
      return;
    }
    const targetAccountId = activeDirectConversationProfile?.id;
    if (!targetAccountId) {
      if (directMessageStatus) directMessageStatus.textContent = 'This message cannot be replied to.';
      return;
    }
    const text = (directMessageReplyText?.value || '').trim();
    if (!text) {
      if (directMessageStatus) directMessageStatus.textContent = 'Type a reply first.';
      return;
    }
    socket.emit('direct:send', { targetAccountId, text });
    if (directMessageStatus) directMessageStatus.textContent = 'Sending reply...';
  }

  function addMessage(title, text, meta = '', senderProfile = null) {
    const profile = compactProfileFromMessage(senderProfile, title.replace(/^From\s+/i, ''));
    const item = document.createElement('div');
    item.className = 'message';

    const avatarButton = document.createElement('button');
    avatarButton.type = 'button';
    avatarButton.className = 'message-avatar-button';
    avatarButton.title = `View ${profile.displayName}'s profile`;
    avatarButton.setAttribute('aria-label', `View ${profile.displayName}'s profile`);

    const avatar = document.createElement('img');
    avatar.src = profile.profilePhoto;
    avatar.alt = `${profile.displayName} profile picture`;
    avatarButton.appendChild(avatar);
    avatarButton.addEventListener('click', () => openProfileModal(profile));

    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <div>${escapeHtml(text)}</div>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    `;

    item.appendChild(avatarButton);
    item.appendChild(body);
    messagesBox.prepend(item);
  }

  function initializeSocket() {
    if (typeof io !== 'function') {
      socket = null;
      socketIsConnected = false;
      setConnectionStatus('not available');
      setStatus('Map buttons will work, but messaging requires the server. Install Node.js, run npm install, run npm start, then open http://localhost:3000.');
      return;
    }

    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socketIsConnected = true;
      setConnectionStatus(`connected as ${socket.id}`);
      syncSocketStateAfterConnect();
    });

    socket.on('disconnect', () => {
      socketIsConnected = false;
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', err => {
      socketIsConnected = false;
      setConnectionStatus(`failed - ${err.message}`);
    });

    socket.on('server:ready', info => {
      setConnectionStatus(`connected, default server radius ${info.defaultRadiusMiles || info.radiusMiles || 5} miles`);
      updateRadiusUi();
    });

    socket.on('location:accepted', payload => {
      nearbyCount.textContent = payload.nearbyUsers.length;
    });


    socket.on('location:cleared', () => {
      nearbyCount.textContent = '0';
    });

    socket.on('nearby:update', users => {
      nearbyCount.textContent = users.length;
    });

    socket.on('message:received', message => {
      addMessage(`From ${message.from}`, message.text, `About ${message.distanceMiles} miles away • ${new Date(message.sentAt).toLocaleTimeString()}`, message.senderProfile);
    });

    socket.on('message:sent', message => {
      addMessage('Message sent', message.text, `Delivered to ${message.recipientCount} nearby user(s).`, message.senderProfile);
      if (message.recipientCount === 0) {
        setStatus(`Message sent, but no connected users within ${coverageRadiusMiles} miles had shared their location.`);
      }
    });

    socket.on('direct:history', payload => {
      cacheDirectHistory(payload.targetAccountId, payload.messages);
      if (activeProfileModalProfile?.id === payload.targetAccountId) {
        renderDirectConversation(profileDirectConversation, payload.targetAccountId);
      }
      if (activeDirectConversationProfile?.id === payload.targetAccountId) {
        renderDirectConversation(directMessageConversation, payload.targetAccountId);
      }
    });

    socket.on('direct:received', message => {
      const conversationId = message.conversationWithAccountId || message.senderProfile?.id;
      if (conversationId && Array.isArray(message.history)) cacheDirectHistory(conversationId, message.history);
      openDirectMessageModal(message);
    });

    socket.on('direct:sent', message => {
      const conversationId = message.conversationWithAccountId || message.targetAccountId;
      if (conversationId && Array.isArray(message.history)) cacheDirectHistory(conversationId, message.history);
      if (profileDirectMessageStatus && activeProfileModalProfile?.id === conversationId) {
        profileDirectMessageStatus.textContent = `Private message sent to ${message.to}.`;
        if (profileDirectMessageText) profileDirectMessageText.value = '';
        renderDirectConversation(profileDirectConversation, conversationId);
      }
      if (directMessageStatus && activeDirectConversationProfile?.id === conversationId) {
        directMessageStatus.textContent = `Reply sent to ${message.to}.`;
        if (directMessageReplyText) directMessageReplyText.value = '';
        renderDirectConversation(directMessageConversation, conversationId);
      }
      setStatus(`Private message sent to ${message.to}.`);
    });

    socket.on('direct:error', message => {
      if (profileModal && !profileModal.classList.contains('hidden') && profileDirectMessageStatus) profileDirectMessageStatus.textContent = message;
      if (directMessageModal && !directMessageModal.classList.contains('hidden') && directMessageStatus) directMessageStatus.textContent = message;
      setStatus(message);
    });

    socket.on('auth:state', _state => {
      setConnectionStatus('');
    });

    socket.on('message:error', message => setStatus(message));
  }

  function updateMap(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy);
    const userLocation = [latitude, longitude];

    hasSharedLocation = true;
    currentLocation = { latitude, longitude, accuracy };

    latText.textContent = latitude.toFixed(6);
    lngText.textContent = longitude.toFixed(6);
    accuracyText.textContent = `${accuracy} meters`;

    if (socketIsConnected && socket) {
      socket.emit('location:update', { latitude, longitude, accuracy, radiusMiles: coverageRadiusMiles });
    }

    if (!marker) marker = L.marker(userLocation).addTo(map);
    else marker.setLatLng(userLocation);

    marker.bindPopup(`You are within about ${accuracy} meters of this point.`).openPopup();

    if (!accuracyCircle) accuracyCircle = L.circle(userLocation, { radius: accuracy }).addTo(map);
    else {
      accuracyCircle.setLatLng(userLocation);
      accuracyCircle.setRadius(accuracy);
    }

    if (!fiveMileCircle) {
      fiveMileCircle = L.circle(userLocation, {
        radius: coverageRadiusMeters(),
        fillOpacity: 0.04,
        interactive: false
      }).addTo(map);
    } else {
      fiveMileCircle.setLatLng(userLocation);
      fiveMileCircle.setRadius(coverageRadiusMeters());
    }

    map.setView(userLocation, 13);
    setStatus(socketIsConnected
      ? 'Location shared. Both browsers/devices must do this before messages can be delivered.'
      : 'Location found. Messaging is offline until the app is opened through http://localhost:3000.');
  }

  function handleLocationError(error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        setStatus('Location permission was denied. Allow location access in browser settings and try again.');
        break;
      case error.POSITION_UNAVAILABLE:
        setStatus('Location information is unavailable on this device or network.');
        break;
      case error.TIMEOUT:
        setStatus('The location request timed out. Try again.');
        break;
      default:
        setStatus('An unknown location error occurred.');
    }
  }

  function getLocationOnce() {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported by this browser.');
      return;
    }
    setStatus('Requesting device location...');
    navigator.geolocation.getCurrentPosition(updateMap, handleLocationError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported by this browser.');
      return;
    }
    setStatus('Tracking movement and updating nearby message radius...');
    watchBtn.disabled = true;
    stopBtn.disabled = false;
    watchId = navigator.geolocation.watchPosition(updateMap, handleLocationError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  }

  function clearMapLocationLayers() {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    if (accuracyCircle) {
      map.removeLayer(accuracyCircle);
      accuracyCircle = null;
    }
    if (fiveMileCircle) {
      map.removeLayer(fiveMileCircle);
      fiveMileCircle = null;
    }
  }

  function stopTracking() {
    const hadActiveWatch = watchId !== null;
    const hadSharedLocation = hasSharedLocation || currentLocation !== null;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    hasSharedLocation = false;
    currentLocation = null;
    latText.textContent = '—';
    lngText.textContent = '—';
    accuracyText.textContent = '—';
    nearbyCount.textContent = '0';
    clearMapLocationLayers();
    clearPlaceMarkers();

    if (socketIsConnected && socket) {
      socket.emit('location:clear');
    }

    watchBtn.disabled = false;
    stopBtn.disabled = false;

    if (hadActiveWatch || hadSharedLocation) {
      setStatus('Tracking stopped. Your location is no longer being shared.');
      setAssistantAnswer('Share your location again before asking about nearby places.');
    } else {
      setStatus('Tracking is not active, and no location is currently being shared.');
    }
  }


  function reconnectSocketWithCurrentAuth() {
    if (!socket) return;
    try {
      socket.disconnect();
      socket.connect();
    } catch (error) {
      setConnectionStatus(`reconnect failed - ${error.message}`);
    }
  }

  function syncSocketStateAfterConnect() {
    if (!socketIsConnected || !socket) return;
    if (currentAccount) {
      socket.emit('profile:update', { displayName: currentAccount.displayName, accountId: currentAccount.id });
    }
    socket.emit('coverage:update', { radiusMiles: coverageRadiusMiles });
    if (currentLocation) {
      socket.emit('location:update', {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        accuracy: currentLocation.accuracy || 0,
        radiusMiles: coverageRadiusMiles
      });
    }
  }


  async function askAssistant(source = 'sidebar') {
    const question = getAssistantQuestion(source);
    if (!question) {
      setAssistantAnswer('Ask a nearby-places question first.');
      return;
    }
    if (!currentLocation) {
      setAssistantAnswer('Share your location before asking about nearby places.');
      return;
    }
    if (window.location.protocol === 'file:') {
      setAssistantAnswer('The nearby assistant needs the local server. Run npm start and open http://localhost:3000.');
      return;
    }

    setAssistantButtonsDisabled(true);
    setAssistantAnswer('Looking up nearby places and preparing an answer...');
    floatingAssistantPlaces.innerHTML = '';
    clearPlaceMarkers();

    try {
      const response = await fetch('/api/assistant/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radiusMiles: coverageRadiusMiles
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Assistant request failed.');

      setAssistantAnswer(data.aiEnabled
        ? data.answer
        : `${data.answer}\n\nNote: OpenAI is not enabled yet, so this is the built-in fallback answer. Set OPENAI_API_KEY to enable AI-written responses.`);
      renderPlaces(data.places || []);
    } catch (error) {
      setAssistantAnswer(error.message || 'The assistant could not answer right now.');
    } finally {
      setAssistantButtonsDisabled(false);
    }
  }

  function bindClick(element, handler) {
    if (element) element.addEventListener('click', handler);
  }

  bindClick(registerBtn, registerAccount);
  bindClick(loginBtn, loginAccount);
  bindClick(saveProfileBtn, saveProfile);
  bindClick(removePhotoBtn, removeProfilePhoto);
  if (profilePhotoInput) profilePhotoInput.addEventListener('change', handleProfilePhotoSelected);
  bindClick(editProfileBtn, showProfileEditor);
  bindClick(cancelEditProfileBtn, () => applyAccountToUi(currentAccount));
  bindClick(logoutBtn, logoutAccount);
  bindClick(profileModalClose, closeProfileModal);
  bindClick(profileDirectMessageSendBtn, sendDirectMessageFromProfileModal);
  bindClick(directMessageModalClose, closeDirectMessageModal);
  bindClick(directMessageReplySendBtn, sendDirectMessageReply);
  if (profileModal) {
    profileModal.addEventListener('click', event => {
      if (event.target === profileModal) closeProfileModal();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && profileModal && !profileModal.classList.contains('hidden')) {
      closeProfileModal();
    }
  });

  bindClick(sendMessageBtn, () => {
    if (!currentAccount) return setStatus('Log in before posting a nearby message.');
    const text = messageText.value.trim();
    if (!text) return setStatus('Type a message before sending.');
    if (!socketIsConnected || !socket) return setStatus('Messaging server is not connected. Run npm start and open http://localhost:3000.');
    if (!hasSharedLocation) return setStatus('Share your location before sending a nearby message.');
    socket.emit('message:send', { text });
    messageText.value = '';
  });

  bindClick(floatingAskAssistantBtn, () => askAssistant('floating'));
  if (floatingAssistantQuestion) floatingAssistantQuestion.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      askAssistant('floating');
    }
  });
  if (radiusSlider) radiusSlider.addEventListener('input', updateRadiusUi);
  bindClick(locateBtn, getLocationOnce);
  bindClick(watchBtn, startTracking);
  bindClick(stopBtn, stopTracking);

  if (window.location.protocol === 'file:') {
    setStatus('You opened index.html directly. Location buttons still work, but messaging requires npm start and http://localhost:3000.');
  }

  updateRadiusUi();
  updateMessageAuthState();
  setProfilePhotoElements('');
  setAssistantAnswer('AI assistant loaded. Share your location first, then ask about nearby places.');
  loadCurrentAccount();
  initializeSocket();
});
