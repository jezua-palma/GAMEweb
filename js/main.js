/* ============================================
   MAIN — App initialization & screen flow
   ============================================ */

(function () {
    'use strict';

    // ===== LOADING SCREEN =====
    const loadingMessages = [
        'Drawing forest trails...',
        'Spawning monsters...',
        'Sharpening swords...',
        'Building bridges...',
        'Loading treasures...',
        'Preparing the wilds...',
    ];
    const authMOTDMessages = [
        'Continue your progress instantly with your saved account data.',
        'Jump into solo runs or invite friends for co-op trail pushes.',
        'Warm up with a quick run, then push for a new personal best.',
        'Your upgrades, loot, and leaderboard progress are ready for action.',
    ];
    const menuHeadlines = [
        'Welcome back to the command hall.',
        'The wilds shift again and new loot awaits.',
        'Your legend grows one floor at a time.',
        'Another route, another chance to dominate the wilds.',
    ];
    const menuNarratives = [
        'A stable route is open. Start a run and build momentum.',
        'Your relic hunt is active. Clear rooms quickly to keep combo pressure.',
        'Party tools are online if you want to run with friends today.',
        'All systems are synced. Push deeper and beat your previous mark.',
    ];
    let authMOTDTimer = null;
    let menuClockTimer = null;
    let screenSwitchTimer = null;

    function markScreenSwitching() {
        document.body.classList.add('screen-switching');
        if (screenSwitchTimer) clearTimeout(screenSwitchTimer);
        screenSwitchTimer = setTimeout(() => {
            document.body.classList.remove('screen-switching');
            screenSwitchTimer = null;
        }, 220);
    }

    function switchScreen(screenId) {
        markScreenSwitching();
        Utils.showScreen(screenId);
    }

    function withLoadingButton(button, loadingLabel) {
        if (!button) return () => {};
        const textEl = button.querySelector('.btn-text');
        const prevText = textEl ? textEl.textContent : '';
        button.disabled = true;
        button.classList.add('is-loading');
        if (textEl && loadingLabel) textEl.textContent = loadingLabel;
        return () => {
            button.classList.remove('is-loading');
            button.disabled = false;
            if (textEl) textEl.textContent = prevText;
        };
    }

    function formatMenuClock(date = new Date()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function updateMenuClock() {
        const clockEl = document.getElementById('menu-welcome-clock');
        if (!clockEl) return;
        clockEl.textContent = formatMenuClock();
    }

    function stopMenuClock() {
        if (menuClockTimer) {
            clearInterval(menuClockTimer);
            menuClockTimer = null;
        }
    }

    function startMenuClock() {
        stopMenuClock();
        updateMenuClock();
        menuClockTimer = setInterval(() => {
            const menuScreen = document.getElementById('menu-screen');
            if (!menuScreen || !menuScreen.classList.contains('active')) return;
            updateMenuClock();
        }, 30000);
    }

    function createRipple(element, event) {
        if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.18;
        const ripple = document.createElement('span');
        ripple.className = 'ui-ripple';
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;

        const hasPoint = event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
        const x = hasPoint ? event.clientX - rect.left : rect.width / 2;
        const y = hasPoint ? event.clientY - rect.top : rect.height / 2;
        ripple.style.left = `${x - size / 2}px`;
        ripple.style.top = `${y - size / 2}px`;

        element.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }

    function initInteractionFeedback() {
        const pressableSelector = '.btn, .menu-btn, .auth-tab, .btn-back, .btn-icon, .touch-btn, .dialogue-btn';
        document.querySelectorAll(pressableSelector).forEach((el) => {
            el.classList.add('ui-pressable');
            el.addEventListener('pointerdown', () => el.classList.add('is-pressing'));
            const clearPress = () => el.classList.remove('is-pressing');
            el.addEventListener('pointerup', clearPress);
            el.addEventListener('pointerleave', clearPress);
            el.addEventListener('pointercancel', clearPress);
            el.addEventListener('click', (e) => createRipple(el, e));
        });
    }

    function isTypingTarget(target) {
        if (!target) return false;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return !!target.closest('[contenteditable="true"]');
    }

    function initMenuHotkeys() {
        document.addEventListener('keydown', (e) => {
            const menuScreen = document.getElementById('menu-screen');
            if (!menuScreen || !menuScreen.classList.contains('active')) return;
            if (e.repeat || isTypingTarget(e.target)) return;

            const actionMap = {
                Digit1: document.getElementById('play-btn'),
                Digit2: document.getElementById('leaderboard-btn'),
                Digit3: document.getElementById('howtoplay-btn'),
                Digit4: document.getElementById('social-btn'),
                Digit5: document.getElementById('settings-btn'),
                KeyC: document.getElementById('continue-btn'),
            };
            const targetBtn = actionMap[e.code];
            if (!targetBtn) return;
            if (targetBtn.id === 'continue-btn') {
                const isVisible = targetBtn.style.display !== 'none';
                if (!isVisible || targetBtn.disabled) return;
            }
            e.preventDefault();
            targetBtn.click();
        });
    }

    function getDayPeriod(date = new Date()) {
        const hour = date.getHours();
        if (hour < 5) return 'night';
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        return 'evening';
    }

    function buildGreeting(name, date = new Date()) {
        const period = getDayPeriod(date);
        const greetings = {
            morning: 'Good morning',
            afternoon: 'Good afternoon',
            evening: 'Good evening',
            night: 'Late night salute',
        };
        const safeName = name && name.trim() ? name.trim() : 'Adventurer';
        return `${greetings[period]}, ${safeName}`;
    }

    function updateAuthWelcome(forceNewMessage = false) {
        const greetingEl = document.getElementById('auth-greeting');
        const motdEl = document.getElementById('auth-motd');
        if (!greetingEl || !motdEl) return;

        const currentUser = Auth.getCurrentUser();
        const name = currentUser && currentUser.username ? currentUser.username : 'Adventurer';
        greetingEl.textContent = `${buildGreeting(name)}.`;

        let nextMessage = motdEl.textContent;
        if (forceNewMessage || !nextMessage) {
            const activeMessages = authMOTDMessages.filter(line => line !== motdEl.dataset.lastMessage);
            nextMessage = Utils.pick(activeMessages.length ? activeMessages : authMOTDMessages);
        }
        motdEl.textContent = nextMessage;
        motdEl.dataset.lastMessage = nextMessage;
    }

    function stopAuthWelcomeRotation() {
        if (authMOTDTimer) {
            clearInterval(authMOTDTimer);
            authMOTDTimer = null;
        }
    }

    function startAuthWelcomeRotation() {
        stopAuthWelcomeRotation();
        updateAuthWelcome(true);
        authMOTDTimer = setInterval(() => {
            const authScreen = document.getElementById('auth-screen');
            if (!authScreen || !authScreen.classList.contains('active')) return;
            updateAuthWelcome(true);
        }, 6500);
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderAuthLeaderboardPreview() {
        const previewEl = document.getElementById('auth-leaderboard-preview');
        if (!previewEl) return;

        if (typeof Leaderboard === 'undefined' || !Leaderboard || typeof Leaderboard.getEntries !== 'function') {
            previewEl.innerHTML = '<div class="leaderboard-preview-loading">Leaderboard system offline.</div>';
            return;
        }

        const entries = Leaderboard.getEntries('score');
        if (!entries || entries.length === 0) {
            previewEl.innerHTML = '<div class="leaderboard-preview-loading">No legends yet. Claim your spot!</div>';
            return;
        }

        const top3 = entries.slice(0, 3);
        let html = '';
        top3.forEach((e, idx) => {
            const rankLabel = ['🥇', '🥈', '🥉'][idx] || (idx + 1);
            html += `
                <div class="auth-lb-entry">
                    <div class="auth-lb-rank rank-${idx + 1}">${rankLabel}</div>
                    <div class="auth-lb-name">${escapeHtml(e.username)}</div>
                    <div class="auth-lb-value">${Utils.formatNumber(e.score)}</div>
                </div>
            `;
        });
        previewEl.innerHTML = html;
    }

    function getWarmGoal(stats) {
        if (stats.totalRuns === 0) return 'Goal: Complete your first run';
        if (stats.bestFloor < 5) return 'Goal: Reach Floor 5';
        if (stats.bestFloor < 10) return 'Goal: Reach Floor 10';
        if (stats.bestScore < 10000) return 'Goal: Break 10,000 score';
        return 'Goal: Set a new personal best';
    }

    function animateCountValue(element, nextValue, formatFn = (value) => String(value), durationMs = 460) {
        if (!element) return;
        const target = Number(nextValue) || 0;
        const start = Number(element.dataset.animatedValue || 0);
        if (start === target) {
            element.textContent = formatFn(target);
            return;
        }

        const startTime = performance.now();
        const delta = target - start;
        element.dataset.animatedValue = String(target);

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const eased = 1 - ((1 - progress) ** 3);
            const current = Math.round(start + (delta * eased));
            element.textContent = formatFn(current);
            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        }
        requestAnimationFrame(tick);
    }

    function updateMenuWelcomeCard(user, animateStats = false) {
        const kickerEl = document.getElementById('menu-welcome-kicker');
        const goalEl = document.getElementById('menu-welcome-goal');
        const titleEl = document.getElementById('menu-welcome-title');
        const subEl = document.getElementById('menu-welcome-sub');
        const bestFloorEl = document.getElementById('menu-welcome-best-floor');
        const bestScoreEl = document.getElementById('menu-welcome-best-score');
        const runsEl = document.getElementById('menu-welcome-runs');

        if (!kickerEl || !goalEl || !titleEl || !subEl || !bestFloorEl || !bestScoreEl || !runsEl) return;

        if (!user || !user.stats) {
            kickerEl.textContent = 'Good day, Adventurer';
            goalEl.textContent = 'Goal: Start your first run';
            titleEl.textContent = 'Welcome to Shadow Depths.';
            subEl.textContent = 'Create an account and begin your first descent into the dungeon.';
            if (animateStats) {
                animateCountValue(bestFloorEl, 0, (value) => String(value));
                animateCountValue(bestScoreEl, 0, (value) => Utils.formatNumber(value));
                animateCountValue(runsEl, 0, (value) => Utils.formatNumber(value));
            } else {
                bestFloorEl.textContent = '0';
                bestScoreEl.textContent = '0';
                runsEl.textContent = '0';
                bestFloorEl.dataset.animatedValue = '0';
                bestScoreEl.dataset.animatedValue = '0';
                runsEl.dataset.animatedValue = '0';
            }
            return;
        }

        const stats = user.stats;
        const rotationSeed = Math.max(0, (stats.totalRuns || 0) + (stats.bestFloor || 0));
        const headline = menuHeadlines[rotationSeed % menuHeadlines.length];
        const narrative = menuNarratives[rotationSeed % menuNarratives.length];

        kickerEl.textContent = buildGreeting(user.username);
        goalEl.textContent = getWarmGoal(stats);
        titleEl.textContent = stats.totalRuns === 0 ? 'Your first descent starts now.' : headline;
        subEl.textContent = narrative;
        if (animateStats) {
            animateCountValue(bestFloorEl, stats.bestFloor || 0, (value) => String(value));
            animateCountValue(bestScoreEl, stats.bestScore || 0, (value) => Utils.formatNumber(value));
            animateCountValue(runsEl, stats.totalRuns || 0, (value) => Utils.formatNumber(value));
        } else {
            bestFloorEl.textContent = String(stats.bestFloor || 0);
            bestScoreEl.textContent = Utils.formatNumber(stats.bestScore || 0);
            runsEl.textContent = Utils.formatNumber(stats.totalRuns || 0);
            bestFloorEl.dataset.animatedValue = String(stats.bestFloor || 0);
            bestScoreEl.dataset.animatedValue = String(stats.bestScore || 0);
            runsEl.dataset.animatedValue = String(stats.totalRuns || 0);
        }
    }

    function animateMenuWelcome() {
        const card = document.getElementById('menu-welcome-card');
        if (!card) return;
        card.classList.remove('menu-welcome-enter');
        // Force reflow so animation can replay every time menu opens.
        void card.offsetWidth;
        card.classList.add('menu-welcome-enter');
    }

    function enablePointerGlow(element, resetX, resetY) {
        if (!element) return;
        element.style.setProperty('--pointer-x', resetX);
        element.style.setProperty('--pointer-y', resetY);

        element.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            const rect = element.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            element.style.setProperty('--pointer-x', `${Utils.clamp(x, 0, 100)}%`);
            element.style.setProperty('--pointer-y', `${Utils.clamp(y, 0, 100)}%`);
        });

        element.addEventListener('pointerleave', () => {
            element.style.setProperty('--pointer-x', resetX);
            element.style.setProperty('--pointer-y', resetY);
        });
    }

    function updateRegisterPasswordFeedback() {
        const passwordInput = document.getElementById('reg-password');
        const confirmInput = document.getElementById('reg-confirm');
        const strengthFill = document.querySelector('#reg-password-strength .auth-strength-fill');
        const passwordNote = document.getElementById('reg-password-note');
        const confirmNote = document.getElementById('reg-confirm-note');

        if (!passwordInput || !confirmInput || !strengthFill || !passwordNote || !confirmNote) return;

        const value = passwordInput.value || '';
        const hasUpper = /[A-Z]/.test(value);
        const hasLower = /[a-z]/.test(value);
        const hasDigit = /\d/.test(value);
        const hasSymbol = /[^A-Za-z0-9]/.test(value);
        const lengthScore = value.length >= 12 ? 2 : value.length >= 8 ? 1 : 0;
        const featureScore = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
        const score = lengthScore + featureScore;

        let tierClass = 'tier-weak';
        let width = 0;
        let noteText = 'Use at least 4 characters for secure access.';
        let noteClass = 'is-warn';

        if (!value) {
            width = 0;
            noteText = 'Use at least 4 characters for secure access.';
            noteClass = '';
        } else if (value.length < 4) {
            width = 20;
            noteText = 'Too short. Minimum is 4 characters.';
            noteClass = 'is-warn';
        } else if (score <= 2) {
            tierClass = 'tier-weak';
            width = 32;
            noteText = 'Weak password. Add letters and numbers.';
            noteClass = 'is-warn';
        } else if (score === 3) {
            tierClass = 'tier-fair';
            width = 54;
            noteText = 'Fair password. Add one more complexity rule.';
            noteClass = '';
        } else if (score <= 5) {
            tierClass = 'tier-good';
            width = 76;
            noteText = 'Good password strength.';
            noteClass = 'is-good';
        } else {
            tierClass = 'tier-strong';
            width = 100;
            noteText = 'Strong password.';
            noteClass = 'is-good';
        }

        strengthFill.className = `auth-strength-fill ${tierClass}`;
        strengthFill.style.width = `${width}%`;
        passwordNote.textContent = noteText;
        passwordNote.className = `auth-field-note ${noteClass}`.trim();

        const confirmValue = confirmInput.value;
        if (!confirmValue) {
            confirmNote.textContent = '';
            confirmNote.className = 'auth-field-note';
        } else if (confirmValue === value) {
            confirmNote.textContent = 'Passwords match.';
            confirmNote.className = 'auth-field-note is-good';
        } else {
            confirmNote.textContent = 'Passwords do not match yet.';
            confirmNote.className = 'auth-field-note is-warn';
        }
    }

    function updateRegisterUsernameFeedback() {
        const usernameInput = document.getElementById('reg-username');
        const noteEl = document.getElementById('reg-username-note');
        if (!usernameInput || !noteEl || typeof Auth === 'undefined' || !Auth || typeof Auth.getAccounts !== 'function') return;

        const username = usernameInput.value.trim();
        if (!username) {
            noteEl.textContent = '2-16 characters. Keep it easy to remember.';
            noteEl.className = 'auth-field-note';
            return;
        }
        if (username.length < 2) {
            noteEl.textContent = 'Username is too short.';
            noteEl.className = 'auth-field-note is-warn';
            return;
        }
        if (username.length > 16) {
            noteEl.textContent = 'Username is too long (max 16).';
            noteEl.className = 'auth-field-note is-warn';
            return;
        }

        const exists = !!Auth.getAccounts()[username.toLowerCase()];
        if (exists) {
            noteEl.textContent = 'This username is already taken.';
            noteEl.className = 'auth-field-note is-warn';
        } else {
            noteEl.textContent = 'Username is available.';
            noteEl.className = 'auth-field-note is-good';
        }
    }

    function initPasswordToggles() {
        document.querySelectorAll('.input-eye-btn').forEach((btn) => {
            const targetId = btn.dataset.togglePassword;
            if (!targetId) return;
            const input = document.getElementById(targetId);
            if (!input) return;
            btn.addEventListener('click', () => {
                const revealing = input.type === 'password';
                input.type = revealing ? 'text' : 'password';
                btn.textContent = revealing ? 'Hide' : 'Show';
                btn.setAttribute('aria-label', revealing ? 'Hide password' : 'Show password');
            });
        });
    }

    function simulateLoading() {
        const bar = document.getElementById('loading-bar');
        const text = document.getElementById('loading-text');
        let progress = 0;
        let msgIndex = 0;

        // Create floating particles on loading screen
        const particlesContainer = document.getElementById('loading-particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.style.cssText = `
                position: absolute;
                width: ${2 + Math.random() * 4}px;
                height: ${2 + Math.random() * 4}px;
                background: ${Math.random() > 0.5 ? '#7c3aed' : '#06b6d4'};
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                opacity: ${0.2 + Math.random() * 0.4};
                animation: floatParticle ${3 + Math.random() * 5}s ease-in-out infinite;
                animation-delay: ${Math.random() * 3}s;
                box-shadow: 0 0 6px currentColor;
            `;
            particlesContainer.appendChild(p);
        }

        // Add float animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes floatParticle {
                0%, 100% { transform: translateY(0) translateX(0); }
                25% { transform: translateY(-20px) translateX(10px); }
                50% { transform: translateY(-10px) translateX(-10px); }
                75% { transform: translateY(-30px) translateX(5px); }
            }
        `;
        document.head.appendChild(style);

        const interval = setInterval(() => {
            progress += Utils.randFloat(8, 18);
            if (progress >= 100) progress = 100;

            bar.style.width = progress + '%';

            if (progress > msgIndex * 20 && msgIndex < loadingMessages.length) {
                text.textContent = loadingMessages[msgIndex];
                msgIndex++;
            }

            if (progress >= 100) {
                clearInterval(interval);
                text.textContent = 'Ready!';
                setTimeout(() => {
                    // Check for existing session
                    if (Auth.restoreSession()) {
                        stopAuthWelcomeRotation();
                        showMenuScreen();
                        if (typeof Social !== 'undefined' && Social && typeof Social.restoreNetworkSession === 'function') {
                            Social.restoreNetworkSession().then(() => {
                                syncNetworkCheckpointToLocal();
                            });
                        }
                    } else {
                        switchScreen('auth-screen');
                        startAuthWelcomeRotation();
                        renderAuthLeaderboardPreview();
                    }
                }, 500);
            }
        }, 200);
    }

    // ===== AUTH SCREEN =====
    function initAuth() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const indicator = document.getElementById('auth-tab-indicator');
        const regUsernameInput = document.getElementById('reg-username');
        const regEmailInput = document.getElementById('reg-email');
        const regPasswordInput = document.getElementById('reg-password');
        const regConfirmInput = document.getElementById('reg-confirm');
        const googleLoginBtn = document.getElementById('google-login-btn');
        const googleLoginRendered = document.getElementById('google-login-rendered');
        const googleLoginNote = document.getElementById('google-login-note');
        const googleClientIdSetup = document.getElementById('google-clientid-setup');
        const googleClientIdInput = document.getElementById('google-clientid-input');
        const googleClientIdSaveBtn = document.getElementById('google-clientid-save-btn');
        const toggleGoogleSetupBtn = document.getElementById('toggle-google-setup');
        const forgotLink = document.getElementById('show-forgot-password');
        const forgotOverlay = document.getElementById('forgot-overlay');
        const forgotIdentifierInput = document.getElementById('forgot-identifier');
        const forgotGoogleVerifyBtn = document.getElementById('forgot-google-verify-btn');
        const forgotGoogleRendered = document.getElementById('forgot-google-rendered');
        const forgotGoogleNote = document.getElementById('forgot-google-note');
        const forgotNewPasswordInput = document.getElementById('forgot-new-password');
        const forgotConfirmInput = document.getElementById('forgot-confirm-password');
        const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
        const forgotCancelBtn = document.getElementById('forgot-cancel-btn');
        const googleClientIdMeta = document.querySelector('meta[name="shadow-google-client-id"]');
        const GOOGLE_CLIENT_ID_STORAGE_KEY = 'shadow_google_client_id';
        let googleClientId = '';
        let verifiedResetGoogleProfile = null;
        let googleIdentityClientId = '';
        let googleRenderRetryTimer = null;
        let googleRenderAttempts = 0;
        let googleCredentialOverride = null;

        function readGoogleClientId() {
            const metaId = (googleClientIdMeta?.content || '').trim();
            const storedId = String(localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) || '').trim();
            googleClientId = storedId || metaId;
            return googleClientId;
        }

        function isGoogleConfigured() {
            return !!readGoogleClientId();
        }

        function hasGoogleSDK() {
            return !!(window.google && window.google.accounts);
        }

        function decodeJwtPayload(token) {
            const jwt = String(token || '');
            if (!jwt) return null;
            const parts = jwt.split('.');
            if (parts.length < 2) return null;
            let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payload.length % 4) payload += '=';
            try {
                return JSON.parse(atob(payload));
            } catch (_err) {
                return null;
            }
        }

        function normalizeGoogleProfile(profile) {
            if (!profile) return null;
            return {
                ...profile,
                email: String(profile.email || '').trim().toLowerCase(),
                email_verified: profile.email_verified === true || profile.email_verified === 'true',
                name: String(profile.name || profile.given_name || ''),
                sub: String(profile.sub || '').trim(),
            };
        }

        function isForgotModalOpen() {
            return !!(forgotOverlay && !forgotOverlay.classList.contains('hidden'));
        }

        function showLoginError(message) {
            const err = document.getElementById('login-error');
            if (err) err.textContent = message ? `Warning: ${message}` : '';
        }

        function showForgotError(message) {
            const err = document.getElementById('forgot-error');
            if (err) err.textContent = message ? `Warning: ${message}` : '';
        }

        function setForgotVerifiedState(profile) {
            verifiedResetGoogleProfile = profile || null;
            const verified = !!verifiedResetGoogleProfile;
            const googleConfigured = isGoogleConfigured();
            if (forgotNewPasswordInput) forgotNewPasswordInput.disabled = !verified;
            if (forgotConfirmInput) forgotConfirmInput.disabled = !verified;
            if (forgotSubmitBtn) forgotSubmitBtn.disabled = !verified;
            if (forgotGoogleVerifyBtn) {
                forgotGoogleVerifyBtn.disabled = false;
                forgotGoogleVerifyBtn.setAttribute('aria-disabled', googleConfigured ? 'false' : 'true');
            }
            if (forgotGoogleNote) {
                forgotGoogleNote.textContent = verified
                    ? `Verified: ${verifiedResetGoogleProfile.email}`
                    : (googleConfigured
                        ? 'Google verification required.'
                        : 'Set Google Client ID to enable verification.');
                const noteState = verified ? 'is-good' : (googleConfigured ? '' : 'is-warn');
                forgotGoogleNote.className = `auth-field-note ${noteState}`.trim();
            }
        }

        function resetForgotModalState() {
            if (forgotIdentifierInput) forgotIdentifierInput.value = '';
            if (forgotNewPasswordInput) forgotNewPasswordInput.value = '';
            if (forgotConfirmInput) forgotConfirmInput.value = '';
            const errEl = document.getElementById('forgot-error');
            if (errEl) errEl.textContent = '';
            setForgotVerifiedState(null);
        }

        function openForgotModal() {
            if (!forgotOverlay) return;
            resetForgotModalState();
            forgotOverlay.classList.remove('hidden');
            if (forgotIdentifierInput) forgotIdentifierInput.focus();
            scheduleGoogleButtonRender(80);
        }

        function closeForgotModal() {
            if (!forgotOverlay) return;
            forgotOverlay.classList.add('hidden');
            resetForgotModalState();
        }

        async function completeGoogleLogin(profile) {
            const safeProfile = normalizeGoogleProfile(profile);
            if (!safeProfile || !safeProfile.email || !safeProfile.sub) {
                showLoginError('Google account details are incomplete.');
                return;
            }

            const result = Auth.loginWithGoogle(safeProfile);
            if (!result.success) {
                showLoginError(result.error);
                return;
            }

            if (typeof Social !== 'undefined' && Social && typeof Social.bootstrapNetworkSession === 'function') {
                const netPassword = typeof Auth.getNetworkPassword === 'function'
                    ? Auth.getNetworkPassword('')
                    : '';
                const mode = result.isNew ? 'register' : 'login';
                await Social.bootstrapNetworkSession(result.user.username, netPassword, mode);
                await syncNetworkCheckpointToLocal();
            }

            showLoginError('');
            Audio.playSFX('levelup');
            stopAuthWelcomeRotation();
            showMenuScreen();
        }

        function completeForgotGoogleVerification(profile) {
            const safeProfile = normalizeGoogleProfile(profile);
            const identifier = (forgotIdentifierInput?.value || '').trim();
            if (!identifier) {
                showForgotError('Enter username or email first.');
                setForgotVerifiedState(null);
                return;
            }
            if (!safeProfile || !safeProfile.email || !safeProfile.sub) {
                showForgotError('Google account details are incomplete.');
                setForgotVerifiedState(null);
                return;
            }

            setForgotVerifiedState(safeProfile);
            showForgotError('');
        }

        function handleGoogleCredential(response) {
            const profile = normalizeGoogleProfile(decodeJwtPayload(response?.credential));
            if (!profile || !profile.email || !profile.sub) {
                const message = 'Google verification failed. Please try again.';
                if (googleCredentialOverride?.onError) {
                    googleCredentialOverride.onError(message);
                    googleCredentialOverride = null;
                    return;
                }
                if (isForgotModalOpen()) {
                    showForgotError(message);
                    setForgotVerifiedState(null);
                } else {
                    showLoginError(message);
                }
                return;
            }

            if (googleCredentialOverride?.onSuccess) {
                const override = googleCredentialOverride;
                googleCredentialOverride = null;
                override.onSuccess(profile);
                return;
            }

            if (isForgotModalOpen()) {
                completeForgotGoogleVerification(profile);
                return;
            }

            completeGoogleLogin(profile).catch(() => {
                showLoginError('Could not finish Google login.');
            });
        }

        function ensureGoogleIdentityInitialized() {
            if (!isGoogleConfigured()) return false;
            if (!window.google?.accounts?.id || typeof window.google.accounts.id.initialize !== 'function') return false;

            const configuredClientId = readGoogleClientId();
            if (googleIdentityClientId === configuredClientId) return true;

            window.google.accounts.id.initialize({
                client_id: configuredClientId,
                callback: handleGoogleCredential,
                auto_select: false,
                cancel_on_tap_outside: false,
                use_fedcm_for_prompt: true,
            });
            googleIdentityClientId = configuredClientId;
            return true;
        }

        function renderGoogleButton(target, renderedFor) {
            if (!target || !window.google?.accounts?.id || typeof window.google.accounts.id.renderButton !== 'function') {
                return false;
            }

            const width = Math.max(240, Math.min(420, Math.round(target.getBoundingClientRect().width || 360)));
            target.innerHTML = '';
            window.google.accounts.id.renderButton(target, {
                type: 'standard',
                theme: 'filled_black',
                size: 'large',
                text: 'continue_with',
                shape: 'pill',
                logo_alignment: 'left',
                width,
            });
            target.dataset.googleRenderedFor = renderedFor;
            return true;
        }

        function renderGoogleButtons() {
            const configured = isGoogleConfigured();
            if (!configured) {
                if (googleLoginRendered) googleLoginRendered.textContent = '';
                if (forgotGoogleRendered) forgotGoogleRendered.textContent = '';
                if (googleLoginBtn) googleLoginBtn.classList.remove('hidden');
                if (forgotGoogleVerifyBtn) forgotGoogleVerifyBtn.classList.remove('hidden');
                return;
            }

            if (!hasGoogleSDK() || !window.google?.accounts?.id?.renderButton) {
                if (googleLoginRendered) googleLoginRendered.textContent = 'Loading Google sign-in...';
                if (isForgotModalOpen() && forgotGoogleRendered) {
                    forgotGoogleRendered.textContent = 'Loading Google verification...';
                }
                if (googleRenderAttempts < 20) {
                    googleRenderAttempts += 1;
                    scheduleGoogleButtonRender(500);
                } else {
                    if (googleLoginBtn) googleLoginBtn.classList.remove('hidden');
                    if (forgotGoogleVerifyBtn) forgotGoogleVerifyBtn.classList.remove('hidden');
                }
                return;
            }

            try {
                if (!ensureGoogleIdentityInitialized()) return;
                const renderedFor = readGoogleClientId();
                googleRenderAttempts = 0;

                if (googleLoginRendered && googleLoginRendered.dataset.googleRenderedFor !== renderedFor) {
                    renderGoogleButton(googleLoginRendered, renderedFor);
                }

                if (isForgotModalOpen() && forgotGoogleRendered && forgotGoogleRendered.dataset.googleRenderedFor !== renderedFor) {
                    renderGoogleButton(forgotGoogleRendered, renderedFor);
                }

                if (googleLoginBtn) googleLoginBtn.classList.add('hidden');
                if (forgotGoogleVerifyBtn) forgotGoogleVerifyBtn.classList.add('hidden');
            } catch (_err) {
                if (googleLoginBtn) googleLoginBtn.classList.remove('hidden');
                if (forgotGoogleVerifyBtn) forgotGoogleVerifyBtn.classList.remove('hidden');
            }
        }

        function scheduleGoogleButtonRender(delay = 0) {
            if (googleRenderRetryTimer) clearTimeout(googleRenderRetryTimer);
            googleRenderRetryTimer = setTimeout(renderGoogleButtons, delay);
        }

        function requestGoogleProfile(onSuccess, onError) {
            if (!isGoogleConfigured()) {
                onError('Google login is not configured. Add your Google Client ID first.');
                if (googleClientIdSetup) googleClientIdSetup.classList.remove('hidden');
                if (googleClientIdInput) googleClientIdInput.focus();
                return;
            }
            if (!hasGoogleSDK()) {
                onError('Google SDK is not loaded yet. Reload and try again.');
                return;
            }

            if (window.google?.accounts?.id && typeof window.google.accounts.id.prompt === 'function') {
                try {
                    if (!ensureGoogleIdentityInitialized()) {
                        onError('Could not initialize Google sign-in.');
                        return;
                    }
                    googleCredentialOverride = { onSuccess, onError };
                    window.google.accounts.id.prompt((notification) => {
                        if (!googleCredentialOverride) return;
                        const wasBlocked = notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.();
                        const wasClosed = notification?.isDismissedMoment?.();
                        if (wasBlocked || wasClosed) {
                            const origin = window.location.origin || 'this site';
                            googleCredentialOverride = null;
                            onError(`Google prompt was blocked or closed. Use the Google button instead, and confirm ${origin} is allowed in Google Cloud.`);
                        }
                    });
                    return;
                } catch (_idErr) {
                    googleCredentialOverride = null;
                }
            }

            onError(`Could not start Google sign-in flow in this browser. Use localhost or an allowed LAN origin (${window.location.origin}).`);
        }

        function refreshGoogleAuthUI() {
            const configured = isGoogleConfigured();
            if (googleLoginBtn) {
                googleLoginBtn.disabled = false;
                googleLoginBtn.setAttribute('aria-disabled', configured ? 'false' : 'true');
            }
            if (forgotGoogleVerifyBtn) {
                forgotGoogleVerifyBtn.disabled = false;
                forgotGoogleVerifyBtn.setAttribute('aria-disabled', configured ? 'false' : 'true');
            }

            if (googleLoginNote) {
                if (configured) {
                    googleLoginNote.textContent = 'Use your Google account for quick login.';
                    googleLoginNote.className = 'auth-field-note';
                } else {
                    googleLoginNote.textContent = 'Set your Google Client ID below to enable Google sign-in.';
                    googleLoginNote.className = 'auth-field-note is-warn';
                }
            }

            if (googleClientIdSetup) {
                googleClientIdSetup.classList.toggle('hidden', configured);
            }

            if (!configured && googleClientIdInput && !googleClientIdInput.value) {
                googleClientIdInput.value = '';
            }

            setForgotVerifiedState(null);
            scheduleGoogleButtonRender(0);
        }

        function switchToLogin() {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            indicator.classList.remove('right');
            clearAuthErrors();
            updateAuthWelcome(true);
        }

        function switchToRegister() {
            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            indicator.classList.add('right');
            clearAuthErrors();
            updateRegisterUsernameFeedback();
            updateRegisterPasswordFeedback();
        }

        // Tab buttons
        tabLogin.addEventListener('click', switchToLogin);
        tabRegister.addEventListener('click', switchToRegister);

        // Text link switchers
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            switchToRegister();
        });

        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            switchToLogin();
        });

        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                openForgotModal();
            });
        }

        if (forgotCancelBtn) {
            forgotCancelBtn.addEventListener('click', () => {
                closeForgotModal();
            });
        }

        if (forgotOverlay) {
            forgotOverlay.addEventListener('click', (e) => {
                if (e.target === forgotOverlay) closeForgotModal();
            });
        }

        if (forgotGoogleVerifyBtn) {
            forgotGoogleVerifyBtn.addEventListener('click', () => {
                const identifier = (forgotIdentifierInput?.value || '').trim();
                if (!isGoogleConfigured()) {
                    const errEl = document.getElementById('forgot-error');
                    if (errEl) errEl.textContent = 'Warning: Add your Google Client ID on the sign-in screen first.';
                    return;
                }
                if (!identifier) {
                    const errEl = document.getElementById('forgot-error');
                    if (errEl) errEl.textContent = 'Warning: Enter username or email first.';
                    return;
                }
                requestGoogleProfile(
                    (profile) => {
                        setForgotVerifiedState(profile);
                        const errEl = document.getElementById('forgot-error');
                        if (errEl) errEl.textContent = '';
                    },
                    (message) => {
                        const errEl = document.getElementById('forgot-error');
                        if (errEl) errEl.textContent = `Warning: ${message}`;
                        setForgotVerifiedState(null);
                    }
                );
            });
        }

        if (forgotSubmitBtn) {
            forgotSubmitBtn.addEventListener('click', () => {
                const identifier = (forgotIdentifierInput?.value || '').trim();
                const password = forgotNewPasswordInput?.value || '';
                const confirm = forgotConfirmInput?.value || '';
                const errEl = document.getElementById('forgot-error');
                if (!identifier) {
                    if (errEl) errEl.textContent = 'Warning: Enter username or email.';
                    return;
                }
                if (!verifiedResetGoogleProfile) {
                    if (errEl) errEl.textContent = 'Warning: Verify with Google first.';
                    return;
                }
                if (!password || password.length < 4) {
                    if (errEl) errEl.textContent = 'Warning: Password must be at least 4 characters.';
                    return;
                }
                if (password !== confirm) {
                    if (errEl) errEl.textContent = 'Warning: Passwords do not match.';
                    return;
                }
                const result = Auth.resetPasswordWithGoogle(identifier, verifiedResetGoogleProfile, password);
                if (!result.success) {
                    if (errEl) errEl.textContent = `Warning: ${result.error}`;
                    return;
                }
                if (errEl) errEl.textContent = 'Password reset complete. You can now sign in.';
                setTimeout(() => closeForgotModal(), 450);
            });
        }

        // Login submit
        document.getElementById('login-btn').addEventListener('click', async () => {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const loginBtn = document.getElementById('login-btn');
            if (!loginBtn || loginBtn.classList.contains('is-loading')) return;
            const restoreBtn = withLoadingButton(loginBtn, 'Signing In');
            try {
                const result = Auth.login(username, password);
                if (result.success) {
                    if (typeof Social !== 'undefined' && Social && typeof Social.bootstrapNetworkSession === 'function') {
                        const netPassword = typeof Auth.getNetworkPassword === 'function'
                            ? Auth.getNetworkPassword(password)
                            : password;
                        await Social.bootstrapNetworkSession(result.user.username, netPassword, 'login');
                        await syncNetworkCheckpointToLocal();
                    }
                    Audio.playSFX('levelup');
                    stopAuthWelcomeRotation();
                    showMenuScreen();
                } else {
                    const err = document.getElementById('login-error');
                    err.textContent = 'Warning: ' + result.error;
                    err.style.animation = 'none';
                    requestAnimationFrame(() => { err.style.animation = ''; });
                }
            } finally {
                restoreBtn();
            }
        });
        // Register submit
        document.getElementById('register-btn').addEventListener('click', async () => {
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirm  = document.getElementById('reg-confirm').value;
            if (password !== confirm) {
                document.getElementById('register-error').textContent = 'Warning: Passwords do not match';
                return;
            }
            const registerBtn = document.getElementById('register-btn');
            if (!registerBtn || registerBtn.classList.contains('is-loading')) return;
            const restoreBtn = withLoadingButton(registerBtn, 'Creating Account');
            try {
                const result = Auth.register(username, password, email);
                if (result.success) {
                    const loginResult = Auth.login(username, password);
                    if (loginResult.success) {
                        if (typeof Social !== 'undefined' && Social && typeof Social.bootstrapNetworkSession === 'function') {
                            const netPassword = typeof Auth.getNetworkPassword === 'function'
                                ? Auth.getNetworkPassword(password)
                                : password;
                            await Social.bootstrapNetworkSession(loginResult.user.username, netPassword, 'register');
                            await syncNetworkCheckpointToLocal();
                        }
                        Audio.playSFX('levelup');
                        stopAuthWelcomeRotation();
                        showMenuScreen();
                    }
                } else {
                    document.getElementById('register-error').textContent = 'Warning: ' + result.error;
                }
            } finally {
                restoreBtn();
            }
        });

        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', async () => {
                if (!isGoogleConfigured()) {
                    if (googleClientIdSetup) googleClientIdSetup.classList.remove('hidden');
                    if (googleClientIdInput) googleClientIdInput.focus();
                    const err = document.getElementById('login-error');
                    if (err) err.textContent = 'Warning: Add your Google Client ID first.';
                    return;
                }
                const restoreBtn = withLoadingButton(googleLoginBtn, 'Connecting Google');
                try {
                    await new Promise((resolve) => {
                        requestGoogleProfile(
                            async (profile) => {
                                const result = Auth.loginWithGoogle(profile);
                                if (!result.success) {
                                    const err = document.getElementById('login-error');
                                    if (err) err.textContent = `Warning: ${result.error}`;
                                    resolve();
                                    return;
                                }

                                if (typeof Social !== 'undefined' && Social && typeof Social.bootstrapNetworkSession === 'function') {
                                    const netPassword = typeof Auth.getNetworkPassword === 'function'
                                        ? Auth.getNetworkPassword('')
                                        : '';
                                    const mode = result.isNew ? 'register' : 'login';
                                    await Social.bootstrapNetworkSession(result.user.username, netPassword, mode);
                                    await syncNetworkCheckpointToLocal();
                                }

                                const err = document.getElementById('login-error');
                                if (err) err.textContent = '';
                                Audio.playSFX('levelup');
                                stopAuthWelcomeRotation();
                                showMenuScreen();
                                resolve();
                            },
                            (message) => {
                                const err = document.getElementById('login-error');
                                if (err) err.textContent = `Warning: ${message}`;
                                resolve();
                            }
                        );
                    });
                } finally {
                    restoreBtn();
                }
            });
        }

        // Enter key support
        ['login-username', 'login-password'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('login-btn').click();
            });
        });

        ['reg-username', 'reg-email', 'reg-password', 'reg-confirm'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('register-btn').click();
            });
        });

        ['forgot-identifier', 'forgot-new-password', 'forgot-confirm-password'].forEach((id) => {
            const field = document.getElementById(id);
            if (!field) return;
            field.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                if (id === 'forgot-identifier') {
                    forgotGoogleVerifyBtn?.click();
                } else {
                    forgotSubmitBtn?.click();
                }
            });
        });

        const fieldHints = {
            'login-username': 'Tip: Use the exact username you registered with.',
            'login-password': 'Tip: Passwords are case sensitive.',
            'reg-username': 'Tip: Keep usernames simple so friends can find you quickly.',
            'reg-email': 'Tip: Use your Gmail address for recovery and Google verification.',
            'reg-password': 'Tip: Use at least 4 characters for secure access.',
            'reg-confirm': 'Tip: Confirm password to avoid login errors later.',
        };

        Object.entries(fieldHints).forEach(([id, hint]) => {
            const field = document.getElementById(id);
            if (!field) return;
            field.addEventListener('focus', () => {
                const motdEl = document.getElementById('auth-motd');
                if (!motdEl) return;
                motdEl.textContent = hint;
                motdEl.dataset.lastMessage = hint;
            });
            field.addEventListener('blur', () => updateAuthWelcome(true));
        });

        if (regUsernameInput) {
            regUsernameInput.addEventListener('input', updateRegisterUsernameFeedback);
            regUsernameInput.addEventListener('blur', updateRegisterUsernameFeedback);
        }
        if (regEmailInput) {
            regEmailInput.addEventListener('focus', () => {
                const motdEl = document.getElementById('auth-motd');
                if (!motdEl) return;
                motdEl.textContent = 'Tip: Email is required for Google verification and password recovery.';
                motdEl.dataset.lastMessage = motdEl.textContent;
            });
            regEmailInput.addEventListener('blur', () => updateAuthWelcome(true));
        }
        if (regPasswordInput) {
            regPasswordInput.addEventListener('input', updateRegisterPasswordFeedback);
            regPasswordInput.addEventListener('blur', updateRegisterPasswordFeedback);
        }
        if (regConfirmInput) {
            regConfirmInput.addEventListener('input', updateRegisterPasswordFeedback);
            regConfirmInput.addEventListener('blur', updateRegisterPasswordFeedback);
        }

        if (googleClientIdSaveBtn && googleClientIdInput) {
            const saveGoogleClientId = () => {
                const value = String(googleClientIdInput.value || '').trim();
                if (!value) {
                    localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
                    googleClientId = readGoogleClientId();
                    const err = document.getElementById('login-error');
                    if (err) err.textContent = 'Google Client ID reset to default.';
                    refreshGoogleAuthUI();
                    return;
                }
                localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, value);
                googleClientId = value;
                const err = document.getElementById('login-error');
                if (err) err.textContent = '';
                refreshGoogleAuthUI();
            };

            googleClientIdSaveBtn.addEventListener('click', saveGoogleClientId);
            googleClientIdInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                saveGoogleClientId();
            });
        }

        if (toggleGoogleSetupBtn && googleClientIdSetup) {
            toggleGoogleSetupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                googleClientIdSetup.classList.toggle('hidden');
            });
        }

        const currentClientId = readGoogleClientId();
        if (googleClientIdInput) googleClientIdInput.value = currentClientId;
        refreshGoogleAuthUI();
        updateAuthWelcome(true);
        updateRegisterUsernameFeedback();
        updateRegisterPasswordFeedback();
    }

    function clearAuthErrors() {
        const loginErr = document.getElementById('login-error');
        const registerErr = document.getElementById('register-error');
        const forgotErr = document.getElementById('forgot-error');
        if (loginErr) loginErr.textContent = '';
        if (registerErr) registerErr.textContent = '';
        if (forgotErr) forgotErr.textContent = '';
    }

    function resetAuthForms() {
        const fieldIds = [
            'login-username',
            'login-password',
            'reg-username',
            'reg-email',
            'reg-password',
            'reg-confirm',
            'forgot-identifier',
            'forgot-new-password',
            'forgot-confirm-password',
        ];

        fieldIds.forEach((id) => {
            const field = document.getElementById(id);
            if (!field) return;
            field.value = '';
        });

        const forgotOverlay = document.getElementById('forgot-overlay');
        if (forgotOverlay) forgotOverlay.classList.add('hidden');

        const forgotNewPassword = document.getElementById('forgot-new-password');
        const forgotConfirmPassword = document.getElementById('forgot-confirm-password');
        const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
        const forgotGoogleNote = document.getElementById('forgot-google-note');

        if (forgotNewPassword) forgotNewPassword.disabled = true;
        if (forgotConfirmPassword) forgotConfirmPassword.disabled = true;
        if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;
        if (forgotGoogleNote) {
            const googleClientIdMeta = document.querySelector('meta[name="shadow-google-client-id"]');
            const storedClientId = String(localStorage.getItem('shadow_google_client_id') || '').trim();
            const configured = !!(storedClientId || (googleClientIdMeta?.content || '').trim());
            forgotGoogleNote.textContent = configured
                ? 'Google verification required.'
                : 'Set Google Client ID to enable verification.';
            forgotGoogleNote.className = `auth-field-note ${configured ? '' : 'is-warn'}`.trim();
        }
        const forgotGoogleVerifyBtn = document.getElementById('forgot-google-verify-btn');
        if (forgotGoogleVerifyBtn) {
            const metaClientId = String(document.querySelector('meta[name="shadow-google-client-id"]')?.content || '').trim();
            const storedClientId = String(localStorage.getItem('shadow_google_client_id') || '').trim();
            forgotGoogleVerifyBtn.disabled = false;
            forgotGoogleVerifyBtn.setAttribute('aria-disabled', metaClientId || storedClientId ? 'false' : 'true');
        }
        const googleClientIdSetup = document.getElementById('google-clientid-setup');
        if (googleClientIdSetup) {
            const hasStored = !!String(localStorage.getItem('shadow_google_client_id') || '').trim();
            const hasMeta = !!String(document.querySelector('meta[name="shadow-google-client-id"]')?.content || '').trim();
            googleClientIdSetup.classList.toggle('hidden', hasStored || hasMeta);
        }

        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const indicator = document.getElementById('auth-tab-indicator');

        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (tabLogin) tabLogin.classList.add('active');
        if (tabRegister) tabRegister.classList.remove('active');
        if (indicator) indicator.classList.remove('right');

        clearAuthErrors();
        updateRegisterUsernameFeedback();
        updateRegisterPasswordFeedback();
        updateAuthWelcome(true);
    }

    async function syncNetworkCheckpointToLocal() {
        if (typeof Social === 'undefined' || !Social || typeof Social.syncCheckpointLoad !== 'function') return;
        if (typeof Auth === 'undefined' || !Auth || typeof Auth.importCheckpoint !== 'function') return;
        const snapshot = await Social.syncCheckpointLoad();
        if (snapshot && typeof snapshot === 'object') {
            Auth.importCheckpoint(snapshot);
        }
        refreshContinueButton();
    }

    // ===== MAIN MENU =====
    function showMenuScreen() {
        switchScreen('menu-screen');
        updateMenuUserInfo(true);
        startMenuClock();
        animateMenuWelcome();
    }

    function updateMenuUserInfo(animateStats = false) {
        const user = Auth.getCurrentUser();
        if (user) {
            document.getElementById('menu-username').textContent = user.username;
            document.getElementById('user-avatar').textContent = user.username.charAt(0).toUpperCase();
            document.getElementById('menu-user-stats').textContent =
                `Best: Floor ${user.stats.bestFloor} | Score: ${Utils.formatNumber(user.stats.bestScore)} | Runs: ${user.stats.totalRuns}`;
        }
        updateMenuWelcomeCard(user, animateStats);
        refreshContinueButton();
    }

    function refreshContinueButton() {
        const continueBtn = document.getElementById('continue-btn');
        if (!continueBtn) return;
        const hasSave =
            typeof Game !== 'undefined' &&
            Game &&
            typeof Game.hasSavedRun === 'function' &&
            Game.hasSavedRun();
        continueBtn.style.display = hasSave ? 'flex' : 'none';
        continueBtn.disabled = !hasSave;
    }

    function initMenu() {
        refreshContinueButton();

        const continueBtn = document.getElementById('continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                Audio.playSFX('click');
                stopMenuClock();
                const resumed =
                    typeof Game !== 'undefined' &&
                    Game &&
                    typeof Game.continueSavedRun === 'function' &&
                    Game.continueSavedRun();
                if (!resumed) {
                    refreshContinueButton();
                    showCharSelectScreen();
                }
            });
        }

        document.getElementById('play-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            stopMenuClock();
            showCharSelectScreen();
        });

        document.getElementById('leaderboard-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            stopMenuClock();
            switchScreen('leaderboard-screen');
            Leaderboard.render('score');
        });

        document.getElementById('howtoplay-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            stopMenuClock();
            switchScreen('howtoplay-screen');
        });

        document.getElementById('settings-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            stopMenuClock();
            switchScreen('settings-screen');
        });

        const socialBtn = document.getElementById('social-btn');
        if (socialBtn) {
            socialBtn.addEventListener('click', async () => {
                Audio.playSFX('click');
                stopMenuClock();
                if (typeof Social !== 'undefined' && Social && typeof Social.openScreen === 'function') {
                    Social.openScreen();
                    await Social.refreshAll();
                }
            });
        }

        document.getElementById('logout-btn').addEventListener('click', () => {
            Auth.logout();
            if (typeof Social !== 'undefined' && Social && typeof Social.logoutNetworkSession === 'function') {
                Social.logoutNetworkSession();
            }
            stopMenuClock();
            switchScreen('auth-screen');
            startAuthWelcomeRotation();
            renderAuthLeaderboardPreview();
            refreshContinueButton();
            resetAuthForms();
        });
    }

    // ===== BACK BUTTONS =====
    function initBackButtons() {
        document.getElementById('lb-back-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showMenuScreen();
        });

        document.getElementById('htp-back-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showMenuScreen();
        });

        document.getElementById('settings-back-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showMenuScreen();
        });

        const socialBackBtn = document.getElementById('social-back-btn');
        if (socialBackBtn) {
            socialBackBtn.addEventListener('click', () => {
                Audio.playSFX('click');
                showMenuScreen();
            });
        }
    }

    // ===== PAUSE MENU =====
    function initPauseMenu() {
        document.getElementById('resume-btn').addEventListener('click', () => {
            Game.togglePause();
        });

        document.getElementById('quit-btn').addEventListener('click', () => {
            Game.quitToMenu();
            showMenuScreen();
        });
    }

    // ===== GAME OVER =====
    function initGameOver() {
        document.getElementById('retry-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showCharSelectScreen();
        });

        document.getElementById('go-menu-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showMenuScreen();
        });
    }

    // ===== SETTINGS =====
    function initSettings() {
        document.getElementById('sfx-toggle').addEventListener('change', (e) => {
            Game.updateSetting('sfx', e.target.checked);
        });

        document.getElementById('music-toggle').addEventListener('change', (e) => {
            Game.updateSetting('music', e.target.checked);
        });

        document.getElementById('shake-toggle').addEventListener('change', (e) => {
            Game.updateSetting('shake', e.target.checked);
        });

        document.getElementById('minimap-toggle').addEventListener('change', (e) => {
            Game.updateSetting('minimap', e.target.checked);
        });

        document.getElementById('particles-toggle').addEventListener('change', (e) => {
            Game.updateSetting('particles', e.target.checked);
        });

        document.getElementById('performance-toggle').addEventListener('change', (e) => {
            Game.updateSetting('performanceMode', e.target.checked);
        });

        const storyToggle = document.getElementById('story-toggle');
        if (storyToggle) {
            storyToggle.addEventListener('change', (e) => {
                Game.updateSetting('storyDialogues', e.target.checked);
            });
        }

        document.getElementById('fps-cap-select').addEventListener('change', (e) => {
            const fps = Number(e.target.value);
            Game.updateSetting('fpsCap', Number.isFinite(fps) ? fps : 60);
        });

        document.getElementById('render-scale-select').addEventListener('change', (e) => {
            const scale = Number(e.target.value);
            Game.updateSetting('renderScale', Number.isFinite(scale) ? scale : 1);
        });

        const skillKeySelect = document.getElementById('skill-key-select');
        if (skillKeySelect) {
            skillKeySelect.addEventListener('change', (e) => {
                Game.updateSetting('skillKey', e.target.value);
            });
        }
    }

    // ===== CHARACTER SELECT =====
    let selectedCharId = null;

    function showCharSelectScreen() {
        switchScreen('charselect-screen');
        selectedCharId = null;
        // reset
        document.querySelectorAll('.cs-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('cs-play-btn').disabled = true;
        // Pre-fill name from logged-in username
        const user = Auth.getCurrentUser();
        if (user) document.getElementById('cs-name-input').value = user.username;
    }

    function initCharSelect() {
        // Card selection
        document.querySelectorAll('.cs-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.cs-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedCharId = card.dataset.char;
                document.getElementById('cs-play-btn').disabled = false;
                Audio.playSFX('click');
            });
        });

        // Back button
        document.getElementById('cs-back-btn').addEventListener('click', () => {
            Audio.playSFX('click');
            showMenuScreen();
        });

        // Play button
        document.getElementById('cs-play-btn').addEventListener('click', () => {
            if (!selectedCharId) return;
            const charDef  = Characters.DEFS[selectedCharId];
            const heroName = document.getElementById('cs-name-input').value.trim() || charDef.name;
            Audio.playSFX('levelup');
            Game.startNewRun(charDef, heroName);
        });
    }

    // ===== LEVEL-UP MODAL =====
    function initLevelUp() {
        // Exposed globally so game.js can call it
        window.showLevelUpModal = function(player) {
            const overlay  = document.getElementById('levelup-overlay');
            const choicesEl = document.getElementById('levelup-choices');
            document.getElementById('levelup-num').textContent = player.level;

            const upgrades = Characters.getRandomUpgrades(player, 3);
            choicesEl.innerHTML = '';

            upgrades.forEach(upg => {
                const btn = document.createElement('div');
                btn.className = 'levelup-choice';
                btn.dataset.cat = upg.category;
                btn.innerHTML = `
                    <div class="levelup-choice-icon">${upg.icon}</div>
                    <div class="levelup-choice-text">
                        <div class="levelup-choice-name">${upg.name}</div>
                        <div class="levelup-choice-desc">${upg.desc}</div>
                    </div>
                `;
                btn.addEventListener('click', () => {
                    upg.apply(player);
                    overlay.classList.add('hidden');
                    player.pendingLevelUp = false;
                    Game.resume();
                    Audio.playSFX('pickup');
                    Particles.emitBurst(player.x, player.y, 20, player.charDef.color, 4);
                });
                choicesEl.appendChild(btn);
            });

            overlay.classList.remove('hidden');
        };
    }

    // ===== INITIALIZE EVERYTHING =====
    function initApp() {
        Game.init();
        if (typeof Story !== 'undefined' && Story && typeof Story.init === 'function') {
            Story.init();
        }
        Leaderboard.init();
        Game.loadSettings();
        if (typeof Social !== 'undefined' && Social && typeof Social.init === 'function') {
            Social.init();
        }
        enablePointerGlow(document.querySelector('.auth-card'), '50%', '22%');
        enablePointerGlow(document.querySelector('.menu-container'), '50%', '10%');
        initPasswordToggles();
        initInteractionFeedback();
        initMenuHotkeys();
        initAuth();
        initMenu();
        initBackButtons();
        initPauseMenu();
        initGameOver();
        initSettings();
        initCharSelect();
        initLevelUp();

        // Start loading
        simulateLoading();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
