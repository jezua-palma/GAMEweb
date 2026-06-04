/* ============================================
   SOCIAL - Multiplayer friends/chat/party API
   ============================================ */

const Social = (() => {
    const TOKEN_KEY = 'shadow_depths_server_token';
    const POLL_MS = 2500;

    const state = {
        token: '',
        me: null,
        ready: false,
        friends: [],
        requestsIncoming: [],
        requestsOutgoing: [],
        party: null,
        partyInvites: [],
        partyLive: null,
        selectedFriend: '',
        chats: {}, // { usernameLower: { lastId, messages } }
        pollHandle: null,
        locks: {
            addFriend: false,
            sendChat: false,
            createParty: false,
            leaveParty: false,
        },
    };

    const ui = {
        screen: null,
        status: null,
        notice: null,
        friendInput: null,
        addFriendBtn: null,
        requestsList: null,
        friendsList: null,
        createPartyBtn: null,
        leavePartyBtn: null,
        partyMembers: null,
        partyInvites: null,
        chatTitle: null,
        chatHint: null,
        chatMessages: null,
        chatInput: null,
        chatSendBtn: null,
    };

    function isObject(value) {
        return value && typeof value === 'object';
    }

    function setStatus(text, type = 'neutral') {
        if (!ui.status) return;
        ui.status.textContent = text;
        if (type === 'ok') {
            ui.status.style.color = '#86efac';
            ui.status.style.borderColor = 'rgba(74, 222, 128, 0.45)';
            ui.status.style.background = 'rgba(21, 128, 61, 0.2)';
        } else if (type === 'warn') {
            ui.status.style.color = '#fdba74';
            ui.status.style.borderColor = 'rgba(251, 146, 60, 0.45)';
            ui.status.style.background = 'rgba(154, 52, 18, 0.2)';
        } else if (type === 'bad') {
            ui.status.style.color = '#fca5a5';
            ui.status.style.borderColor = 'rgba(248, 113, 113, 0.45)';
            ui.status.style.background = 'rgba(153, 27, 27, 0.2)';
        } else {
            ui.status.style.color = '#67e8f9';
            ui.status.style.borderColor = 'rgba(103, 232, 249, 0.35)';
            ui.status.style.background = 'rgba(6, 78, 99, 0.22)';
        }
    }

    function setNotice(text, type = 'neutral') {
        if (!ui.notice) return;
        ui.notice.textContent = text || '';
        if (!text) {
            ui.notice.style.color = '#cbd5e1';
            return;
        }
        if (type === 'ok') ui.notice.style.color = '#86efac';
        else if (type === 'warn') ui.notice.style.color = '#fdba74';
        else if (type === 'bad') ui.notice.style.color = '#fca5a5';
        else ui.notice.style.color = '#cbd5e1';
    }

    function persistToken(token) {
        state.token = token || '';
        try {
            if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
            else localStorage.removeItem(TOKEN_KEY);
        } catch (_err) {
            // Ignore storage restrictions.
        }
    }

    async function apiRaw(path, method = 'GET', body = null, withAuth = true) {
        const headers = { 'Content-Type': 'application/json' };
        if (withAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
        const options = { method, headers };
        if (body !== null) options.body = JSON.stringify(body);

        try {
            const response = await fetch(path, options);
            let data = null;
            try {
                data = await response.json();
            } catch (_err) {
                data = { success: false, error: 'Invalid server response' };
            }
            if (response.status === 401 && withAuth) {
                state.ready = false;
                state.me = null;
                persistToken('');
            }
            return { ok: response.ok, status: response.status, data };
        } catch (_err) {
            return { ok: false, status: 0, data: { success: false, error: 'Network unavailable' } };
        }
    }

    async function api(path, method = 'GET', body = null) {
        if (!state.token) {
            return { ok: false, status: 401, data: { success: false, error: 'Not authenticated' } };
        }
        return apiRaw(path, method, body, true);
    }

    function isOnlineReady() {
        return !!state.ready && !!state.me && !!state.token;
    }

    async function restoreNetworkSession() {
        if (!state.token) return false;
        const res = await api('/api/social/me', 'GET');
        if (!res.ok || !isObject(res.data) || !res.data.success) {
            state.ready = false;
            state.me = null;
            persistToken('');
            setStatus('Offline', 'bad');
            updateActionStates();
            return false;
        }
        state.me = res.data.user || null;
        state.ready = true;
        setStatus(`Online: ${state.me?.username || 'Player'}`, 'ok');
        updateActionStates();
        return true;
    }

    async function bootstrapNetworkSession(username, password, mode = 'login') {
        username = (username || '').trim();
        if (!username || !password) {
            setNotice('Enter valid credentials to connect multiplayer.', 'warn');
            return { success: false, error: 'Missing credentials' };
        }

        let login = await apiRaw('/api/login', 'POST', { username, password }, false);
        if (!login.ok && login.status === 404) {
            const register = await apiRaw('/api/register', 'POST', { username, password }, false);
            if (!register.ok && register.status !== 409) {
                const err = register.data?.error || 'Could not create multiplayer account';
                setStatus('Offline', 'warn');
                setNotice(err, 'warn');
                updateActionStates();
                return { success: false, error: err };
            }
            login = await apiRaw('/api/login', 'POST', { username, password }, false);
        }

        if (!login.ok || !isObject(login.data) || !login.data.success || !login.data.token) {
            const err = login.data?.error || 'Multiplayer login failed';
            state.ready = false;
            state.me = null;
            setStatus('Offline', 'warn');
            setNotice(err, 'warn');
            updateActionStates();
            return { success: false, error: err };
        }

        persistToken(login.data.token);
        state.me = login.data.user || { username };
        state.ready = true;
        setStatus(`Online: ${state.me?.username || username}`, 'ok');
        setNotice(
            mode === 'register'
                ? 'Multiplayer account created. You can now add friends and party up.'
                : 'Multiplayer connected.',
            'ok'
        );
        updateActionStates();
        await refreshAll();
        return { success: true };
    }

    async function logoutNetworkSession() {
        if (state.token) {
            await api('/api/logout', 'POST', {});
        }
        state.ready = false;
        state.me = null;
        state.friends = [];
        state.requestsIncoming = [];
        state.requestsOutgoing = [];
        state.party = null;
        state.partyInvites = [];
        state.partyLive = null;
        state.selectedFriend = '';
        state.chats = {};
        persistToken('');
        renderAll();
        setStatus('Offline', 'bad');
    }

    function formatAgo(ts) {
        const value = Number(ts) || 0;
        if (!value) return 'n/a';
        const now = Math.floor(Date.now() / 1000);
        const diff = Math.max(0, now - value);
        if (diff < 10) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeUsername(value) {
        return String(value || '').trim();
    }

    function isValidUsername(value) {
        return /^[A-Za-z0-9_]{2,16}$/.test(value);
    }

    function getChatState(username) {
        const key = (username || '').toLowerCase();
        if (!state.chats[key]) {
            state.chats[key] = { lastId: 0, messages: [] };
        }
        return state.chats[key];
    }

    function chatTargetName() {
        return state.selectedFriend || '';
    }

    function friendByName(username) {
        const key = (username || '').toLowerCase();
        return state.friends.find((f) => (f.username || '').toLowerCase() === key) || null;
    }

    function updateActionStates() {
        const online = isOnlineReady();
        const hasParty = !!state.party && !!state.party.id;
        const selectedTarget = chatTargetName();
        const friendInputValue = normalizeUsername(ui.friendInput?.value);
        const chatValue = normalizeUsername(ui.chatInput?.value);

        if (ui.friendInput) {
            ui.friendInput.disabled = !online || state.locks.addFriend;
        }
        if (ui.addFriendBtn) {
            ui.addFriendBtn.disabled = !online || state.locks.addFriend || !friendInputValue;
        }
        if (ui.createPartyBtn) {
            ui.createPartyBtn.disabled = !online || hasParty || state.locks.createParty;
        }
        if (ui.leavePartyBtn) {
            ui.leavePartyBtn.disabled = !online || !hasParty || state.locks.leaveParty;
        }

        if (ui.chatHint) {
            if (!online) ui.chatHint.textContent = 'Connect multiplayer to chat';
            else if (!selectedTarget) ui.chatHint.textContent = 'Select a friend to begin chat';
            else ui.chatHint.textContent = `Chatting with ${selectedTarget}`;
        }
        if (ui.chatInput) {
            ui.chatInput.disabled = !online || !selectedTarget || state.locks.sendChat;
            ui.chatInput.placeholder = selectedTarget
                ? `Message ${selectedTarget}...`
                : 'Select a friend and start chatting...';
        }
        if (ui.chatSendBtn) {
            ui.chatSendBtn.disabled = !online || !selectedTarget || !chatValue || state.locks.sendChat;
        }
    }

    function renderRequests() {
        if (!ui.requestsList) return;
        const list = [];

        if (state.requestsIncoming.length) {
            for (const req of state.requestsIncoming) {
                list.push(`
                    <div class="social-item">
                        <div class="social-item-main">
                            <div class="social-item-name">${escapeHtml(req.from)}</div>
                            <div class="social-item-meta">Incoming request</div>
                        </div>
                        <div class="social-item-actions">
                            <button class="social-action-btn" data-sreq-accept="${req.id}">Accept</button>
                            <button class="social-action-btn secondary" data-sreq-reject="${req.id}">Decline</button>
                        </div>
                    </div>
                `);
            }
        }

        if (state.requestsOutgoing.length) {
            for (const req of state.requestsOutgoing) {
                list.push(`
                    <div class="social-item">
                        <div class="social-item-main">
                            <div class="social-item-name">${escapeHtml(req.to)}</div>
                            <div class="social-item-meta">Request sent</div>
                        </div>
                    </div>
                `);
            }
        }

        if (!list.length) {
            ui.requestsList.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">No friend requests.</div></div></div>';
            return;
        }
        ui.requestsList.innerHTML = list.join('');
    }

    function renderFriends() {
        if (!ui.friendsList) return;
        if (!state.friends.length) {
            ui.friendsList.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">No friends yet. Add one above.</div></div></div>';
            return;
        }

        const partyMemberNames = new Set((state.party?.members || []).map((m) => (m.username || '').toLowerCase()));

        ui.friendsList.innerHTML = state.friends.map((friend) => {
            const active = (friend.username || '').toLowerCase() === (state.selectedFriend || '').toLowerCase();
            const inParty = partyMemberNames.has((friend.username || '').toLowerCase());
            const statusLabel = friend.inGame
                ? `In run L${friend.level || 0} S${friend.stage || 0}`
                : `${friend.status || 'offline'} | seen ${formatAgo(friend.lastSeen)}`;
            const safeName = escapeHtml(friend.username);
            const safeStatus = escapeHtml(statusLabel);
            return `
                <div class="social-item" data-sfriend="${safeName}" style="${active ? 'border-color: rgba(45, 212, 191, 0.55);' : ''}">
                    <div class="social-item-main">
                        <div class="social-item-name">${safeName}</div>
                        <div class="social-item-meta">${safeStatus}</div>
                    </div>
                    <div class="social-item-actions">
                        <button class="social-action-btn secondary" data-schat="${safeName}">Chat</button>
                        <button class="social-action-btn ${inParty ? 'warn' : ''}" data-sinvite="${safeName}" ${inParty ? 'disabled' : ''}>
                            ${inParty ? 'In Party' : 'Invite'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderParty() {
        if (ui.partyMembers) {
            if (!state.party || !Array.isArray(state.party.members) || !state.party.members.length) {
                ui.partyMembers.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">You are not in a party.</div></div></div>';
            } else {
                ui.partyMembers.innerHTML = state.party.members.map((member) => {
                    const isLeader = member.username === state.party.leader;
                    const modeText = member.inGame
                        ? `In run L${member.level || 0} S${member.stage || 0}`
                        : `${member.status || 'online'} | ${formatAgo(member.presenceUpdatedAt)}`;
                    const safeMemberName = escapeHtml(member.username);
                    const safeModeText = escapeHtml(modeText);
                    return `
                        <div class="social-item">
                            <div class="social-item-main">
                                <div class="social-item-name">${safeMemberName}${isLeader ? ' (Leader)' : ''}</div>
                                <div class="social-item-meta">${safeModeText}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (ui.partyInvites) {
            if (!state.partyInvites.length) {
                ui.partyInvites.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">No party invites.</div></div></div>';
            } else {
                ui.partyInvites.innerHTML = state.partyInvites.map((invite) => `
                    <div class="social-item">
                        <div class="social-item-main">
                            <div class="social-item-name">${escapeHtml(invite.from)}</div>
                            <div class="social-item-meta">Invited you to party #${Number(invite.partyId) || 0}</div>
                        </div>
                        <div class="social-item-actions">
                            <button class="social-action-btn" data-sparty-accept="${invite.id}">Join</button>
                            <button class="social-action-btn secondary" data-sparty-reject="${invite.id}">Decline</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    function renderChat() {
        if (!ui.chatTitle || !ui.chatMessages) return;
        const target = chatTargetName();
        if (!target) {
            ui.chatTitle.textContent = 'Select a friend to chat';
            ui.chatMessages.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">No chat selected.</div></div></div>';
            return;
        }

        ui.chatTitle.textContent = `Chat with ${target}`;
        const chat = getChatState(target);
        if (!chat.messages.length) {
            ui.chatMessages.innerHTML = '<div class="social-item"><div class="social-item-main"><div class="social-item-meta">No messages yet.</div></div></div>';
            return;
        }

        const meName = state.me?.username || '';
        ui.chatMessages.innerHTML = chat.messages.map((msg) => {
            const self = msg.from === meName;
            return `
                <div class="social-msg ${self ? 'self' : ''}">
                    <div class="social-msg-head">${escapeHtml(msg.from)} | ${formatAgo(Math.floor((msg.createdAt || 0)))}</div>
                    <div class="social-msg-body">${escapeHtml(msg.body || '')}</div>
                </div>
            `;
        }).join('');
        ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
    }

    function renderAll() {
        renderRequests();
        renderFriends();
        renderParty();
        renderChat();
        updateActionStates();
    }

    async function loadFriends() {
        const res = await api('/api/social/friends', 'GET');
        if (!res.ok || !res.data?.success) return false;
        state.friends = Array.isArray(res.data.friends) ? res.data.friends : [];
        return true;
    }

    async function loadRequests() {
        const res = await api('/api/social/requests', 'GET');
        if (!res.ok || !res.data?.success) return false;
        state.requestsIncoming = Array.isArray(res.data.incoming) ? res.data.incoming : [];
        state.requestsOutgoing = Array.isArray(res.data.outgoing) ? res.data.outgoing : [];
        return true;
    }

    async function loadParty() {
        const [partyRes, inviteRes] = await Promise.all([
            api('/api/social/party', 'GET'),
            api('/api/social/party/invites', 'GET'),
        ]);
        if (partyRes.ok && partyRes.data?.success) {
            state.party = partyRes.data.party || null;
        }
        if (inviteRes.ok && inviteRes.data?.success) {
            state.partyInvites = Array.isArray(inviteRes.data.invites) ? inviteRes.data.invites : [];
        }
        return true;
    }

    function toOptionalInteger(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return Math.round(n);
    }

    async function loadPartyLive(options = {}) {
        if (!isOnlineReady()) return false;
        const hasParty = !!state.party && !!state.party.id;
        if (!hasParty) {
            state.partyLive = null;
            return true;
        }

        const params = new URLSearchParams();
        const level = toOptionalInteger(options.level);
        const stage = toOptionalInteger(options.stage);
        const floor = toOptionalInteger(options.floor);
        if (level !== null) params.set('level', String(level));
        if (stage !== null) params.set('stage', String(stage));
        if (floor !== null) params.set('floor', String(floor));
        if (options.includeSelf) params.set('includeSelf', '1');

        const query = params.toString();
        const path = query ? `/api/social/party/live?${query}` : '/api/social/party/live';
        const res = await api(path, 'GET');
        if (!res.ok || !res.data?.success) {
            return false;
        }

        state.partyLive = {
            partyId: res.data.partyId || null,
            leader: res.data.leader || '',
            serverTime: Number(res.data.serverTime) || 0,
            updatedAt: Date.now(),
            members: Array.isArray(res.data.members) ? res.data.members : [],
        };
        return true;
    }

    async function loadChat(targetName, incremental = true) {
        const target = (targetName || '').trim();
        if (!target) return false;
        const chat = getChatState(target);
        const sinceId = incremental ? chat.lastId : 0;
        const res = await api(`/api/social/messages?with=${encodeURIComponent(target)}&sinceId=${sinceId}`, 'GET');
        if (!res.ok || !res.data?.success) return false;
        const incoming = Array.isArray(res.data.messages) ? res.data.messages : [];
        if (!incremental) {
            chat.messages = [];
            chat.lastId = 0;
        }
        for (const msg of incoming) {
            if (!msg || typeof msg !== 'object') continue;
            chat.messages.push(msg);
            chat.lastId = Math.max(chat.lastId, Number(msg.id) || 0);
        }
        if (chat.messages.length > 200) {
            chat.messages = chat.messages.slice(chat.messages.length - 200);
        }
        return true;
    }

    async function refreshAll() {
        if (!isOnlineReady()) {
            updateActionStates();
            return false;
        }
        await Promise.all([loadFriends(), loadRequests(), loadParty()]);
        await loadPartyLive();
        if (state.selectedFriend) await loadChat(state.selectedFriend, true);
        renderAll();
        return true;
    }

    async function addFriend() {
        if (state.locks.addFriend) return;
        if (!isOnlineReady()) {
            setNotice('Connect multiplayer before adding friends.', 'warn');
            updateActionStates();
            return;
        }
        const username = normalizeUsername(ui.friendInput?.value);
        if (!username) {
            setNotice('Enter a username to add a friend.', 'warn');
            updateActionStates();
            return;
        }
        if (!isValidUsername(username)) {
            setNotice('Username must be 2-16 letters, numbers, or _.', 'warn');
            updateActionStates();
            return;
        }
        if ((state.me?.username || '').toLowerCase() === username.toLowerCase()) {
            setNotice('You cannot add yourself.', 'warn');
            updateActionStates();
            return;
        }
        state.locks.addFriend = true;
        updateActionStates();
        const res = await api('/api/social/friend-request', 'POST', { username });
        state.locks.addFriend = false;
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not send friend request', 'warn');
            updateActionStates();
            return;
        }
        if (ui.friendInput) ui.friendInput.value = '';
        setNotice(`Friend request sent to ${username}.`, 'ok');
        await Promise.all([loadFriends(), loadRequests()]);
        renderAll();
    }

    async function respondFriendRequest(requestId, action) {
        const res = await api('/api/social/friend-respond', 'POST', { requestId, action });
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not respond to request', 'warn');
            return;
        }
        setNotice(`Friend request ${action}ed.`, 'ok');
        await Promise.all([loadFriends(), loadRequests()]);
        renderAll();
    }

    async function inviteToParty(username) {
        const res = await api('/api/social/party/invite', 'POST', { username });
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not send party invite', 'warn');
            return;
        }
        setNotice(`Party invite sent to ${username}.`, 'ok');
        await loadParty();
        renderAll();
    }

    async function createParty() {
        if (state.locks.createParty) return;
        state.locks.createParty = true;
        updateActionStates();
        const res = await api('/api/social/party/create', 'POST', {});
        state.locks.createParty = false;
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not create party', 'warn');
            updateActionStates();
            return;
        }
        state.party = res.data.party || null;
        setNotice('Party ready. Invite your friends.', 'ok');
        renderAll();
    }

    async function leaveParty() {
        if (state.locks.leaveParty) return;
        state.locks.leaveParty = true;
        updateActionStates();
        const res = await api('/api/social/party/leave', 'POST', {});
        state.locks.leaveParty = false;
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not leave party', 'warn');
            updateActionStates();
            return;
        }
        state.party = null;
        setNotice('You left the party.', 'ok');
        await loadParty();
        renderAll();
    }

    async function respondPartyInvite(inviteId, action) {
        const res = await api('/api/social/party/respond', 'POST', { inviteId, action });
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not respond to party invite', 'warn');
            return;
        }
        state.party = res.data.party || null;
        setNotice(action === 'accept' ? 'Joined party.' : 'Party invite declined.', 'ok');
        await loadParty();
        renderAll();
    }

    async function sendChatMessage() {
        if (state.locks.sendChat) return;
        if (!isOnlineReady()) {
            setNotice('Connect multiplayer before sending chat.', 'warn');
            updateActionStates();
            return;
        }
        const target = chatTargetName();
        const body = normalizeUsername(ui.chatInput?.value);
        if (!target) {
            setNotice('Select a friend first to start chat.', 'warn');
            updateActionStates();
            return;
        }
        if (!body) {
            setNotice('Type a message before sending.', 'warn');
            updateActionStates();
            return;
        }
        if (body.length > 300) {
            setNotice('Message too long (max 300 characters).', 'warn');
            updateActionStates();
            return;
        }
        if (!friendByName(target)) {
            setNotice('Selected friend is no longer available. Refreshing list.', 'warn');
            await loadFriends();
            renderAll();
            return;
        }
        state.locks.sendChat = true;
        updateActionStates();
        const res = await api('/api/social/message', 'POST', { to: target, body });
        state.locks.sendChat = false;
        if (!res.ok || !res.data?.success) {
            setNotice(res.data?.error || 'Could not send message', 'warn');
            updateActionStates();
            return;
        }
        if (ui.chatInput) ui.chatInput.value = '';
        const chat = getChatState(target);
        if (res.data.message) {
            chat.messages.push(res.data.message);
            chat.lastId = Math.max(chat.lastId, Number(res.data.message.id) || 0);
        }
        if (chat.messages.length > 200) {
            chat.messages = chat.messages.slice(chat.messages.length - 200);
        }
        setNotice(`Message sent to ${target}.`, 'ok');
        renderChat();
        updateActionStates();
    }

    function selectFriend(username) {
        const normalized = normalizeUsername(username);
        if (!normalized) return;
        const friend = friendByName(normalized);
        if (!friend) {
            setNotice('Friend not found in your list.', 'warn');
            return;
        }
        state.selectedFriend = friend.username;
        renderAll();
        loadChat(normalized, false).then(() => renderAll());
    }

    function bindContainerActions() {
        const screen = ui.screen;
        if (!screen) return;
        screen.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const acceptReq = target.getAttribute('data-sreq-accept');
            if (acceptReq) {
                respondFriendRequest(Number(acceptReq), 'accept');
                return;
            }
            const rejectReq = target.getAttribute('data-sreq-reject');
            if (rejectReq) {
                respondFriendRequest(Number(rejectReq), 'reject');
                return;
            }
            const chatUser = target.getAttribute('data-schat');
            if (chatUser) {
                selectFriend(chatUser);
                return;
            }
            const inviteUser = target.getAttribute('data-sinvite');
            if (inviteUser) {
                inviteToParty(inviteUser);
                return;
            }
            const partyAccept = target.getAttribute('data-sparty-accept');
            if (partyAccept) {
                respondPartyInvite(Number(partyAccept), 'accept');
                return;
            }
            const partyReject = target.getAttribute('data-sparty-reject');
            if (partyReject) {
                respondPartyInvite(Number(partyReject), 'reject');
                return;
            }
            const friendCard = target.closest('[data-sfriend]');
            if (friendCard instanceof HTMLElement) {
                const name = friendCard.getAttribute('data-sfriend');
                if (name) selectFriend(name);
            }
        });
    }

    function startPolling() {
        if (state.pollHandle) clearInterval(state.pollHandle);
        state.pollHandle = setInterval(() => {
            if (!isOnlineReady()) return;
            refreshAll();
        }, POLL_MS);
    }

    function init() {
        ui.screen = document.getElementById('social-screen');
        ui.status = document.getElementById('social-status');
        ui.notice = document.getElementById('social-notice');
        ui.friendInput = document.getElementById('social-friend-input');
        ui.addFriendBtn = document.getElementById('social-add-friend-btn');
        ui.requestsList = document.getElementById('social-requests-list');
        ui.friendsList = document.getElementById('social-friends-list');
        ui.createPartyBtn = document.getElementById('social-create-party-btn');
        ui.leavePartyBtn = document.getElementById('social-leave-party-btn');
        ui.partyMembers = document.getElementById('social-party-members');
        ui.partyInvites = document.getElementById('social-party-invites');
        ui.chatTitle = document.getElementById('social-chat-title');
        ui.chatHint = document.getElementById('social-chat-hint');
        ui.chatMessages = document.getElementById('social-chat-messages');
        ui.chatInput = document.getElementById('social-chat-input');
        ui.chatSendBtn = document.getElementById('social-chat-send-btn');

        try {
            state.token = localStorage.getItem(TOKEN_KEY) || '';
        } catch (_err) {
            state.token = '';
        }

        if (ui.addFriendBtn) ui.addFriendBtn.addEventListener('click', addFriend);
        if (ui.createPartyBtn) ui.createPartyBtn.addEventListener('click', createParty);
        if (ui.leavePartyBtn) ui.leavePartyBtn.addEventListener('click', leaveParty);
        if (ui.chatSendBtn) ui.chatSendBtn.addEventListener('click', sendChatMessage);
        if (ui.friendInput) {
            ui.friendInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addFriend();
            });
            ui.friendInput.addEventListener('input', () => updateActionStates());
        }
        if (ui.chatInput) {
            ui.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') sendChatMessage();
            });
            ui.chatInput.addEventListener('input', () => updateActionStates());
        }

        bindContainerActions();
        setStatus('Connecting...', 'neutral');

        if (state.token) {
            restoreNetworkSession().then(() => {
                if (isOnlineReady()) refreshAll();
            });
        } else {
            setStatus('Offline', 'warn');
        }
        updateActionStates();
        startPolling();
    }

    function openScreen() {
        Utils.showScreen('social-screen');
        if (isOnlineReady()) refreshAll();
    }

    async function syncRunStats(score, floor, kills, gold) {
        if (!isOnlineReady()) return false;
        const res = await api('/api/stats/run', 'POST', { score, floor, kills, gold });
        return !!(res.ok && res.data?.success);
    }

    async function syncCheckpointSave(snapshot) {
        if (!isOnlineReady()) return false;
        const res = await api('/api/checkpoint/save', 'POST', { checkpoint: snapshot });
        return !!(res.ok && res.data?.success);
    }

    async function syncCheckpointClear() {
        if (!isOnlineReady()) return false;
        const res = await api('/api/checkpoint/clear', 'POST', {});
        return !!(res.ok && res.data?.success);
    }

    async function syncCheckpointLoad() {
        if (!isOnlineReady()) return null;
        const res = await api('/api/checkpoint/get', 'GET');
        if (!res.ok || !res.data?.success) return null;
        return res.data.checkpoint || null;
    }

    async function updatePresence(payload = {}) {
        if (!isOnlineReady()) return false;
        const body = {
            status: payload.status || 'online',
            inGame: !!payload.inGame,
            level: Number(payload.level) || 0,
            stage: Number(payload.stage) || 0,
            floor: Number(payload.floor) || 0,
            x: Number(payload.x) || 0,
            y: Number(payload.y) || 0,
        };
        const res = await api('/api/social/presence/update', 'POST', body);
        return !!(res.ok && res.data?.success);
    }

    function toStageFields(level, stage, floor) {
        const lv = Math.max(1, Math.round(Number(level) || 0));
        const st = Math.max(1, Math.round(Number(stage) || 0));
        const fl = Math.max(1, Math.round(Number(floor) || 0));
        return { level: lv, stage: st, floor: fl };
    }

    async function fetchCoopState(level, stage, floor) {
        if (!isOnlineReady()) return null;
        const s = toStageFields(level, stage, floor);
        const res = await api(
            `/api/coop/state?level=${encodeURIComponent(s.level)}&stage=${encodeURIComponent(s.stage)}&floor=${encodeURIComponent(s.floor)}`,
            'GET'
        );
        if (!res.ok || !res.data?.success) return null;
        return {
            version: Number(res.data.version) || 0,
            updatedAt: Number(res.data.updatedAt) || 0,
            state: res.data.state || null,
            leader: res.data.leader || '',
            partyId: Number(res.data.partyId) || 0,
            stage: res.data.stage || s,
        };
    }

    async function pushCoopState(level, stage, floor, statePayload) {
        if (!isOnlineReady()) return null;
        const s = toStageFields(level, stage, floor);
        const res = await api('/api/coop/state/push', 'POST', {
            ...s,
            state: statePayload || {},
        });
        if (!res.ok || !res.data?.success) return null;
        return {
            version: Number(res.data.version) || 0,
            updatedAt: Number(res.data.updatedAt) || 0,
            state: res.data.state || null,
            partyId: Number(res.data.partyId) || 0,
            stage: res.data.stage || s,
        };
    }

    async function reportCoopHit(level, stage, floor, enemyId, damage) {
        if (!isOnlineReady()) return null;
        const s = toStageFields(level, stage, floor);
        const payload = {
            ...s,
            enemyId: String(enemyId || '').trim(),
            damage: Math.max(1, Math.round(Number(damage) || 1)),
        };
        if (!payload.enemyId) return null;
        const res = await api('/api/coop/hit', 'POST', payload);
        if (!res.ok || !res.data?.success) return null;
        return {
            version: Number(res.data.version) || 0,
            updatedAt: Number(res.data.updatedAt) || 0,
            enemy: res.data.enemy || null,
            partyId: Number(res.data.partyId) || 0,
            stage: res.data.stage || s,
        };
    }

    async function claimCoopLoot(level, stage, floor, lootKey) {
        if (!isOnlineReady()) return null;
        const key = String(lootKey || '').trim();
        if (!key) return null;
        const s = toStageFields(level, stage, floor);
        const res = await api('/api/coop/loot/claim', 'POST', {
            ...s,
            lootKey: key,
        });
        if (!res.ok || !res.data?.success) return null;
        return {
            granted: !!res.data.granted,
            owner: res.data.owner || '',
            lootKey: res.data.lootKey || key,
            partyId: Number(res.data.partyId) || 0,
            stage: res.data.stage || s,
        };
    }

    async function fetchPartyLive(options = {}) {
        if (!isOnlineReady()) return null;
        const ok = await loadPartyLive(options);
        if (!ok) return null;
        return state.partyLive;
    }

    return {
        init,
        openScreen,
        refreshAll,
        isOnlineReady,
        restoreNetworkSession,
        bootstrapNetworkSession,
        logoutNetworkSession,
        syncRunStats,
        syncCheckpointSave,
        syncCheckpointClear,
        syncCheckpointLoad,
        updatePresence,
        fetchCoopState,
        pushCoopState,
        reportCoopHit,
        claimCoopLoot,
        fetchPartyLive,
        getPartyLiveSnapshot() { return state.partyLive; },
        getPartySnapshot() { return state.party; },
        getOnlineUser() { return state.me; },
    };
})();

