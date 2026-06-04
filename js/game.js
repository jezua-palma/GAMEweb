/* ============================================
   GAME â€” Core game engine with Level/Stage system
   ============================================ */

const Game = (() => {
    let canvas, ctx;
    let running = false;
    let paused = false;
    let lastTime = 0;

    // Game state
    let player = null;
    let dungeon = null;

    // === STAGE SYSTEM ===
    // Each "Level" has 5 stages. Stage 5 = boss fight.
    const STAGES_PER_LEVEL = 5;
    let currentLevel = 1;    // Level 1, 2, 3 ...
    let currentStage = 1;    // Stage 1-5 within the level
    let totalFloor = 1;      // Absolute floor number (for difficulty)

    const LEVEL_NAMES = {
        1: 'Emerald Wilds',
        2: 'Riverfen Crossing',
        3: 'Emberwood Trail',
        4: 'Starfall Glade',
        5: 'Nightbloom Grove',
    };

    let enemies = [];
    let items   = [];
    let boss    = null;   // current boss (stage 5 only)
    let camera = { x: 0, y: 0 };
    let screenShake = 0;
    let runSeed = 0;

    // Combat director state (intensity + reward pacing)
    let stageTimer = 0;
    let pressureLevel = 1;
    let comboCount = 0;
    let comboTimer = 0;
    const COMBO_WINDOW = 3.0;
    let stairLockHintCooldown = 0;
    const AUTOSAVE_INTERVAL = 12;
    let autosaveTimer = 0;
    let activeEvent = null;
    let handledEventRooms = new Set();
    let roomClearNotified = new Set();
    let lastRoomKey = '';
    let combatToastTimer = 0;
    const COMBAT_TOAST_DURATION = 1.55;
    let presenceSyncTimer = 0;
    const PRESENCE_SYNC_INTERVAL = 1.5;
    let partySyncTimer = 0;
    let partySyncInFlight = false;
    let partyLiveSnapshot = null;
    const PARTY_SYNC_INTERVAL = 0.95;
    const PARTY_MEMBER_STALE_SECONDS = 12;
    let coopMode = false;
    let coopIsLeader = false;
    let coopPartyId = 0;
    let coopStateVersion = 0;
    let coopPushTimer = 0;
    let coopPullTimer = 0;
    let coopPushInFlight = false;
    let coopPullInFlight = false;
    let coopStageSeed = 0;
    let coopHitInFlight = new Set();
    let coopLootClaims = new Map();
    const COOP_PUSH_INTERVAL = 0.28;
    const COOP_PULL_INTERVAL = 0.24;
    const eventUi = {
        overlay: null,
        chip: null,
        title: null,
        desc: null,
        options: null,
    };
    const combatToastUi = {
        root: null,
    };
    const partyLiveUi = {
        panel: null,
        title: null,
        list: null,
    };

    // Settings
    let settings = {
        sfx: true,
        music: true,
        shake: true,
        minimap: true,
        particles: true,
        performanceMode: false,
        fpsCap: 60,
        renderScale: 1,
        storyDialogues: true,
    };

    // Input state
    const keys = {};
    let mouseX = 0, mouseY = 0;
    let mouseDown = false;
    const TOUCH_DEADZONE = 0.16;
    const TOUCH_AIM_DEADZONE = 0.06;
    const TOUCH_AIM_DISTANCE = 215;
    const TOUCH_SMOOTH_RATE = 14;
    const TOUCH_STICK_CURVE = 1.18;
    const touchState = {
        enabled: false,
        pointerId: null,
        moveX: 0,
        moveY: 0,
        smoothMoveX: 0,
        smoothMoveY: 0,
        attackHeld: false,
    };
    const touchControls = {
        root: null,
        stickBase: null,
        stickThumb: null,
        attackBtn: null,
        dashBtn: null,
        useBtn: null,
        pauseBtn: null,
    };
    let touchAttackPulseTimer = 0;
    let touchDashPulseTimer = 0;
    let touchUsePulseTimer = 0;
    let touchHapticCooldown = 0;
    let hitStopTimer = 0;
    let hitStopStrength = 0;
    let impactFlashTimer = 0;
    let impactFlashStrength = 0;
    let impactFlashRGB = '125, 211, 252';

    function isTypingInField() {
        const active = document.activeElement;
        if (!active) return false;
        const tag = active.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
    }

    function isStoryBlocking() {
        return typeof Story !== 'undefined' &&
            Story &&
            typeof Story.isBlocking === 'function' &&
            Story.isBlocking();
    }

    function isEventBlocking() {
        return !!activeEvent;
    }

    function isModalBlocking() {
        return isStoryBlocking() || isEventBlocking();
    }

    function isTouchDevice() {
        return (typeof window !== 'undefined' && 'ontouchstart' in window) ||
            (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) ||
            (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
    }

    function setTouchButtonPressed(button, pressed) {
        if (!button) return;
        button.classList.toggle('is-held', !!pressed);
    }

    function pulseTouchButton(type, duration = 0.16) {
        const clamped = Utils.clamp(Number(duration) || 0.16, 0.08, 0.35);
        if (type === 'attack') {
            touchAttackPulseTimer = Math.max(touchAttackPulseTimer, clamped);
        } else if (type === 'dash') {
            touchDashPulseTimer = Math.max(touchDashPulseTimer, clamped);
        } else if (type === 'use') {
            touchUsePulseTimer = Math.max(touchUsePulseTimer, clamped);
        }
    }

    function updateTouchButtonVisuals(dt) {
        if (!touchState.enabled) return;

        touchAttackPulseTimer = Math.max(0, touchAttackPulseTimer - dt);
        touchDashPulseTimer = Math.max(0, touchDashPulseTimer - dt);
        touchUsePulseTimer = Math.max(0, touchUsePulseTimer - dt);
        touchHapticCooldown = Math.max(0, touchHapticCooldown - dt);

        if (touchControls.attackBtn) {
            touchControls.attackBtn.classList.toggle('is-pulse', touchAttackPulseTimer > 0);
            touchControls.attackBtn.classList.toggle('is-ready', !!player && player.alive);
        }
        if (touchControls.dashBtn) {
            const dashReady = !!player && player.alive && player.dashCooldown <= 0;
            touchControls.dashBtn.classList.toggle('is-ready', dashReady);
            touchControls.dashBtn.classList.toggle('is-pulse', touchDashPulseTimer > 0);
        }
        if (touchControls.useBtn) {
            const useReady = !!player && player.alive && !!player.heldItem;
            touchControls.useBtn.classList.toggle('is-ready', useReady);
            touchControls.useBtn.classList.toggle('is-pulse', touchUsePulseTimer > 0);
        }
    }

    function triggerTouchHaptics(pattern = 8) {
        if (!touchState.enabled) return;
        if (touchHapticCooldown > 0) return;
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
        navigator.vibrate(pattern);
        touchHapticCooldown = 0.06;
    }

    function resetTouchStick() {
        touchState.moveX = 0;
        touchState.moveY = 0;
        touchState.smoothMoveX = 0;
        touchState.smoothMoveY = 0;
        if (touchControls.stickBase) {
            touchControls.stickBase.classList.remove('is-active');
        }
        if (touchControls.stickThumb) {
            touchControls.stickThumb.style.transform = 'translate(-50%, -50%)';
        }
    }

    function setTouchControlsVisible(visible) {
        if (!touchControls.root) return;
        const shouldShow = !!visible && touchState.enabled;
        touchControls.root.classList.toggle('hidden', !shouldShow);
        const hudRoot = document.getElementById('game-hud');
        if (hudRoot) {
            hudRoot.classList.toggle('touch-active', shouldShow);
        }
        if (!shouldShow) {
            touchState.attackHeld = false;
            touchState.pointerId = null;
            setTouchButtonPressed(touchControls.attackBtn, false);
            setTouchButtonPressed(touchControls.dashBtn, false);
            setTouchButtonPressed(touchControls.useBtn, false);
            setTouchButtonPressed(touchControls.pauseBtn, false);
            touchAttackPulseTimer = 0;
            touchDashPulseTimer = 0;
            touchUsePulseTimer = 0;
            resetTouchStick();
        }
    }

    function getTouchMoveVector(dt = 0.016) {
        const rawMag = Math.hypot(touchState.moveX, touchState.moveY);
        let targetX = 0;
        let targetY = 0;

        if (rawMag > TOUCH_DEADZONE) {
            const nx = touchState.moveX / rawMag;
            const ny = touchState.moveY / rawMag;
            const linear = Utils.clamp((rawMag - TOUCH_DEADZONE) / (1 - TOUCH_DEADZONE), 0, 1);
            const curved = Math.pow(linear, TOUCH_STICK_CURVE);
            targetX = nx * curved;
            targetY = ny * curved;
        }

        const smoothAlpha = Utils.clamp(dt * TOUCH_SMOOTH_RATE, 0, 1);
        touchState.smoothMoveX = Utils.lerp(touchState.smoothMoveX, targetX, smoothAlpha);
        touchState.smoothMoveY = Utils.lerp(touchState.smoothMoveY, targetY, smoothAlpha);

        return { x: touchState.smoothMoveX, y: touchState.smoothMoveY };
    }

    function applyTouchAimFromMove(moveX = touchState.smoothMoveX, moveY = touchState.smoothMoveY) {
        if (Math.abs(moveX) < TOUCH_AIM_DEADZONE && Math.abs(moveY) < TOUCH_AIM_DEADZONE) return;
        mouseX = moveX * TOUCH_AIM_DISTANCE;
        mouseY = moveY * TOUCH_AIM_DISTANCE;
    }

    function collectAttackTargets() {
        const targets = [];
        for (const enemy of enemies) {
            if (enemy && enemy.alive) targets.push(enemy);
        }
        if (boss && boss.alive) targets.push(boss);
        return targets;
    }

    function updateTouchStickFromPointer(e) {
        if (!touchControls.stickBase || !touchControls.stickThumb) return;
        const rect = touchControls.stickBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const radius = Math.max(24, rect.width / 2 - 12);
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(radius, dist);
        const angle = Math.atan2(dy, dx);
        const nx = dist === 0 ? 0 : Math.cos(angle) * (clampedDist / radius);
        const ny = dist === 0 ? 0 : Math.sin(angle) * (clampedDist / radius);

        touchState.moveX = nx;
        touchState.moveY = ny;
        touchControls.stickThumb.style.transform = `translate(calc(-50% + ${Math.round(nx * radius)}px), calc(-50% + ${Math.round(ny * radius)}px))`;
    }

    function bindTouchButton(button, onPress, onRelease) {
        if (!button) return;
        button.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (button.setPointerCapture) button.setPointerCapture(e.pointerId);
            setTouchButtonPressed(button, true);
            if (typeof onPress === 'function') onPress();
        });
        const release = (e) => {
            if (e) e.preventDefault();
            setTouchButtonPressed(button, false);
            if (typeof onRelease === 'function') onRelease();
        };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
    }

    function initTouchControls() {
        touchControls.root = document.getElementById('touch-controls');
        touchControls.stickBase = document.getElementById('touch-stick-base');
        touchControls.stickThumb = document.getElementById('touch-stick-thumb');
        touchControls.attackBtn = document.getElementById('touch-attack-btn');
        touchControls.dashBtn = document.getElementById('touch-dash-btn');
        touchControls.useBtn = document.getElementById('touch-use-btn');
        touchControls.pauseBtn = document.getElementById('touch-pause-btn');

        touchState.enabled = isTouchDevice();
        if (!touchState.enabled || !touchControls.root) {
            setTouchControlsVisible(false);
            return;
        }

        if (touchControls.stickBase) {
            touchControls.stickBase.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                touchState.pointerId = e.pointerId;
                if (touchControls.stickBase.setPointerCapture) touchControls.stickBase.setPointerCapture(e.pointerId);
                touchControls.stickBase.classList.add('is-active');
                updateTouchStickFromPointer(e);
            });
            touchControls.stickBase.addEventListener('pointermove', (e) => {
                if (touchState.pointerId !== e.pointerId) return;
                e.preventDefault();
                updateTouchStickFromPointer(e);
            });
            const releaseStick = (e) => {
                if (e && touchState.pointerId !== null && e.pointerId !== touchState.pointerId) return;
                touchState.pointerId = null;
                touchControls.stickBase.classList.remove('is-active');
                resetTouchStick();
            };
            touchControls.stickBase.addEventListener('pointerup', releaseStick);
            touchControls.stickBase.addEventListener('pointercancel', releaseStick);
            touchControls.stickBase.addEventListener('lostpointercapture', () => {
                touchState.pointerId = null;
                touchControls.stickBase.classList.remove('is-active');
                resetTouchStick();
            });
        }

        bindTouchButton(
            touchControls.attackBtn,
            () => {
                if (!running || paused || !player || isModalBlocking()) return;
                touchState.attackHeld = true;
                const stick = getTouchMoveVector(0.02);
                applyTouchAimFromMove(stick.x, stick.y);
                player.attack(collectAttackTargets());
                pulseTouchButton('attack', 0.12);
            },
            () => { touchState.attackHeld = false; }
        );

        bindTouchButton(touchControls.dashBtn, () => {
            if (!running || paused || !player || isModalBlocking()) return;
            const stick = getTouchMoveVector(0.02);
            applyTouchAimFromMove(stick.x, stick.y);
            const dashed = player.dash();
            if (dashed) pulseTouchButton('dash', 0.16);
        });

        bindTouchButton(touchControls.useBtn, () => {
            if (!running || paused || !player || isModalBlocking()) return;
            const interacted = tryInteract();
            if (!interacted) player.useItem();
            pulseTouchButton('use', 0.16);
        });

        bindTouchButton(touchControls.pauseBtn, () => {
            if (!running || isModalBlocking()) return;
            togglePause();
        });

        setTouchControlsVisible(false);
    }

    function resetInputState() {
        Object.keys(keys).forEach((k) => { keys[k] = false; });
        mouseDown = false;
        touchState.attackHeld = false;
        touchState.pointerId = null;
        touchState.smoothMoveX = 0;
        touchState.smoothMoveY = 0;
        touchAttackPulseTimer = 0;
        touchDashPulseTimer = 0;
        touchUsePulseTimer = 0;
        touchHapticCooldown = 0;
        resetTouchStick();
    }

    function initEventUI() {
        eventUi.overlay = document.getElementById('event-overlay');
        eventUi.chip = document.getElementById('event-chip');
        eventUi.title = document.getElementById('event-title');
        eventUi.desc = document.getElementById('event-desc');
        eventUi.options = document.getElementById('event-options');

        if (eventUi.overlay) {
            eventUi.overlay.classList.add('hidden');
            eventUi.overlay.addEventListener('click', (event) => {
                if (!activeEvent) return;
                if (event.target !== eventUi.overlay) return;
                closeStageEvent();
            });
        }
    }

    function initCombatToastUI() {
        combatToastUi.root = document.getElementById('combat-toast');
        if (combatToastUi.root) {
            combatToastUi.root.classList.add('hidden');
            combatToastUi.root.classList.remove('show', 'good', 'warn', 'danger');
        }
    }

    function hideCombatToast() {
        combatToastTimer = 0;
        if (!combatToastUi.root) return;
        combatToastUi.root.classList.remove('show', 'good', 'warn', 'danger');
        combatToastUi.root.classList.add('hidden');
    }

    function showCombatToast(text, tone = 'info') {
        if (!combatToastUi.root) return;
        combatToastTimer = COMBAT_TOAST_DURATION;
        combatToastUi.root.textContent = text;
        combatToastUi.root.classList.remove('hidden', 'good', 'warn', 'danger');
        if (tone === 'good' || tone === 'warn' || tone === 'danger') {
            combatToastUi.root.classList.add(tone);
        }
        combatToastUi.root.classList.add('show');
    }

    function updateCombatToast(dt) {
        if (combatToastTimer <= 0) return;
        combatToastTimer = Math.max(0, combatToastTimer - dt);
        if (combatToastTimer <= 0) {
            hideCombatToast();
        }
    }

    function queueHitStop(duration = 0.02, strength = 0.55) {
        hitStopTimer = Math.max(hitStopTimer, Utils.clamp(duration, 0, 0.06));
        hitStopStrength = Math.max(hitStopStrength, Utils.clamp(strength, 0, 0.9));
    }

    function queueImpactFlash(rgb = '125, 211, 252', strength = 0.16, duration = 0.11) {
        impactFlashRGB = typeof rgb === 'string' ? rgb : '125, 211, 252';
        impactFlashStrength = Math.max(impactFlashStrength, Utils.clamp(strength, 0.03, 0.35));
        impactFlashTimer = Math.max(impactFlashTimer, Utils.clamp(duration, 0.04, 0.22));
    }

    function consumeCombatTimeScale(rawDt) {
        impactFlashTimer = Math.max(0, impactFlashTimer - rawDt);
        if (impactFlashTimer <= 0) {
            impactFlashStrength = 0;
        }

        if (hitStopTimer <= 0) return rawDt;
        hitStopTimer = Math.max(0, hitStopTimer - rawDt);
        const floorScale = settings.performanceMode ? 0.5 : 0.24;
        const scaled = rawDt * Utils.clamp(floorScale + (1 - hitStopStrength) * 0.35, 0.2, 1);
        if (hitStopTimer <= 0) {
            hitStopStrength = 0;
        }
        return scaled;
    }

    function applyCombatFeedback(payload) {
        if (!payload || typeof payload !== 'object') return;
        const type = String(payload.type || '');
        const target = String(payload.target || 'enemy');
        const isBossTarget = target === 'boss';
        const hitCount = Math.max(1, Math.round(Number(payload.hitCount) || 1));
        const killCount = Math.max(0, Math.round(Number(payload.killCount) || 0));

        if (type === 'player-damaged') {
            queueHitStop(settings.performanceMode ? 0.016 : 0.026, 0.58);
            queueImpactFlash('248, 113, 113', 0.19, 0.1);
            if (settings.shake) {
                screenShake = Math.max(screenShake, settings.performanceMode ? 6.8 : 9.2);
            }
            pulseTouchButton('dash', 0.14);
            triggerTouchHaptics(12);
            return;
        }

        if (type !== 'player-melee-hit' && type !== 'player-ranged-hit') return;

        const isMelee = type === 'player-melee-hit';
        const hitScale = Math.min(1.65, 1 + (hitCount - 1) * 0.2 + killCount * 0.22 + (isBossTarget ? 0.25 : 0));
        const stopDuration = isMelee ? 0.028 : 0.018;
        const stopStrength = isMelee ? 0.62 : 0.48;
        queueHitStop(stopDuration * hitScale, stopStrength);

        if (isMelee) {
            queueImpactFlash(isBossTarget ? '248, 180, 88' : '125, 211, 252', isBossTarget ? 0.22 : 0.15, 0.12);
            if (settings.shake) {
                const shake = (isBossTarget ? 7.2 : 4.8) * (settings.performanceMode ? 0.72 : 1) * hitScale;
                screenShake = Math.max(screenShake, shake);
            }
        } else {
            queueImpactFlash(isBossTarget ? '196, 181, 253' : '96, 165, 250', isBossTarget ? 0.18 : 0.12, 0.09);
            if (settings.shake) {
                const shake = (isBossTarget ? 4.8 : 2.8) * (settings.performanceMode ? 0.72 : 1) * hitScale;
                screenShake = Math.max(screenShake, shake);
            }
        }

        pulseTouchButton('attack', isMelee ? 0.18 : 0.12);
        triggerTouchHaptics(isMelee ? 8 : 6);
    }

    function bindCombatFeedbackHook() {
        if (typeof window === 'undefined') return;
        window.__shadowOnCombatImpact = (payload) => {
            applyCombatFeedback(payload);
        };
    }

    function renderCombatImpactOverlay() {
        if (impactFlashTimer <= 0 || impactFlashStrength <= 0) return;
        const alpha = Utils.clamp(impactFlashTimer / 0.12, 0, 1) * impactFlashStrength;
        if (alpha <= 0.004) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = w * 0.5;
        const cy = h * 0.5;
        const radius = Math.max(w, h) * 0.56;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${impactFlashRGB}, ${Math.min(0.2, alpha * 0.95)})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    function pushPresence(status = 'online', inGame = false) {
        if (typeof Social === 'undefined' || !Social || typeof Social.updatePresence !== 'function') return;
        Social.updatePresence({
            status,
            inGame,
            level: currentLevel,
            stage: currentStage,
            floor: totalFloor,
            x: player ? player.x : 0,
            y: player ? player.y : 0,
        }).catch(() => {
            // Ignore temporary network failures.
        });
    }

    function initPartyLiveUI() {
        partyLiveUi.panel = document.getElementById('party-live-panel');
        partyLiveUi.title = document.getElementById('party-live-title');
        partyLiveUi.list = document.getElementById('party-live-list');
        if (partyLiveUi.panel) {
            partyLiveUi.panel.classList.add('hidden');
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function clearPartyLiveSnapshot() {
        partySyncInFlight = false;
        partyLiveSnapshot = null;
        if (partyLiveUi.panel) partyLiveUi.panel.classList.add('hidden');
        if (partyLiveUi.list) partyLiveUi.list.innerHTML = '';
    }

    function renderPartyLivePanel() {
        if (!partyLiveUi.panel || !partyLiveUi.list) return;
        if (!running || !partyLiveSnapshot || !Array.isArray(partyLiveSnapshot.members) || !partyLiveSnapshot.members.length) {
            partyLiveUi.panel.classList.add('hidden');
            partyLiveUi.list.innerHTML = '';
            return;
        }

        const leaderName = String(partyLiveSnapshot.leader || '').trim();
        if (partyLiveUi.title) {
            partyLiveUi.title.textContent = leaderName ? `Party Sync - Leader ${leaderName}` : 'Party Sync';
        }

        const members = partyLiveSnapshot.members.slice(0, 6);
        partyLiveUi.list.innerHTML = members.map((member) => {
            const sameLayer = !!member.sameLayer;
            const stale = (Math.floor(Date.now() / 1000) - Number(member.presenceUpdatedAt || 0)) > PARTY_MEMBER_STALE_SECONDS;
            const stateText = stale
                ? 'Sync delayed'
                : (member.inGame
                    ? (sameLayer ? 'Same floor' : `L${member.level || 0} S${member.stage || 0}`)
                    : (member.status || 'online'));
            const cssClass = stale ? 'lag' : (sameLayer ? 'online' : 'away');
            return `
                <div class="party-live-member ${cssClass}">
                    <div class="party-live-name">${escapeHtml(member.username)}</div>
                    <div class="party-live-meta">${escapeHtml(stateText)}</div>
                </div>
            `;
        }).join('');
        partyLiveUi.panel.classList.remove('hidden');
    }

    async function refreshPartyLive(force = false) {
        if (!running || !player) {
            clearPartyLiveSnapshot();
            return;
        }
        if (typeof Social === 'undefined' || !Social || typeof Social.fetchPartyLive !== 'function') {
            clearPartyLiveSnapshot();
            return;
        }
        if (partySyncInFlight && !force) return;

        partySyncInFlight = true;
        try {
            const live = await Social.fetchPartyLive({
                level: currentLevel,
                stage: currentStage,
                floor: totalFloor,
                includeSelf: false,
            });
            if (!live || !Array.isArray(live.members) || !live.members.length) {
                partyLiveSnapshot = null;
            } else {
                partyLiveSnapshot = live;
            }
            renderPartyLivePanel();
        } catch (_err) {
            // Ignore temporary network failures.
        } finally {
            partySyncInFlight = false;
        }
    }

    function drawPartyGhosts() {
        if (!partyLiveSnapshot || !Array.isArray(partyLiveSnapshot.members)) return;
        const now = Math.floor(Date.now() / 1000);

        for (const member of partyLiveSnapshot.members) {
            if (!member || !member.inGame || !member.sameLayer) continue;
            const stale = now - Number(member.presenceUpdatedAt || 0);
            if (stale > PARTY_MEMBER_STALE_SECONDS) continue;

            const wx = Number(member.x) || 0;
            const wy = Number(member.y) || 0;
            const sx = wx - camera.x;
            const sy = wy - camera.y;

            if (sx < -60 || sy < -60 || sx > window.innerWidth + 60 || sy > window.innerHeight + 60) continue;

            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = 'rgba(103, 232, 249, 0.35)';
            ctx.beginPath();
            ctx.arc(sx, sy, 13, 0, Math.PI * 2);
            ctx.fill();

            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
            ctx.beginPath();
            ctx.arc(sx, sy, 16, 0, Math.PI * 2);
            ctx.stroke();

            ctx.font = '700 11px Rajdhani, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#a5f3fc';
            ctx.fillText((member.username || 'ALLY').slice(0, 10), sx, sy - 20);
            ctx.restore();
        }
    }

    function hashString32(input) {
        const text = String(input || '');
        let h = 2166136261 >>> 0;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) || 1;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6d2b79f5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function withSeededRandom(seed, callback) {
        if (!Number.isFinite(seed)) return callback();
        const prevRandom = Math.random;
        Math.random = mulberry32(seed >>> 0);
        try {
            return callback();
        } finally {
            Math.random = prevRandom;
        }
    }

    function coopStageIdentity(level = currentLevel, stage = currentStage, floor = totalFloor) {
        return `${Math.max(1, Math.round(level || 1))}:${Math.max(1, Math.round(stage || 1))}:${Math.max(1, Math.round(floor || 1))}`;
    }

    function getCoopSeed(scopeKey = 'stage') {
        const base = coopStageSeed || hashString32(`solo:${coopStageIdentity()}`);
        return hashString32(`${base}:${scopeKey}`);
    }

    function isCoopOnlineReady() {
        return typeof Social !== 'undefined'
            && !!Social
            && typeof Social.isOnlineReady === 'function'
            && Social.isOnlineReady();
    }

    function refreshCoopContext() {
        coopMode = false;
        coopIsLeader = false;
        coopPartyId = 0;

        if (!isCoopOnlineReady()) {
            const baseSoloSeed = runSeed || hashString32(`solo-run:${Date.now()}`);
            coopStageSeed = hashString32(`solo:${baseSoloSeed}:${coopStageIdentity()}`);
            return;
        }

        const me = typeof Social.getOnlineUser === 'function' ? Social.getOnlineUser() : null;
        const party = typeof Social.getPartySnapshot === 'function' ? Social.getPartySnapshot() : null;
        const members = Array.isArray(party?.members) ? party.members : [];
        const username = String(me?.username || '').trim().toLowerCase();
        if (!username || !party || members.length < 2) {
            const baseSoloSeed = runSeed || hashString32(`solo-run:${Date.now()}`);
            coopStageSeed = hashString32(`solo:${baseSoloSeed}:${coopStageIdentity()}`);
            return;
        }

        coopMode = true;
        coopPartyId = Math.max(1, Math.round(Number(party.id) || 0)) || hashString32(`${party.leader || 'party'}:${members.length}`);
        coopIsLeader = String(party.leader || '').trim().toLowerCase() === username;
        coopStageSeed = hashString32(`${coopPartyId}:${coopStageIdentity()}`);
    }

    function clearCoopRuntimeState() {
        coopStateVersion = 0;
        coopPushTimer = 0;
        coopPullTimer = 0;
        coopPushInFlight = false;
        coopPullInFlight = false;
        coopHitInFlight = new Set();
        coopLootClaims = new Map();
    }

    function findEntityBySyncId(syncId) {
        if (!syncId) return null;
        for (const enemy of enemies) {
            if (enemy && enemy.syncId === syncId) return enemy;
        }
        if (boss && boss.syncId === syncId) return boss;
        return null;
    }

    function assignEnemySyncIds() {
        if (!dungeon || !Array.isArray(dungeon.rooms)) return;
        for (let roomIndex = 0; roomIndex < dungeon.rooms.length; roomIndex++) {
            const room = dungeon.rooms[roomIndex];
            const roomEnemies = Array.isArray(room?.enemies) ? room.enemies : [];
            for (let i = 0; i < roomEnemies.length; i++) {
                const enemy = roomEnemies[i];
                if (!enemy) continue;
                enemy.syncId = `r${roomIndex}-e${i}`;
                enemy.syncRoom = `${room.x}:${room.y}`;
            }
        }
        if (boss) boss.syncId = 'boss-main';
    }

    function buildCoopStatePayload() {
        const enemyRows = [];
        for (const enemy of enemies) {
            if (!enemy) continue;
            const eid = enemy.syncId || '';
            if (!eid) continue;
            enemyRows.push({
                id: eid,
                hp: Math.max(0, Math.round(Number(enemy.hp) || 0)),
                maxHp: Math.max(1, Math.round(Number(enemy.maxHp) || 1)),
                alive: !!enemy.alive,
                x: Number(enemy.x) || 0,
                y: Number(enemy.y) || 0,
                isElite: !!enemy.isElite,
                kind: 'enemy',
            });
        }
        if (boss && boss.syncId) {
            enemyRows.push({
                id: boss.syncId,
                hp: Math.max(0, Math.round(Number(boss.hp) || 0)),
                maxHp: Math.max(1, Math.round(Number(boss.maxHp) || 1)),
                alive: !!boss.alive,
                x: Number(boss.x) || 0,
                y: Number(boss.y) || 0,
                isElite: true,
                kind: 'boss',
            });
        }
        enemyRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return { enemies: enemyRows };
    }

    function applyEnemySnapshot(entity, snapshot, applyPosition = false) {
        if (!entity || !snapshot || typeof snapshot !== 'object') return;
        const maxHp = Math.max(1, Math.round(Number(snapshot.maxHp) || Number(entity.maxHp) || 1));
        const hp = Math.max(0, Math.min(maxHp, Math.round(Number(snapshot.hp) || 0)));
        entity.maxHp = maxHp;
        if (hp <= 0 || snapshot.alive === false) {
            entity.hp = 0;
            entity.alive = false;
        } else {
            entity.hp = hp;
            entity.alive = true;
        }
        if (applyPosition) {
            entity.x = Number(snapshot.x) || 0;
            entity.y = Number(snapshot.y) || 0;
        }
    }

    function applyCoopStateToLocal(statePayload, allowPositionSync = false) {
        if (!statePayload || typeof statePayload !== 'object') return;
        const remoteEnemies = Array.isArray(statePayload.enemies) ? statePayload.enemies : [];
        for (const snapshot of remoteEnemies) {
            const entity = findEntityBySyncId(String(snapshot?.id || ''));
            if (!entity) continue;
            applyEnemySnapshot(entity, snapshot, allowPositionSync);
        }
    }

    async function pushCoopStageState(force = false) {
        if (!running || !coopMode || !coopIsLeader) return;
        if (typeof Social === 'undefined' || !Social || typeof Social.pushCoopState !== 'function') return;
        if (coopPushInFlight && !force) return;
        coopPushInFlight = true;
        try {
            const result = await Social.pushCoopState(currentLevel, currentStage, totalFloor, buildCoopStatePayload());
            if (result && result.state) {
                coopStateVersion = Math.max(coopStateVersion, Number(result.version) || 0);
                // Pull in min-HP merge outcomes from server to include remote teammate hits.
                applyCoopStateToLocal(result.state, false);
            }
        } catch (_err) {
            // Ignore transient LAN failures.
        } finally {
            coopPushInFlight = false;
        }
    }

    async function pullCoopStageState(force = false) {
        if (!running || !coopMode) return;
        if (typeof Social === 'undefined' || !Social || typeof Social.fetchCoopState !== 'function') return;
        if (coopPullInFlight && !force) return;
        coopPullInFlight = true;
        try {
            const result = await Social.fetchCoopState(currentLevel, currentStage, totalFloor);
            if (!result || !result.state) return;
            const version = Number(result.version) || 0;
            if (!force && version > 0 && version <= coopStateVersion) return;
            coopStateVersion = Math.max(coopStateVersion, version);
            applyCoopStateToLocal(result.state, !coopIsLeader);
        } catch (_err) {
            // Ignore transient LAN failures.
        } finally {
            coopPullInFlight = false;
        }
    }

    function reportCoopHit(enemy, damage) {
        if (!running || !coopMode) return;
        if (!enemy || !enemy.syncId) return;
        if (typeof Social === 'undefined' || !Social || typeof Social.reportCoopHit !== 'function') return;
        const amount = Math.max(1, Math.round(Number(damage) || 1));
        const ticket = `${enemy.syncId}:${amount}:${Date.now() >> 6}`;
        if (coopHitInFlight.has(ticket)) return;
        coopHitInFlight.add(ticket);
        Social.reportCoopHit(currentLevel, currentStage, totalFloor, enemy.syncId, amount)
            .then((result) => {
                if (result && result.enemy) {
                    const entity = findEntityBySyncId(String(result.enemy.id || enemy.syncId));
                    if (entity) applyEnemySnapshot(entity, result.enemy, false);
                    coopStateVersion = Math.max(coopStateVersion, Number(result.version) || 0);
                }
            })
            .catch(() => {
                // Ignore transient LAN failures.
            })
            .finally(() => {
                coopHitInFlight.delete(ticket);
            });
    }

    function bindCoopCombatHook() {
        if (typeof window === 'undefined') return;
        window.__shadowCoopBeforeHit = (_enemy, _damage) => {
            return !!coopMode && !coopIsLeader;
        };
        window.__shadowCoopReportHit = (enemy, damage) => {
            reportCoopHit(enemy, damage);
        };
    }

    function tagCoopLoot(itemsList, sourceTag) {
        if (!coopMode || !Array.isArray(itemsList) || !sourceTag) return;
        const stageId = coopStageIdentity();
        for (let i = 0; i < itemsList.length; i++) {
            const item = itemsList[i];
            if (!item || item.coopKey) continue;
            const typeId = item.type?.id || 'item';
            item.coopKey = `${stageId}:${sourceTag}:${i}:${typeId}`;
        }
    }

    function spawnSeededDrops(seedTag, producer) {
        if (!coopMode) return producer();
        return withSeededRandom(getCoopSeed(seedTag), producer);
    }

    function requestCoopLootClaim(item) {
        if (!coopMode || !item || !item.coopKey) return;
        if (typeof Social === 'undefined' || !Social || typeof Social.claimCoopLoot !== 'function') return;
        const key = item.coopKey;
        if (coopLootClaims.get(key) === 'pending') return;
        coopLootClaims.set(key, 'pending');
        Social.claimCoopLoot(currentLevel, currentStage, totalFloor, key)
            .then((result) => {
                if (result && result.granted) {
                    coopLootClaims.set(key, 'granted');
                } else {
                    coopLootClaims.set(key, 'denied');
                    item.collected = true;
                }
            })
            .catch(() => {
                coopLootClaims.delete(key);
            });
    }

    function closeStageEvent() {
        activeEvent = null;
        if (eventUi.overlay) eventUi.overlay.classList.add('hidden');
        if (running && !paused) setTouchControlsVisible(true);
    }

    function setEventDescription(text, tone = 'info') {
        if (!eventUi.desc) return;
        eventUi.desc.textContent = text;
        if (tone === 'warn') {
            eventUi.desc.style.color = '#fca5a5';
        } else if (tone === 'good') {
            eventUi.desc.style.color = '#86efac';
        } else {
            eventUi.desc.style.color = '#93c5fd';
        }
    }

    function roomEventKey(room) {
        return `${currentLevel}:${currentStage}:${room.x}:${room.y}`;
    }

    function hashToUnit(value) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < value.length; i++) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967295;
    }

    function rewardGold(amount) {
        const gain = Math.max(0, Math.round(amount));
        if (!player || gain <= 0) return;
        player.gold += gain;
        player.score += Math.round(gain * 1.2);
        Particles.emitText(player.x, player.y - 22, `+${gain} G`, '#facc15');
        Audio.playSFX('coin');
    }

    function spawnEventAmbush(room, waves = 1) {
        if (!room) return 0;
        let spawned = 0;
        const countWaves = Math.max(1, Math.round(waves));
        for (let w = 0; w < countWaves; w++) {
            const reinforcements = Enemies.spawnReinforcements(room, totalFloor + w, 1 + w);
            if (!reinforcements.length) continue;
            room.enemies.push(...reinforcements);
            enemies.push(...reinforcements);
            spawned += reinforcements.length;
        }
        if (spawned > 0) {
            room.cleared = false;
            room.combatTime = 0;
            room.reinforcementsSpawned = Math.max(room.reinforcementsSpawned || 0, countWaves);
            Particles.emitText(room.centerX * Dungeon.TILE_SIZE, room.centerY * Dungeon.TILE_SIZE - 18, 'AMBUSH!', '#f97316');
            Audio.playSFX('hit');
        }
        return spawned;
    }

    function buildRoomEvent(room, key) {
        const roll = hashToUnit(key);
        const dealCost = 34 + totalFloor * 5;
        const powerCost = 58 + totalFloor * 7;

        if (room.type === Dungeon.ROOM_TYPE.REST) {
            return {
                chip: 'STATUE',
                title: 'Blessing Statue',
                desc: 'Ancient runes pulse with energy. Choose one blessing.',
                options: [
                    {
                        label: 'Fortify Core (+1 Max HP, heal 1)',
                        onSelect: () => {
                            player.maxHp += 1;
                            player.heal(1);
                            Particles.emitBurst(player.x, player.y, 12, '#22c55e', 3);
                        },
                    },
                    {
                        label: 'Swift Sigil (+20 speed, dash cooldown -0.1s)',
                        onSelect: () => {
                            player.speed += 20;
                            player.dashCooldownMax = Math.max(0.3, player.dashCooldownMax - 0.1);
                            Particles.emitBurst(player.x, player.y, 10, '#38bdf8', 2.4);
                        },
                    },
                    {
                        label: 'Battle Focus (+0.5 damage, 10% faster attacks)',
                        onSelect: () => {
                            player.attackDamage += 0.5;
                            player.attackCooldownMult = Math.max(0.2, player.attackCooldownMult * 0.9);
                            Particles.emitBurst(player.x, player.y, 10, '#f59e0b', 2.4);
                        },
                    },
                ],
            };
        }

        if (room.type === Dungeon.ROOM_TYPE.TREASURE || (room.type === Dungeon.ROOM_TYPE.COMBAT && roll > 0.58)) {
            return {
                chip: 'TRADER',
                title: 'Black-Market Dealer',
                desc: 'A rogue vendor offers combat supplies for gold.',
                options: [
                    {
                        label: `Buy Supply Kit (${dealCost}G)`,
                        onSelect: () => {
                            if (player.gold < dealCost) {
                                setEventDescription('Not enough gold for the supply kit.', 'warn');
                                return false;
                            }
                            player.gold -= dealCost;
                            player.heal(2);
                            player.shieldHits = (player.shieldHits || 0) + 1;
                            setEventDescription('Supply kit secured. You feel steadier.', 'good');
                            Audio.playSFX('pickup');
                            return true;
                        },
                    },
                    {
                        label: `Buy Power Module (${powerCost}G)`,
                        onSelect: () => {
                            if (player.gold < powerCost) {
                                setEventDescription('Not enough gold for the power module.', 'warn');
                                return false;
                            }
                            player.gold -= powerCost;
                            player.attackDamage += 0.7;
                            player.attackRange += 8;
                            player.skillCooldownMax = Math.max(2.2, player.skillCooldownMax - 0.25);
                            setEventDescription('Power module installed. Weapon output increased.', 'good');
                            Audio.playSFX('levelup');
                            return true;
                        },
                    },
                    {
                        label: 'Decline and move on',
                        onSelect: () => true,
                    },
                ],
            };
        }

        if (room.type === Dungeon.ROOM_TYPE.ELITE || (room.type === Dungeon.ROOM_TYPE.COMBAT && roll > 0.34)) {
            return {
                chip: 'CHALLENGE',
                title: 'Pressure Beacon',
                desc: 'A combat beacon offers rewards if you survive a forced wave.',
                options: [
                    {
                        label: 'Activate Beacon (spawn wave, gain reward)',
                        onSelect: () => {
                            const spawned = spawnEventAmbush(room, room.type === Dungeon.ROOM_TYPE.ELITE ? 2 : 1);
                            if (spawned > 0) {
                                rewardGold(30 + totalFloor * 6);
                                player.score += 120 + totalFloor * 20;
                            } else {
                                setEventDescription('The beacon fizzles out. No enemies answered.', 'warn');
                            }
                            return true;
                        },
                    },
                    {
                        label: 'Take Safe Cache (+small gold)',
                        onSelect: () => {
                            rewardGold(16 + totalFloor * 3);
                            return true;
                        },
                    },
                    {
                        label: 'Ignore Signal',
                        onSelect: () => true,
                    },
                ],
            };
        }

        return null;
    }

    function openStageEvent(room, roomKey, eventDef) {
        if (!eventDef || !eventUi.overlay || !eventUi.options) return;
        activeEvent = { roomKey };

        if (eventUi.chip) eventUi.chip.textContent = eventDef.chip || 'EVENT';
        if (eventUi.title) eventUi.title.textContent = eventDef.title || 'Unknown Event';
        setEventDescription(eventDef.desc || 'Choose how to proceed.', 'info');
        eventUi.options.innerHTML = '';

        for (const option of (eventDef.options || [])) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'event-option-btn';
            button.textContent = option.label;
            if (option.disabled) button.disabled = true;
            button.addEventListener('click', () => {
                if (!activeEvent) return;
                if (button.disabled) return;
                const shouldClose = typeof option.onSelect === 'function'
                    ? option.onSelect() !== false
                    : true;
                if (shouldClose) closeStageEvent();
            });
            eventUi.options.appendChild(button);
        }

        eventUi.overlay.classList.remove('hidden');
        setTouchControlsVisible(false);
    }

    function tryTriggerRoomEvent(room) {
        if (!room || !player) return;
        if (isEventBlocking()) return;
        if (!room.discovered || !room.cleared) return;

        const key = roomEventKey(room);
        if (handledEventRooms.has(key)) return;
        handledEventRooms.add(key);

        if (room.type === Dungeon.ROOM_TYPE.START || room.type === Dungeon.ROOM_TYPE.BOSS) return;

        const eventDef = buildRoomEvent(room, key);
        if (!eventDef) return;
        openStageEvent(room, key, eventDef);
    }

    function init() {
        canvas = document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Input handlers
        window.addEventListener('keydown', (e) => {
            if (isTypingInField()) return;
            if (!running) return;

            if (isModalBlocking()) {
                if (isEventBlocking() && e.code === 'Escape') {
                    closeStageEvent();
                }
                if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Key') || e.code.startsWith('Arrow')) {
                    e.preventDefault();
                }
                return;
            }

            keys[e.code] = true;
            if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
                e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                e.preventDefault();
            }
            if (e.code === 'Escape') {
                const levelUpVisible = !document.getElementById('levelup-overlay')?.classList.contains('hidden');
                if (!levelUpVisible) togglePause();
                e.preventDefault();
            }
            if (e.code === 'Space' && !paused) { if (player) player.dash(); e.preventDefault(); }
            if (e.code === 'KeyE' && !paused) {
                if (player) {
                    const interacted = tryInteract();
                    if (!interacted) player.useItem();
                }
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => { keys[e.code] = false; });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left - rect.width / 2;
            mouseY = e.clientY - rect.top  - rect.height / 2;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0 && running && !paused && !isModalBlocking()) {
                mouseDown = true;
                if (player) player.attack(collectAttackTargets());
            }
        });

        canvas.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch support for mobile
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (touchState.enabled) return;
            if (!running || paused || isModalBlocking()) return;
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            mouseX = touch.clientX - rect.left - rect.width / 2;
            mouseY = touch.clientY - rect.top  - rect.height / 2;
            mouseDown = true;
            if (player) player.attack(collectAttackTargets());
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (touchState.enabled) return;
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            mouseX = touch.clientX - rect.left - rect.width / 2;
            mouseY = touch.clientY - rect.top  - rect.height / 2;
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (touchState.enabled) return;
            mouseDown = false;
        });

        // Handle screen rotation on mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeCanvas, 150);
        });

        window.addEventListener('beforeunload', () => {
            if (!running || !player || !player.alive) return;
            saveRunCheckpoint('before_unload');
        });

        initTouchControls();
        initEventUI();
        initCombatToastUI();
        initPartyLiveUI();
        bindCombatFeedbackHook();
        bindCoopCombatHook();
        HUD.init();
    }

    function resizeCanvas() {
        const deviceDpr = window.devicePixelRatio || 1;
        const renderScale = Utils.clamp(Number(settings.renderScale) || 1, 0.6, 1);
        const dprLimit = settings.performanceMode ? 1.25 : 2;
        const dpr = Utils.clamp(deviceDpr * renderScale, 0.5, dprLimit);

        canvas.width  = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width  = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
    }

    function startNewRun(charDef, heroName) {
        resetInputState();
        runSeed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        currentLevel = 1;
        currentStage = 1;
        totalFloor   = 1;
        running      = true;
        paused       = false;
        stairLockHintCooldown = 0;
        autosaveTimer = 0;
        presenceSyncTimer = 0;
        partySyncTimer = 0;
        handledEventRooms = new Set();
        roomClearNotified = new Set();
        lastRoomKey = '';
        resetStageIntensity();
        Particles.clear();
        Auth.clearCheckpoint();
        closeStageEvent();
        hideCombatToast();
        clearPartyLiveSnapshot();
        clearCoopRuntimeState();

        if (typeof Story !== 'undefined' && Story) {
            Story.setDialogueEnabled(settings.storyDialogues !== false);
            Story.resetRun(heroName || charDef?.name || 'Hero', charDef?.name || 'Unknown');
        }
        generateStage(charDef, heroName);

        Utils.showScreen('game-screen');
        HUD.show();
        document.getElementById('pause-overlay').classList.add('hidden');
        canvas.style.cursor = 'none';
        setTouchControlsVisible(true);
        pushPresence('in_run', true);
        refreshPartyLive(true);

        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }

    // Track charDef between stages
    let _charDef  = null;
    let _heroName = null;

    function getCharDefById(charId) {
        const defs = (typeof Characters !== 'undefined' && Characters && Characters.DEFS) ? Characters.DEFS : null;
        if (!defs) return null;
        return defs[charId] || defs.warrior || null;
    }

    function findItemTypeById(itemId) {
        if (!itemId || typeof Items === 'undefined' || !Items || !Items.ITEM_TYPES) return null;
        const itemTypes = Items.ITEM_TYPES;
        for (const key in itemTypes) {
            const type = itemTypes[key];
            if (type && type.id === itemId) return type;
        }
        return null;
    }

    function serializePlayerState() {
        if (!player) return null;
        return {
            maxHp: player.maxHp,
            hp: player.hp,
            speed: player.speed,
            weaponTier: player.weaponTier,
            attackDamage: player.attackDamage,
            attackRange: player.attackRange,
            attackArc: player.attackArc,
            attackMode: player.attackMode,
            projectileTemplate: { ...player.projectileTemplate },
            skillCooldownMax: player.skillCooldownMax,
            armor: player.armor,
            xpMultiplier: player.xpMultiplier,
            goldMultiplier: player.goldMultiplier,
            attackCooldownMult: player.attackCooldownMult,
            regenRate: player.regenRate,
            regenAccum: player.regenAccum,
            critChance: player.critChance,
            dashCooldownMax: player.dashCooldownMax,
            dashCooldown: player.dashCooldown,
            skillCooldown: player.skillCooldown,
            speedBuffTimer: player.speedBuffTimer,
            damageBuffTimer: player.damageBuffTimer,
            shieldHits: player.shieldHits,
            frenzyTimer: player.frenzyTimer,
            frenzyStacks: player.frenzyStacks,
            gold: player.gold,
            keys: player.keys,
            treasures: player.treasures,
            kills: player.kills,
            score: player.score,
            xp: player.xp,
            level: player.level,
            xpToNextLevel: player.xpToNextLevel,
            upgradesChosen: player.upgradesChosen,
            heldItemId: player.heldItem ? player.heldItem.id : null,
        };
    }

    function restorePlayerState(state) {
        if (!player || !state || typeof state !== 'object') return;
        const toNumber = (value, fallback) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        };

        player.maxHp = Math.max(1, Math.round(toNumber(state.maxHp, player.maxHp)));
        player.hp = Utils.clamp(Math.round(toNumber(state.hp, player.hp)), 1, player.maxHp);
        player.speed = Math.max(50, toNumber(state.speed, player.speed));
        player.weaponTier = Math.max(0, Math.round(toNumber(state.weaponTier, player.weaponTier)));
        player.attackDamage = Math.max(1, toNumber(state.attackDamage, player.attackDamage));
        player.attackRange = Math.max(20, toNumber(state.attackRange, player.attackRange));
        player.attackArc = Math.max(0.1, toNumber(state.attackArc, player.attackArc));
        player.attackMode = state.attackMode === 'ranged' ? 'ranged' : 'melee';

        if (state.projectileTemplate && typeof state.projectileTemplate === 'object') {
            player.projectileTemplate = {
                speed: Math.max(120, toNumber(state.projectileTemplate.speed, player.projectileTemplate.speed)),
                life: Math.max(0.1, toNumber(state.projectileTemplate.life, player.projectileTemplate.life)),
                radius: Math.max(1, toNumber(state.projectileTemplate.radius, player.projectileTemplate.radius)),
                color: state.projectileTemplate.color || player.projectileTemplate.color,
                canPierce: !!state.projectileTemplate.canPierce,
            };
        }

        player.skillCooldownMax = Math.max(0.1, toNumber(state.skillCooldownMax, player.skillCooldownMax));
        player.armor = Math.max(0, Math.round(toNumber(state.armor, player.armor || 0)));
        player.xpMultiplier = Math.max(0.1, toNumber(state.xpMultiplier, player.xpMultiplier || 1));
        player.goldMultiplier = Math.max(0.1, toNumber(state.goldMultiplier, player.goldMultiplier || 1));
        player.attackCooldownMult = Math.max(0.2, toNumber(state.attackCooldownMult, player.attackCooldownMult || 1));
        player.regenRate = Math.max(0, toNumber(state.regenRate, player.regenRate || 0));
        player.regenAccum = Math.max(0, toNumber(state.regenAccum, player.regenAccum || 0));
        player.critChance = Utils.clamp(toNumber(state.critChance, player.critChance || 0), 0, 1);
        player.dashCooldownMax = Math.max(0.2, toNumber(state.dashCooldownMax, player.dashCooldownMax));
        player.dashCooldown = Math.max(0, toNumber(state.dashCooldown, player.dashCooldown));
        player.skillCooldown = Math.max(0, toNumber(state.skillCooldown, player.skillCooldown));
        player.speedBuffTimer = Math.max(0, toNumber(state.speedBuffTimer, player.speedBuffTimer));
        player.damageBuffTimer = Math.max(0, toNumber(state.damageBuffTimer, player.damageBuffTimer));
        player.shieldHits = Math.max(0, Math.round(toNumber(state.shieldHits, player.shieldHits || 0)));
        player.frenzyTimer = Math.max(0, toNumber(state.frenzyTimer, player.frenzyTimer || 0));
        player.frenzyStacks = Math.max(0, Math.round(toNumber(state.frenzyStacks, player.frenzyStacks || 0)));
        player.gold = Math.max(0, Math.round(toNumber(state.gold, player.gold)));
        player.keys = Math.max(0, Math.round(toNumber(state.keys, player.keys)));
        player.treasures = Math.max(0, Math.round(toNumber(state.treasures, player.treasures)));
        player.kills = Math.max(0, Math.round(toNumber(state.kills, player.kills)));
        player.score = Math.max(0, Math.round(toNumber(state.score, player.score)));
        player.xp = Math.max(0, Math.round(toNumber(state.xp, player.xp)));
        player.level = Math.max(1, Math.round(toNumber(state.level, player.level)));
        player.xpToNextLevel = Math.max(1, Math.round(toNumber(state.xpToNextLevel, player.xpToNextLevel)));
        player.upgradesChosen = Math.max(0, Math.round(toNumber(state.upgradesChosen, player.upgradesChosen)));
        player.heldItem = findItemTypeById(state.heldItemId);
    }

    function buildRunSnapshot() {
        if (!player || !_charDef) return null;
        return {
            charId: _charDef.id,
            heroName: _heroName || player.charName || _charDef.name,
            currentLevel,
            currentStage,
            totalFloor,
            runSeed,
            stageTimer,
            pressureLevel,
            comboCount,
            comboTimer,
            playerState: serializePlayerState(),
        };
    }

    function saveRunCheckpoint(reason = 'autosave') {
        if (!running || !player || !player.alive) return false;
        if (!Auth.getCurrentUser()) return false;

        const snapshot = buildRunSnapshot();
        if (!snapshot) return false;
        snapshot.reason = reason;
        return !!Auth.saveCheckpoint(snapshot);
    }

    function hasSavedRun() {
        return !!Auth.hasCheckpoint();
    }

    function continueSavedRun() {
        const snapshot = Auth.getCheckpoint();
        if (!snapshot || typeof snapshot !== 'object') return false;

        const charDef = getCharDefById(snapshot.charId);
        if (!charDef) return false;

        const level = Math.max(1, Math.round(Number(snapshot.currentLevel) || 1));
        const stage = Math.max(1, Math.min(STAGES_PER_LEVEL, Math.round(Number(snapshot.currentStage) || 1)));
        const floor = Math.max(1, Math.round(Number(snapshot.totalFloor) || 1));
        const parsedRunSeed = Number(snapshot.runSeed);
        runSeed = Number.isFinite(parsedRunSeed) && parsedRunSeed > 0
            ? Math.round(parsedRunSeed) >>> 0
            : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);

        resetInputState();
        currentLevel = level;
        currentStage = stage;
        totalFloor = floor;
        running = true;
        paused = false;
        stairLockHintCooldown = 0;
        autosaveTimer = 0;
        presenceSyncTimer = 0;
        partySyncTimer = 0;
        handledEventRooms = new Set();
        roomClearNotified = new Set();
        lastRoomKey = '';
        resetStageIntensity();
        Particles.clear();
        closeStageEvent();
        hideCombatToast();
        clearPartyLiveSnapshot();
        clearCoopRuntimeState();

        stageTimer = Math.max(0, Number(snapshot.stageTimer) || 0);
        pressureLevel = Utils.clamp(Number(snapshot.pressureLevel) || 1, 1, 4.6);
        comboCount = Math.max(0, Math.round(Number(snapshot.comboCount) || 0));
        comboTimer = Math.max(0, Number(snapshot.comboTimer) || 0);

        const heroName = (snapshot.heroName || '').trim() || charDef.name;
        if (typeof Story !== 'undefined' && Story) {
            Story.setDialogueEnabled(settings.storyDialogues !== false);
            Story.resetRun(heroName, charDef.name);
        }

        player = null;
        generateStage(charDef, heroName);
        restorePlayerState(snapshot.playerState);

        Utils.showScreen('game-screen');
        HUD.show();
        document.getElementById('pause-overlay').classList.add('hidden');
        canvas.style.cursor = 'none';
        setTouchControlsVisible(true);
        pushPresence('in_run', true);
        refreshPartyLive(true);

        if (typeof Story !== 'undefined' && Story && typeof Story.queueDialogue === 'function') {
            Story.queueDialogue([
                { speaker: 'System', text: `Run restored: ${heroName} at Level ${currentLevel}, Stage ${currentStage}.` },
            ], { blocking: false });
        }

        saveRunCheckpoint('resume_sync');
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
        return true;
    }

    function resetStageIntensity() {
        stageTimer = 0;
        pressureLevel = 1;
        comboCount = 0;
        comboTimer = 0;
    }

    function updatePressure(dt, currentRoom) {
        stageTimer += dt;
        const floorRamp = (totalFloor - 1) * 0.07;
        const stageRamp = stageTimer / 22;
        const roomRamp = currentRoom && !currentRoom.cleared ? Math.min(1.35, (currentRoom.combatTime || 0) / 14) : 0;
        pressureLevel = Math.min(4.6, 1 + floorRamp + stageRamp + roomRamp);
    }

    function registerKillCombo(enemy) {
        comboCount = comboTimer > 0 ? comboCount + 1 : 1;
        comboTimer = COMBO_WINDOW;

        const baseScore = enemy.def?.score || 10;
        const comboMult = 1 + Math.min(1.8, (comboCount - 1) * 0.12);
        const pressureMult = 1 + Math.min(0.7, pressureLevel * 0.1);

        const scoreGain = Math.round(baseScore * comboMult * pressureMult);
        const xpGain = Math.max(4, Math.round(baseScore * (0.35 + totalFloor * 0.012) * (1 + Math.min(0.45, (comboCount - 1) * 0.05))));
        player.score += scoreGain;
        player.gainXP(xpGain);
        player.kills++;
        player.onCombatKill(comboCount);

        if (comboCount >= 2) {
            Particles.emitText(enemy.x, enemy.y - 22, `x${comboCount} COMBO`, '#f59e0b');
        }
        if (comboCount >= 5 && comboCount % 3 === 2) {
            Audio.playSFX('levelup');
        }

        const dropLuck = 1 + (enemy.isElite ? 0.85 : 0) + Math.min(0.6, comboCount * 0.04);
        const dropTag = `enemy:${enemy.syncId || enemy.def?.name || 'mob'}`;
        const dropSource = enemy.isElite ? 'elite' : 'enemy';
        const drops = spawnSeededDrops(`drop:${dropTag}`, () =>
            Items.spawnDrops(enemy.x, enemy.y, totalFloor, dropLuck, dropSource)
        );
        tagCoopLoot(drops, dropTag);
        items.push(...drops);
    }

    function processEnemyDefeats() {
        for (const enemy of enemies) {
            if (enemy.alive || enemy.rewardGranted) continue;
            enemy.rewardGranted = true;
            registerKillCombo(enemy);
            if (typeof Story !== 'undefined' && Story && typeof Story.registerEnemyDefeat === 'function') {
                Story.registerEnemyDefeat(enemy);
            }
        }
    }

    function spawnReinforcementsForRoom(room) {
        if (coopMode) return;
        if (!room || room.cleared || room.boss) return;
        const maxWaves = room.type === Dungeon.ROOM_TYPE.ELITE ? 3 : (totalFloor >= 9 ? 2 : 1);
        if ((room.reinforcementsSpawned || 0) >= maxWaves) return;
        let aliveInRoom = 0;
        const roomEnemies = Array.isArray(room.enemies) ? room.enemies : [];
        for (const enemy of roomEnemies) {
            if (enemy && enemy.alive) aliveInRoom += 1;
        }
        const softCap = room.type === Dungeon.ROOM_TYPE.ELITE ? 7 : (5 + Math.min(2, Math.floor(totalFloor / 7)));
        if (aliveInRoom >= softCap) return;

        const wave = (room.reinforcementsSpawned || 0) + 1;
        const reinforcements = Enemies.spawnReinforcements(room, totalFloor, wave);
        if (!reinforcements.length) return;

        room.reinforcementsSpawned = wave;
        room.combatTime = 0;
        room.enemies.push(...reinforcements);
        for (let i = 0; i < reinforcements.length; i++) {
            const enemy = reinforcements[i];
            enemy.syncId = `r${room.x}:${room.y}:rf${wave}-${i}`;
            enemy.syncRoom = `${room.x}:${room.y}`;
        }
        enemies.push(...reinforcements);

        const ts = Dungeon.TILE_SIZE;
        const rx = room.centerX * ts + ts / 2;
        const ry = room.centerY * ts + ts / 2;
        Particles.emitText(rx, ry - 24, 'REINFORCEMENTS!', '#f97316');
        Audio.playSFX('hit');
    }

    function collectItemsWithStory() {
        for (const item of items) {
            if (item.collected) continue;
            const dist = Utils.dist(player.x, player.y, item.x, item.y);
            if (dist < player.size + item.radius) {
                if (coopMode && item.coopKey) {
                    const claimState = coopLootClaims.get(item.coopKey);
                    if (claimState === 'denied') {
                        item.collected = true;
                        continue;
                    }
                    if (claimState !== 'granted') {
                        requestCoopLootClaim(item);
                        continue;
                    }
                }
                const itemTypeId = item.type?.id;
                player.collectItem(item);
                if (item.collected && typeof Story !== 'undefined' && Story && typeof Story.registerTreasureCollected === 'function') {
                    Story.registerTreasureCollected(itemTypeId);
                }
            }
        }
    }

    function tryOpenNearbyChest() {
        if (!dungeon || !player) return false;
        const ts = Dungeon.TILE_SIZE;
        const pgx = Math.floor(player.x / ts);
        const pgy = Math.floor(player.y / ts);
        const cells = [
            { x: pgx, y: pgy },
            { x: pgx + 1, y: pgy },
            { x: pgx - 1, y: pgy },
            { x: pgx, y: pgy + 1 },
            { x: pgx, y: pgy - 1 },
        ];

        for (const cell of cells) {
            if (!dungeon.isChestAt(cell.x, cell.y)) continue;
            if (!dungeon.openChest(cell.x, cell.y)) continue;

            const wx = cell.x * ts + ts / 2;
            const wy = cell.y * ts + ts / 2;
            const chestTag = `chest:${cell.x}:${cell.y}`;
            const chestLoot = spawnSeededDrops(`chest:${chestTag}`, () => Items.spawnChestLoot(wx, wy, totalFloor));
            tagCoopLoot(chestLoot, chestTag);
            items.push(...chestLoot);
            player.score += 120 + totalFloor * 15;
            Particles.emitBurst(wx, wy, 18, '#f59e0b', 3);
            Audio.playSFX('pickup');

            if (typeof Story !== 'undefined' && Story && typeof Story.queueDialogue === 'function') {
                Story.queueDialogue([
                    { speaker: 'System', text: 'Cache secured. Relic fragments recovered.' },
                ], { blocking: false });
            }
            return true;
        }
        return false;
    }

    function tryInteract() {
        if (isEventBlocking()) return false;
        return tryOpenNearbyChest();
    }

    function generateStage(charDef, heroName) {
        if (charDef)  _charDef  = charDef;
        if (heroName) _heroName = heroName;
        refreshCoopContext();
        clearCoopRuntimeState();
        resetStageIntensity();

        withSeededRandom(getCoopSeed('stage-generate'), () => {
            dungeon = new Dungeon.DungeonLevel(currentStage, currentLevel);

            const ts = Dungeon.TILE_SIZE;
            const startRoom = dungeon.startRoom;
            const sx = startRoom.centerX * ts + ts / 2;
            const sy = startRoom.centerY * ts + ts / 2;

            if (totalFloor === 1 || !player) {
                const def = _charDef || Characters.DEFS.warrior;
                player    = new Player.PlayerCharacter(sx, sy, def, _heroName || def.name);
            } else {
                player.x = sx;
                player.y = sy;
            }

            // Reset camera (use CSS px, not physical px)
            camera.x = player.x - window.innerWidth / 2;
            camera.y = player.y - window.innerHeight / 2;

            enemies = [];
            items   = [];
            boss    = null;
            handledEventRooms = new Set();
            roomClearNotified = new Set();
            lastRoomKey = '';
            closeStageEvent();
            hideCombatToast();
            hideBossBar();

            const isBossStage = currentStage === STAGES_PER_LEVEL;

            for (let roomIndex = 0; roomIndex < dungeon.rooms.length; roomIndex++) {
                const room = dungeon.rooms[roomIndex];
                if (isBossStage && room === dungeon.bossRoom) {
                    // Spawn themed boss in the boss room
                    boss = Boss.spawnBoss(room, currentLevel, player);
                    room.boss   = boss;
                    room.enemies = []; // no regular enemies in boss room
                    room.combatTime = 0;
                    room.reinforcementsSpawned = 0;
                    room.initialEnemyCount = 0;

                    // Show boss HP bar with correct colors
                    showBossBar(boss);
                } else {
                    const roomEnemies = Enemies.spawnEnemiesForRoom(room, totalFloor);
                    room.enemies = roomEnemies;
                    room.initialEnemyCount = roomEnemies.length;
                    room.combatTime = 0;
                    room.reinforcementsSpawned = 0;
                    if (room.type === Dungeon.ROOM_TYPE.REST && roomEnemies.length === 0) {
                        room.cleared = true;
                    }
                    enemies.push(...roomEnemies);
                }

                const roomItems = Items.spawnItemsForRoom(room, totalFloor);
                room.items = roomItems;
                tagCoopLoot(roomItems, `room-${roomIndex}`);
                items.push(...roomItems);
            }
        });

        assignEnemySyncIds();

        if (typeof Story !== 'undefined' && Story && typeof Story.startStage === 'function') {
            Story.startStage({
                level: currentLevel,
                stage: currentStage,
                totalFloor,
                dungeon,
            });
        }

        autosaveTimer = 0;
        saveRunCheckpoint('stage_start');
        refreshPartyLive(true);
        if (coopMode) {
            if (coopIsLeader) pushCoopStageState(true);
            pullCoopStageState(true);
        }
    }

    function nextStage() {
        // Bonus score for clearing quickly and sustaining combo pressure.
        const speedBonus = Math.max(0, Math.round((95 - stageTimer) * 7));
        const comboBonus = Math.max(0, comboCount - 1) * 45;
        const pressureBonus = Math.round((pressureLevel - 1) * 60);
        const stageBonus = currentLevel * currentStage * 180 + speedBonus + comboBonus + pressureBonus;
        player.score += stageBonus;

        const isBossStage = currentStage === STAGES_PER_LEVEL;
        const nextLevel = currentStage >= STAGES_PER_LEVEL;

        const transEl = document.getElementById('floor-transition');
        const transText = document.getElementById('floor-transition-text');
        const transSubText = document.getElementById('floor-transition-sub');

        if (nextLevel) {
            // Level complete â€” move to next level
            currentLevel++;
            currentStage = 1;
            const levelName = LEVEL_NAMES[currentLevel] || `Level ${currentLevel}`;
            transText.textContent = `Level ${currentLevel}`;
            if (transSubText) transSubText.textContent = levelName;
            Audio.playSFX('levelup');
        } else {
            currentStage++;
            const isBoss = currentStage === STAGES_PER_LEVEL;
            transText.textContent = `Stage ${currentStage}`;
            if (transSubText) transSubText.textContent = isBoss ? 'WARNING: BOSS INCOMING' : (LEVEL_NAMES[currentLevel] || '');
            Audio.playSFX('levelup');
        }

        totalFloor++;
        transEl.classList.remove('hidden');

        setTimeout(() => {
            transEl.classList.add('hidden');
            generateStage();
        }, 2000);
    }

    function resume() {
        if (!paused) return;
        paused = false;
        document.getElementById('pause-overlay').classList.add('hidden');
        canvas.style.cursor = 'none';
        setTouchControlsVisible(true);
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }

    function togglePause() {
        paused = !paused;
        const overlay = document.getElementById('pause-overlay');
        if (paused) {
            overlay.classList.remove('hidden');
            canvas.style.cursor = 'default';
            setTouchControlsVisible(false);
            saveRunCheckpoint('pause');
            pushPresence('away', true);
        } else {
            overlay.classList.add('hidden');
            canvas.style.cursor = 'none';
            setTouchControlsVisible(true);
            pushPresence('in_run', true);
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
    }

    function gameOver() {
        running = false;
        autosaveTimer = 0;
        partySyncTimer = 0;
        handledEventRooms = new Set();
        roomClearNotified = new Set();
        lastRoomKey = '';
        closeStageEvent();
        hideCombatToast();
        clearPartyLiveSnapshot();
        clearCoopRuntimeState();
        pushPresence('online', false);
        resetInputState();
        canvas.style.cursor = 'default';
        HUD.hide();
        setTouchControlsVisible(false);

        const isNewBest = Auth.saveRunStats(
            player.score,
            totalFloor,
            player.kills,
            player.gold
        );
        Auth.clearCheckpoint();

        document.getElementById('go-score').textContent  = Utils.formatNumber(player.score);
        document.getElementById('go-floors').textContent = `L${currentLevel} S${currentStage} (Floor ${totalFloor})`;
        document.getElementById('go-kills').textContent  = player.kills;
        document.getElementById('go-gold').textContent   = Utils.formatNumber(player.gold);

        if (isNewBest) {
            document.getElementById('go-newbest-row').style.display = 'flex';
        } else {
            document.getElementById('go-newbest-row').style.display = 'none';
        }

        setTimeout(() => { Utils.showScreen('gameover-screen'); }, 800);
    }

    function gameLoop(timestamp) {
        if (!running || paused) return;
        const fpsCap = Number(settings.fpsCap) || 0;
        if (fpsCap > 0) {
            const minFrameTime = 1000 / Utils.clamp(fpsCap, 30, 240);
            if ((timestamp - lastTime) < minFrameTime) {
                requestAnimationFrame(gameLoop);
                return;
            }
        }
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;
        update(dt);
        render();
        requestAnimationFrame(gameLoop);
    }

    function update(dt) {
        const rawDt = Math.max(0, Number(dt) || 0);
        const worldDt = consumeCombatTimeScale(rawDt);

        if (typeof Story !== 'undefined' && Story && typeof Story.update === 'function') {
            Story.update(rawDt);
        }
        updateCombatToast(rawDt);
        updateTouchButtonVisuals(rawDt);

        comboTimer = Math.max(0, comboTimer - worldDt);
        if (comboTimer <= 0) comboCount = 0;
        stairLockHintCooldown = Math.max(0, stairLockHintCooldown - worldDt);
        autosaveTimer += rawDt;
        if (autosaveTimer >= AUTOSAVE_INTERVAL) {
            autosaveTimer = 0;
            saveRunCheckpoint('autosave');
        }
        presenceSyncTimer += rawDt;
        if (presenceSyncTimer >= PRESENCE_SYNC_INTERVAL) {
            presenceSyncTimer = 0;
            pushPresence('in_run', true);
        }
        partySyncTimer += rawDt;
        if (partySyncTimer >= PARTY_SYNC_INTERVAL) {
            partySyncTimer = 0;
            refreshPartyLive();
        }
        if (running && isCoopOnlineReady()) {
            if (coopPushTimer <= 0 && coopPullTimer <= 0) {
                refreshCoopContext();
            }
            coopPushTimer += rawDt;
            coopPullTimer += rawDt;
            if (coopIsLeader && coopPushTimer >= COOP_PUSH_INTERVAL) {
                coopPushTimer = 0;
                pushCoopStageState();
            }
            if (coopPullTimer >= COOP_PULL_INTERVAL) {
                coopPullTimer = 0;
                pullCoopStageState();
            }
        } else {
            coopPushTimer = 0;
            coopPullTimer = 0;
        }

        // Input
        player.moveX = 0;
        player.moveY = 0;
        if (keys['KeyW'] || keys['ArrowUp'])    player.moveY = -1;
        if (keys['KeyS'] || keys['ArrowDown'])  player.moveY =  1;
        if (keys['KeyA'] || keys['ArrowLeft'])  player.moveX = -1;
        if (keys['KeyD'] || keys['ArrowRight']) player.moveX =  1;

        const touchMove = getTouchMoveVector(worldDt);
        if (Math.abs(touchMove.x) > 0.01) player.moveX = Utils.clamp(player.moveX + touchMove.x, -1, 1);
        if (Math.abs(touchMove.y) > 0.01) player.moveY = Utils.clamp(player.moveY + touchMove.y, -1, 1);

        player.mouseX = mouseX;
        player.mouseY = mouseY;
        if (Math.abs(touchMove.x) > TOUCH_AIM_DEADZONE || Math.abs(touchMove.y) > TOUCH_AIM_DEADZONE) {
            applyTouchAimFromMove(touchMove.x, touchMove.y);
            player.mouseX = mouseX;
            player.mouseY = mouseY;
        }
        if (isModalBlocking()) {
            player.moveX = 0;
            player.moveY = 0;
            const worldScale = isStoryBlocking() ? 0.35 : 0.14;
            const playerScale = isStoryBlocking() ? 0.2 : 0.08;
            dungeon.update(worldDt * worldScale);
            player.update(worldDt * playerScale, dungeon);
            Particles.update(worldDt * (isStoryBlocking() ? 0.3 : 0.18));

            if (!player.alive) { gameOver(); return; }

            const blockCamX = player.x - window.innerWidth / 2;
            const blockCamY = player.y - window.innerHeight / 2;
            camera.x = Utils.lerp(camera.x, blockCamX, 6 * worldDt);
            camera.y = Utils.lerp(camera.y, blockCamY, 6 * worldDt);

            HUD.update(player, currentLevel, currentStage, totalFloor, dungeon, STAGES_PER_LEVEL, LEVEL_NAMES, pressureLevel, comboCount);
            return;
        }

        // Update dungeon (torches, lava animation)
        dungeon.update(worldDt);

        // Update player
        player.update(worldDt, dungeon);

        // Discover rooms
        const currentRoom = dungeon.getRoomAt(player.x, player.y);
        if (currentRoom && !currentRoom.discovered) {
            currentRoom.discovered = true;
            dungeon.addTorchesForRoom(currentRoom);
        }

        const currentRoomKey = currentRoom ? roomEventKey(currentRoom) : '';
        if (currentRoomKey !== lastRoomKey) {
            lastRoomKey = currentRoomKey;
            if (currentRoom) {
                if (currentRoom.type === Dungeon.ROOM_TYPE.ELITE) {
                    showCombatToast('ELITE CHAMBER', 'warn');
                } else if (currentRoom.type === Dungeon.ROOM_TYPE.TREASURE) {
                    showCombatToast('TREASURE VAULT', 'good');
                } else if (currentRoom.type === Dungeon.ROOM_TYPE.REST) {
                    showCombatToast('REST SANCTUARY', 'good');
                } else if (currentRoom.type === Dungeon.ROOM_TYPE.BOSS) {
                    showCombatToast('BOSS SIGNAL', 'danger');
                }
            }
        }

        if (currentRoom && !currentRoom.cleared) {
            currentRoom.combatTime = (currentRoom.combatTime || 0) + worldDt;
        }
        updatePressure(worldDt, currentRoom);

        // Update enemies and items
        for (const enemy of enemies) enemy.update(worldDt, player.x, player.y, dungeon, pressureLevel, enemies);
        for (const item of items) item.update(worldDt);

        if (mouseDown) player.attack(collectAttackTargets());
        if (touchState.attackHeld) player.attack(collectAttackTargets());

        // Combat
        Combat.resolveAttack(player, enemies);
        Combat.resolveRangedHits(player, enemies);
        Combat.checkEnemyCollisions(player, enemies);
        collectItemsWithStory();
        processEnemyDefeats();

        // Pressure-based reinforcements
        if (currentRoom && !currentRoom.cleared && !currentRoom.boss) {
            const spawnedWaves = currentRoom.reinforcementsSpawned || 0;
            let aliveRoomEnemies = 0;
            for (const roomEnemy of (currentRoom.enemies || [])) {
                if (roomEnemy && roomEnemy.alive) aliveRoomEnemies += 1;
            }
            const roomTargetCap = currentRoom.type === Dungeon.ROOM_TYPE.ELITE
                ? 6
                : (4 + Math.min(2, Math.floor(totalFloor / 6)));
            const reinforcementThreshold = 1.9 + spawnedWaves * 0.7 + Math.max(0, aliveRoomEnemies - 2) * 0.16;
            const combatThresholdBase = currentRoom.type === Dungeon.ROOM_TYPE.ELITE ? 5.8 : 7.0;
            const combatThreshold = Math.max(4.8, combatThresholdBase + spawnedWaves * 2.8 - Math.min(2.2, totalFloor * 0.08));
            const canSpawnMore = aliveRoomEnemies <= roomTargetCap;
            if (canSpawnMore && pressureLevel >= reinforcementThreshold && (currentRoom.combatTime || 0) >= combatThreshold) {
                spawnReinforcementsForRoom(currentRoom);
            }
        }

        // Update boss
        if (boss && boss.alive) {
            boss.update(worldDt, player.x, player.y, dungeon);
            Boss.checkBossProjectiles(boss, player);

            boss.attackCooldown = Math.max(0, boss.attackCooldown - worldDt);
            const bDist = Math.hypot(boss.x - player.x, boss.y - player.y);
            if (bDist < boss.size + player.size && boss.alive && boss.attackCooldown <= 0) {
                const tookDamage = !!player.takeDamage(boss.damage);
                if (tookDamage) {
                    applyCombatFeedback({ type: 'player-damaged', amount: boss.damage, source: 'boss' });
                    if (settings.shake) screenShake = Math.max(screenShake, 10);
                }
                boss.attackCooldown = 0.9;
            }

            if (Combat.resolveBossDamage(player, boss) && settings.shake) {
                screenShake = Math.max(screenShake, 5);
            }

            updateBossBar(boss);
        }

        if (boss && !boss.alive && !boss.rewardGranted) {
            boss.rewardGranted = true;
            const xpVal = Math.round(boss.score * 0.8);
            player.gainXP(xpVal);
            player.score += boss.score;
            player.kills++;
            const bossDropA = spawnSeededDrops('drop:boss-a', () => Items.spawnDrops(boss.x, boss.y, totalFloor, 1.3, 'boss'));
            const bossDropB = spawnSeededDrops('drop:boss-b', () => Items.spawnDrops(boss.x, boss.y, totalFloor, 1.5, 'boss'));
            tagCoopLoot(bossDropA, 'boss:a');
            tagCoopLoot(bossDropB, 'boss:b');
            items.push(...bossDropA);
            items.push(...bossDropB);
            hideBossBar();
            showCombatToast('BOSS DOWN', 'good');
            if (typeof Story !== 'undefined' && Story && typeof Story.registerBossDefeat === 'function') {
                Story.registerBossDefeat();
            }
        }

        // Room cleared?
        if (currentRoom) {
            const roomEnemies = currentRoom.enemies || [];
            const bossInRoom = currentRoom.boss;
            if (bossInRoom && !bossInRoom.alive && !currentRoom.cleared) {
                currentRoom.cleared = true;
            }
            if (!bossInRoom && roomEnemies.length > 0 && roomEnemies.every((e) => !e.alive)) {
                if (!currentRoom.cleared) {
                    currentRoom.cleared = true;
                    player.score += 50 + currentLevel * 25;
                }
            }

            if (currentRoom.cleared) {
                const clearKey = roomEventKey(currentRoom);
                if (!roomClearNotified.has(clearKey) &&
                    currentRoom.type !== Dungeon.ROOM_TYPE.START &&
                    currentRoom.type !== Dungeon.ROOM_TYPE.REST &&
                    currentRoom.type !== Dungeon.ROOM_TYPE.BOSS) {
                    roomClearNotified.add(clearKey);
                    const text = currentRoom.type === Dungeon.ROOM_TYPE.ELITE ? 'ELITE ROOM CLEARED' : 'ROOM CLEARED';
                    showCombatToast(text, 'good');
                }
            }
        }

        if (currentRoom) {
            tryTriggerRoomEvent(currentRoom);
        }
        if (isEventBlocking()) {
            HUD.update(player, currentLevel, currentStage, totalFloor, dungeon, STAGES_PER_LEVEL, LEVEL_NAMES, pressureLevel, comboCount);
            return;
        }

        // Stairs and stage exit are locked until boss and story quest are done
        const ts = Dungeon.TILE_SIZE;
        const pgx = Math.floor(player.x / ts);
        const pgy = Math.floor(player.y / ts);
        const bossRoomClear = !boss || !boss.alive;
        const questClear = (typeof Story === 'undefined' || !Story || typeof Story.canUseStairs !== 'function')
            ? true
            : Story.canUseStairs();

        if (pgx === dungeon.stairsX && pgy === dungeon.stairsY) {
            if (bossRoomClear && questClear) {
                nextStage();
                return;
            }
            if (!questClear && stairLockHintCooldown <= 0) {
                stairLockHintCooldown = 1.3;
                if (typeof Story !== 'undefined' && Story && typeof Story.onExitBlocked === 'function') {
                    Story.onExitBlocked();
                }
            }
        }

        // Death?
        if (!player.alive) { gameOver(); return; }

        // Level up?
        if (player.pendingLevelUp && typeof window.showLevelUpModal === 'function') {
            paused = true;
            canvas.style.cursor = 'default';
            window.showLevelUpModal(player);
        }

        // Particles
        Particles.update(worldDt);

        // Screen shake
        screenShake *= 0.88;
        if (player.hitFlash > 0 && settings.shake) screenShake = Math.max(screenShake, 6);

        // Camera smooth follow
        const targetCamX = player.x - window.innerWidth / 2;
        const targetCamY = player.y - window.innerHeight / 2;
        camera.x = Utils.lerp(camera.x, targetCamX, 8 * worldDt);
        camera.y = Utils.lerp(camera.y, targetCamY, 8 * worldDt);

        // HUD
        HUD.update(player, currentLevel, currentStage, totalFloor, dungeon, STAGES_PER_LEVEL, LEVEL_NAMES, pressureLevel, comboCount);
    }

    function collectBattlefieldForces() {
        const forces = [];
        if (!player || !dungeon || !dungeon.theme?.isOverworld) return forces;

        const margin = 240;
        const minX = camera.x - margin;
        const minY = camera.y - margin;
        const maxX = camera.x + window.innerWidth + margin;
        const maxY = camera.y + window.innerHeight + margin;

        const inView = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
        const addForce = (x, y, vx, vy, radius, strength) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (!inView(x, y)) return;
            forces.push({
                x,
                y,
                vx: Number(vx) || 0,
                vy: Number(vy) || 0,
                radius,
                strength,
            });
        };

        addForce(
            player.x,
            player.y,
            player.vx || player.moveX * player.speed,
            player.vy || player.moveY * player.speed,
            player.dashing ? 120 : 86,
            player.dashing ? 1.9 : 1.05
        );

        if (Array.isArray(player.projectiles)) {
            for (const p of player.projectiles) {
                addForce(p.x, p.y, p.vx, p.vy, 58, 0.85);
            }
        }

        for (const enemy of enemies) {
            if (!enemy || !enemy.alive) continue;
            addForce(
                enemy.x,
                enemy.y,
                (enemy.dirX || 0) * (enemy.speed || 0) + (enemy.knockbackX || 0),
                (enemy.dirY || 0) * (enemy.speed || 0) + (enemy.knockbackY || 0),
                enemy.isElite ? 98 : 72,
                enemy.isElite ? 1.2 : 0.75
            );
            if (Array.isArray(enemy.projectiles)) {
                for (const p of enemy.projectiles) {
                    addForce(p.x, p.y, p.vx, p.vy, 54, 0.7);
                }
            }
        }

        if (boss && boss.alive) {
            addForce(
                boss.x,
                boss.y,
                (boss.dirX || 0) * (boss.speed || 0) + (boss.knockbackX || 0),
                (boss.dirY || 0) * (boss.speed || 0) + (boss.knockbackY || 0),
                132,
                1.5
            );
            if (Array.isArray(boss.projectiles)) {
                for (const p of boss.projectiles) {
                    addForce(p.x, p.y, p.vx, p.vy, 62, 0.9);
                }
            }
        }

        return forces.slice(0, 96);
    }

    function render() {
        // Background â€” use theme bg color
        const bgColor = dungeon ? dungeon.theme.bgColor : '#050508';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        ctx.save();
        if (screenShake > 0.5 && settings.shake) {
            const shakeAmount = settings.performanceMode ? screenShake * 0.45 : screenShake;
            ctx.translate(
                Utils.randFloat(-shakeAmount, shakeAmount),
                Utils.randFloat(-shakeAmount, shakeAmount)
            );
        }

        const battlefieldForces = collectBattlefieldForces();
        dungeon.draw(ctx, camera, window.innerWidth, window.innerHeight, battlefieldForces);

        for (const item of items) item.draw(ctx, camera);
        for (const enemy of enemies) enemy.draw(ctx, camera);
        if (boss && boss.alive) boss.draw(ctx, camera);
        drawPartyGhosts();
        player.draw(ctx, camera);
        Particles.draw(ctx, camera);

        ctx.restore();
        renderCombatImpactOverlay();

        // Vignette â€” themed color
        if (!settings.performanceMode) {
            const vig = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.width * 0.28,
                canvas.width / 2, canvas.height / 2, canvas.width * 0.72
            );
            vig.addColorStop(0, 'rgba(0,0,0,0)');
            vig.addColorStop(1, `${bgColor}cc`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Death overlay
        if (!player.alive) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    function quitToMenu() {
        if (running && player && player.alive) {
            saveRunCheckpoint('quit_to_menu');
        }
        running = false;
        paused = false;
        autosaveTimer = 0;
        partySyncTimer = 0;
        handledEventRooms = new Set();
        roomClearNotified = new Set();
        lastRoomKey = '';
        closeStageEvent();
        hideCombatToast();
        clearPartyLiveSnapshot();
        clearCoopRuntimeState();
        pushPresence('online', false);
        resetInputState();
        HUD.hide();
        canvas.style.cursor = 'default';
        setTouchControlsVisible(false);
        Utils.showScreen('menu-screen');
    }

    // â”€â”€ Boss HP bar helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function showBossBar(b) {
        const wrap = document.getElementById('boss-hpbar-wrap');
        if (!wrap) return;
        wrap.classList.remove('hidden', 'enraged');
        // Colour theme via CSS custom properties
        wrap.style.setProperty('--boss-color',      b.def.color);
        wrap.style.setProperty('--boss-color-dark', b.def.colorDark);
        document.getElementById('boss-hpbar-icon').textContent     = b.def.icon;
        document.getElementById('boss-hpbar-name').textContent     = b.def.name;
        document.getElementById('boss-hpbar-subtitle').textContent = b.def.subtitle;
        document.getElementById('boss-hpbar-phase').textContent    = '';
        document.getElementById('boss-hpbar-fill').style.width     = '100%';
        document.getElementById('boss-hpbar-hp').textContent       = `${b.hp} / ${b.maxHp}`;
    }

    function hideBossBar() {
        const wrap = document.getElementById('boss-hpbar-wrap');
        if (wrap) wrap.classList.add('hidden');
    }

    function updateBossBar(b) {
        const wrap = document.getElementById('boss-hpbar-wrap');
        if (!wrap || wrap.classList.contains('hidden')) return;
        const pct = Math.max(0, b.hp / b.maxHp * 100);
        document.getElementById('boss-hpbar-fill').style.width = `${pct.toFixed(1)}%`;
        document.getElementById('boss-hpbar-hp').textContent   = `${Math.max(0,b.hp)} / ${b.maxHp}`;
        if (b.enraged) {
            wrap.classList.add('enraged');
            document.getElementById('boss-hpbar-phase').textContent = 'ENRAGED';
        }
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('shadow_depths_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    settings = { ...settings, ...parsed };
                }
            }
        } catch (_err) {
            // Fall back to defaults if settings are malformed or storage is unavailable.
        }
        normalizeSettings();
        applySettings();
    }

    function saveSettings() {
        try {
            localStorage.setItem('shadow_depths_settings', JSON.stringify(settings));
        } catch (_err) {
            // Ignore write failures in restricted browser modes.
        }
    }

    function applySettings() {
        normalizeSettings();

        Audio.setSFXEnabled(settings.sfx);
        Audio.setMusicEnabled(settings.music);
        Particles.setEnabled(settings.particles);
        const particleQuality = settings.performanceMode ? 0.55 * settings.renderScale : settings.renderScale;
        Particles.setQuality(particleQuality);

        const sfxToggle = document.getElementById('sfx-toggle');
        const musicToggle = document.getElementById('music-toggle');
        const shakeToggle = document.getElementById('shake-toggle');
        const minimapToggle = document.getElementById('minimap-toggle');
        const particlesToggle = document.getElementById('particles-toggle');
        const performanceToggle = document.getElementById('performance-toggle');
        const storyToggle = document.getElementById('story-toggle');
        const fpsCapSelect = document.getElementById('fps-cap-select');
        const renderScaleSelect = document.getElementById('render-scale-select');

        if (sfxToggle) sfxToggle.checked = settings.sfx;
        if (musicToggle) musicToggle.checked = settings.music;
        if (shakeToggle) shakeToggle.checked = settings.shake;
        if (minimapToggle) minimapToggle.checked = settings.minimap;
        if (particlesToggle) particlesToggle.checked = settings.particles;
        if (performanceToggle) performanceToggle.checked = settings.performanceMode;
        if (storyToggle) storyToggle.checked = settings.storyDialogues !== false;
        if (fpsCapSelect) fpsCapSelect.value = String(settings.fpsCap);
        if (renderScaleSelect) renderScaleSelect.value = String(settings.renderScale);

        const minimap = document.getElementById('hud-minimap');
        if (minimap) minimap.style.display = settings.minimap ? 'block' : 'none';
        if (typeof Story !== 'undefined' && Story && typeof Story.setDialogueEnabled === 'function') {
            Story.setDialogueEnabled(settings.storyDialogues !== false);
        }
        if (canvas && ctx) resizeCanvas();
    }

    function updateSetting(key, value) {
        if (key === 'fpsCap') {
            const n = Number(value);
            value = Number.isFinite(n) && n >= 0 ? Math.round(n) : 60;
        } else if (key === 'renderScale') {
            const n = Number(value);
            value = Number.isFinite(n) ? Utils.clamp(n, 0.6, 1) : 1;
        } else if (key === 'performanceMode') {
            value = !!value;
            if (value && settings.fpsCap === 0) settings.fpsCap = 60;
        }

        settings[key] = value;
        saveSettings();
        applySettings();
    }

    function normalizeSettings() {
        settings.sfx = !!settings.sfx;
        settings.music = !!settings.music;
        settings.shake = !!settings.shake;
        settings.minimap = !!settings.minimap;
        settings.particles = !!settings.particles;
        settings.performanceMode = !!settings.performanceMode;
        settings.storyDialogues = settings.storyDialogues !== false;

        const fps = Number(settings.fpsCap);
        settings.fpsCap = Number.isFinite(fps) && fps >= 0 ? Math.round(fps) : 60;
        if (settings.fpsCap > 0) settings.fpsCap = Utils.clamp(settings.fpsCap, 30, 240);

        const scale = Number(settings.renderScale);
        settings.renderScale = Number.isFinite(scale) ? Utils.clamp(scale, 0.6, 1) : 1;
    }

    return {
        init,
        startNewRun,
        continueSavedRun,
        hasSavedRun,
        togglePause,
        resume,
        quitToMenu,
        loadSettings,
        updateSetting,
        get running() { return running; },
        get settings() { return settings; },
        get boss()    { return boss; },
    };
})();
