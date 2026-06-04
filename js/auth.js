/* ============================================
   AUTH — Account creation & login system
   ============================================ */

const Auth = (() => {
    const STORAGE_KEY = 'shadow_depths_accounts';
    const SESSION_KEY = 'shadow_depths_session';
    const RUN_SAVE_KEY = 'shadow_depths_run_saves';
    let currentUser = null;

    function safeParseJSON(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (_err) {
            return fallback;
        }
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function validEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
    }

    function generateNetworkPassword() {
        return `g_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    }

    function getAccounts() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return {};
            const parsed = safeParseJSON(data, {});
            if (!parsed || typeof parsed !== 'object') return {};
            Object.keys(parsed).forEach((key) => {
                const account = parsed[key];
                if (!account || typeof account !== 'object') return;
                if (typeof account.email !== 'string') account.email = '';
                if (typeof account.emailVerified !== 'boolean') account.emailVerified = false;
                if (typeof account.googleSub !== 'string') account.googleSub = '';
                if (typeof account.googleName !== 'string') account.googleName = '';
                if (typeof account.authProvider !== 'string') account.authProvider = 'local';
                if (typeof account.networkPassword !== 'string') account.networkPassword = '';
            });
            return parsed;
        } catch (_err) {
            return {};
        }
    }

    function saveAccounts(accounts) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
            return true;
        } catch (_err) {
            return false;
        }
    }

    function getRunSaves() {
        try {
            const data = localStorage.getItem(RUN_SAVE_KEY);
            if (!data) return {};
            const parsed = safeParseJSON(data, {});
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_err) {
            return {};
        }
    }

    function saveRunSaves(runSaves) {
        try {
            localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(runSaves));
            return true;
        } catch (_err) {
            return false;
        }
    }

    function register(username, password, email = '') {
        username = (username || '').trim();
        email = normalizeEmail(email);

        if (!username || username.length < 2) {
            return { success: false, error: 'Username must be at least 2 characters' };
        }
        if (!password || password.length < 4) {
            return { success: false, error: 'Password must be at least 4 characters' };
        }
        if (username.length > 16) {
            return { success: false, error: 'Username max 16 characters' };
        }
        if (!email) {
            return { success: false, error: 'Email is required for recovery and Google verification' };
        }
        if (!validEmail(email)) {
            return { success: false, error: 'Enter a valid email address' };
        }

        const accounts = getAccounts();
        const key = username.toLowerCase();

        if (accounts[key]) {
            return { success: false, error: 'Username already taken' };
        }
        const duplicateEmail = Object.values(accounts).some((account) => normalizeEmail(account.email) === email);
        if (duplicateEmail) {
            return { success: false, error: 'Email is already linked to another account' };
        }

        accounts[key] = {
            username: username,
            passwordHash: Utils.simpleHash(password),
            email,
            emailVerified: false,
            googleSub: '',
            googleName: '',
            authProvider: 'local',
            networkPassword: '',
            createdAt: Date.now(),
            stats: {
                totalRuns: 0,
                bestScore: 0,
                bestFloor: 0,
                totalKills: 0,
                totalGold: 0,
            },
            runs: []
        };

        if (!saveAccounts(accounts)) {
            return { success: false, error: 'Could not save account data. Check browser storage settings.' };
        }

        return { success: true };
    }

    function findAccountByIdentifier(identifier) {
        const value = (identifier || '').trim();
        if (!value) return { key: '', account: null };
        const accounts = getAccounts();
        const byUsername = value.toLowerCase();
        if (accounts[byUsername]) {
            return { key: byUsername, account: accounts[byUsername] };
        }
        const byEmail = normalizeEmail(value);
        const foundKey = Object.keys(accounts).find((k) => normalizeEmail(accounts[k].email) === byEmail) || '';
        return { key: foundKey, account: foundKey ? accounts[foundKey] : null };
    }

    function login(username, password) {
        username = (username || '').trim();

        if (!username || !password) {
            return { success: false, error: 'Please fill in all fields' };
        }

        const accounts = getAccounts();
        const lookup = findAccountByIdentifier(username);
        const key = lookup.key;
        const account = lookup.account;

        if (!account) {
            return { success: false, error: 'Account not found' };
        }

        if (account.passwordHash !== Utils.simpleHash(password)) {
            return { success: false, error: 'Incorrect password' };
        }

        if (!account.networkPassword && account.authProvider === 'google') {
            account.networkPassword = generateNetworkPassword();
            accounts[key] = account;
            saveAccounts(accounts);
        }

        currentUser = account;
        try {
            localStorage.setItem(SESSION_KEY, key);
        } catch (_err) {
            // Keep in-memory session if storage is blocked.
        }

        return { success: true, user: account };
    }

    function createUsernameFromEmail(email, accounts) {
        const baseRaw = String(email || '').split('@')[0] || 'player';
        const base = baseRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'player';
        let candidate = base.slice(0, 16);
        if (!accounts[candidate]) return candidate;
        for (let i = 0; i < 9999; i++) {
            const suffix = String(Math.floor(Math.random() * 9000) + 1000);
            candidate = `${base.slice(0, Math.max(1, 16 - suffix.length))}${suffix}`;
            if (!accounts[candidate]) return candidate;
        }
        return `player${Date.now().toString(36).slice(-6)}`;
    }

    function loginWithGoogle(googleProfile) {
        const email = normalizeEmail(googleProfile?.email);
        const googleSub = String(googleProfile?.sub || '').trim();
        if (!email || !validEmail(email)) {
            return { success: false, error: 'Google account email is missing or invalid' };
        }
        if (!googleSub) {
            return { success: false, error: 'Google account verification failed' };
        }
        if (!googleProfile?.email_verified) {
            return { success: false, error: 'Google email must be verified' };
        }

        const accounts = getAccounts();
        let key = Object.keys(accounts).find((k) => String(accounts[k].googleSub || '') === googleSub) || '';
        if (!key) {
            key = Object.keys(accounts).find((k) => normalizeEmail(accounts[k].email) === email) || '';
        }

        let isNew = false;
        if (!key) {
            isNew = true;
            key = createUsernameFromEmail(email, accounts);
            accounts[key] = {
                username: key,
                passwordHash: Utils.simpleHash(generateNetworkPassword()),
                email,
                emailVerified: true,
                googleSub,
                googleName: String(googleProfile?.name || ''),
                authProvider: 'google',
                networkPassword: generateNetworkPassword(),
                createdAt: Date.now(),
                stats: {
                    totalRuns: 0,
                    bestScore: 0,
                    bestFloor: 0,
                    totalKills: 0,
                    totalGold: 0,
                },
                runs: []
            };
        } else {
            const account = accounts[key];
            account.email = email;
            account.emailVerified = true;
            account.googleSub = googleSub;
            account.googleName = String(googleProfile?.name || account.googleName || '');
            account.authProvider = account.authProvider || 'google';
            if (!account.networkPassword) account.networkPassword = generateNetworkPassword();
            accounts[key] = account;
        }

        if (!saveAccounts(accounts)) {
            return { success: false, error: 'Could not save Google account data' };
        }

        currentUser = accounts[key];
        try {
            localStorage.setItem(SESSION_KEY, key);
        } catch (_err) {
            // Ignore storage error and keep in-memory session.
        }
        return { success: true, user: currentUser, isNew };
    }

    function resetPasswordWithGoogle(identifier, googleProfile, newPassword) {
        const value = (identifier || '').trim();
        if (!value) return { success: false, error: 'Enter your username or email' };
        if (!newPassword || newPassword.length < 4) {
            return { success: false, error: 'Password must be at least 4 characters' };
        }
        const verifiedEmail = normalizeEmail(googleProfile?.email);
        if (!verifiedEmail || !validEmail(verifiedEmail) || !googleProfile?.email_verified) {
            return { success: false, error: 'Google email verification is required' };
        }

        const accounts = getAccounts();
        const lookup = findAccountByIdentifier(value);
        if (!lookup.account || !lookup.key) {
            return { success: false, error: 'Account not found' };
        }

        const account = lookup.account;
        const accountEmail = normalizeEmail(account.email);
        if (!accountEmail) {
            return { success: false, error: 'This account has no email linked yet' };
        }
        if (accountEmail !== verifiedEmail) {
            return { success: false, error: 'Google email does not match this account' };
        }

        account.passwordHash = Utils.simpleHash(newPassword);
        account.emailVerified = true;
        account.googleSub = String(googleProfile?.sub || account.googleSub || '');
        account.googleName = String(googleProfile?.name || account.googleName || '');
        account.networkPassword = account.authProvider === 'google'
            ? (account.networkPassword || generateNetworkPassword())
            : '';
        accounts[lookup.key] = account;

        if (!saveAccounts(accounts)) {
            return { success: false, error: 'Could not save the new password' };
        }
        return { success: true };
    }

    function getNetworkPassword(preferredPassword = '') {
        if (!currentUser) return preferredPassword || '';
        if (currentUser.authProvider === 'google') {
            if (!currentUser.networkPassword) {
                const accounts = getAccounts();
                const key = currentUser.username.toLowerCase();
                if (accounts[key]) {
                    accounts[key].networkPassword = generateNetworkPassword();
                    saveAccounts(accounts);
                    currentUser = accounts[key];
                }
            }
            return currentUser.networkPassword || preferredPassword || '';
        }
        return preferredPassword || '';
    }

    function logout() {
        currentUser = null;
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch (_err) {
            // Ignore storage errors during logout.
        }
    }

    function restoreSession() {
        try {
            const key = localStorage.getItem(SESSION_KEY);
            if (key) {
                const accounts = getAccounts();
                if (accounts[key]) {
                    currentUser = accounts[key];
                    return true;
                }
            }
        } catch (_err) {
            return false;
        }
        return false;
    }

    function getCurrentUser() {
        return currentUser;
    }

    function saveRunStats(score, floor, kills, gold) {
        if (!currentUser) return;

        const accounts = getAccounts();
        const key = currentUser.username.toLowerCase();
        const account = accounts[key];

        if (!account) return;

        account.stats.totalRuns++;
        account.stats.totalKills += kills;
        account.stats.totalGold += gold;

        let isNewBest = false;
        if (score > account.stats.bestScore) {
            account.stats.bestScore = score;
            isNewBest = true;
        }
        if (floor > account.stats.bestFloor) {
            account.stats.bestFloor = floor;
            isNewBest = true;
        }

        // Save last 20 runs
        account.runs.unshift({
            score, floor, kills, gold,
            date: Date.now()
        });
        if (account.runs.length > 20) {
            account.runs = account.runs.slice(0, 20);
        }

        if (!saveAccounts(accounts)) {
            return false;
        }

        currentUser = account;

        if (typeof Social !== 'undefined' && Social && typeof Social.syncRunStats === 'function') {
            Social.syncRunStats(score, floor, kills, gold).catch(() => {
                // Keep local save working even when network sync fails.
            });
        }

        return isNewBest;
    }

    function saveCheckpoint(snapshot) {
        if (!currentUser || !snapshot || typeof snapshot !== 'object') return false;
        const key = currentUser.username.toLowerCase();
        const runSaves = getRunSaves();
        runSaves[key] = {
            ...snapshot,
            savedAt: Date.now(),
            version: 1,
        };
        const saved = saveRunSaves(runSaves);
        if (saved && typeof Social !== 'undefined' && Social && typeof Social.syncCheckpointSave === 'function') {
            Social.syncCheckpointSave(snapshot).catch(() => {
                // Local save remains source of truth for offline mode.
            });
        }
        return saved;
    }

    function getCheckpoint() {
        if (!currentUser) return null;
        const key = currentUser.username.toLowerCase();
        const runSaves = getRunSaves();
        const save = runSaves[key];
        return save && typeof save === 'object' ? save : null;
    }

    function hasCheckpoint() {
        return !!getCheckpoint();
    }

    function clearCheckpoint() {
        if (!currentUser) return false;
        const key = currentUser.username.toLowerCase();
        const runSaves = getRunSaves();
        if (!Object.prototype.hasOwnProperty.call(runSaves, key)) return true;
        delete runSaves[key];
        const cleared = saveRunSaves(runSaves);
        if (cleared && typeof Social !== 'undefined' && Social && typeof Social.syncCheckpointClear === 'function') {
            Social.syncCheckpointClear().catch(() => {
                // Ignore remote clear failures.
            });
        }
        return cleared;
    }

    function importCheckpoint(snapshot) {
        if (!currentUser || !snapshot || typeof snapshot !== 'object') return false;
        const key = currentUser.username.toLowerCase();
        const runSaves = getRunSaves();
        runSaves[key] = {
            ...snapshot,
            savedAt: Date.now(),
            version: 1,
        };
        return saveRunSaves(runSaves);
    }

    return {
        register,
        login,
        loginWithGoogle,
        resetPasswordWithGoogle,
        logout,
        restoreSession,
        getCurrentUser,
        getNetworkPassword,
        saveRunStats,
        saveCheckpoint,
        getCheckpoint,
        hasCheckpoint,
        clearCheckpoint,
        importCheckpoint,
        getAccounts,
    };
})();
