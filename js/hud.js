/* ============================================
   HUD - In-game heads-up display (Level/Stage)
   ============================================ */

const HUD = (() => {
    let minimapCtx = null;

    function init() {
        const mc = document.getElementById('minimap-canvas');
        if (mc) minimapCtx = mc.getContext('2d');
    }

    function update(player, level, stage, totalFloor, dungeon, stagesPerLevel, levelNames, pressure = 1, combo = 0) {
        const hudRoot = document.getElementById('game-hud');
        if (hudRoot) {
            const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
            hudRoot.classList.toggle('low-hp', hpRatio <= 0.34);
        }

        const healthEl = document.getElementById('hud-health');
        let hearts = '';
        for (let i = 0; i < player.maxHp; i++) {
            if (i < player.hp) {
                hearts += '<span class="heart">&#10084;</span>';
            } else {
                hearts += '<span class="heart" style="filter:grayscale(1) opacity(0.35)">&#10084;</span>';
            }
        }
        healthEl.innerHTML = hearts;

        const levelName = levelNames[level] || `Level ${level}`;
        const isBoss = stage === stagesPerLevel;
        const stageLabel = isBoss ? 'BOSS' : `Stage ${stage}/${stagesPerLevel}`;

        document.getElementById('hud-level-name').textContent = levelName;
        document.getElementById('hud-level-num').textContent = `Lv ${level}`;
        document.getElementById('hud-stage-num').textContent = stageLabel;

        const pipsEl = document.getElementById('hud-stage-pips');
        let pipHtml = '';
        for (let i = 1; i <= stagesPerLevel; i++) {
            const done = i < stage;
            const current = i === stage;
            const boss = i === stagesPerLevel;
            const cls = done ? 'pip done' : current ? 'pip current' : boss ? 'pip boss' : 'pip';
            pipHtml += `<span class="${cls}"></span>`;
        }
        pipsEl.innerHTML = pipHtml;

        document.getElementById('hud-score').textContent = `Score: ${Utils.formatNumber(player.score)}`;
        document.getElementById('hud-gold').textContent = `Gold: ${Utils.formatNumber(player.gold)}`;
        document.getElementById('hud-kills').textContent = `Kills: ${player.kills}`;
        const treasureEl = document.getElementById('hud-treasures');
        if (treasureEl) treasureEl.textContent = `Relics: ${player.treasures || 0}`;
        const comboEl = document.getElementById('hud-combo');
        if (comboEl) {
            const c = Math.max(0, Math.round(combo || 0));
            comboEl.textContent = `Combo: x${c}`;
            comboEl.classList.toggle('hot', c >= 3);
        }
        const threatEl = document.getElementById('hud-threat');
        if (threatEl) {
            const p = Number(pressure) || 1;
            let state = 'Calm';
            let cls = 'threat-calm';
            if (p >= 3.35) {
                state = 'Overload';
                cls = 'threat-overload';
            } else if (p >= 2.55) {
                state = 'High';
                cls = 'threat-high';
            } else if (p >= 1.75) {
                state = 'Alert';
                cls = 'threat-alert';
            }
            threatEl.textContent = `Threat: ${state}`;
            threatEl.className = `hud-threat ${cls}`;
        }

        const itemIcon = document.getElementById('hud-item-icon');
        itemIcon.textContent = player.heldItem ? player.heldItem.icon : '--';

        document.getElementById('dash-cooldown-fill').style.width =
            `${player.getDashCooldownPercent() * 100}%`;

        const skillFill = document.getElementById('skill-cooldown-fill');
        const skillLabel = document.getElementById('skill-label');
        const skillKeyBadge = document.getElementById('hud-skill-key');
        if (skillKeyBadge) {
            const rawKey = (typeof Game !== 'undefined' && Game.settings) ? Game.settings.skillKey : 'KeyQ';
            let keyDisplay = 'Q';
            if (rawKey === 'ShiftLeft') keyDisplay = 'LSHIFT';
            else if (rawKey === 'Space') keyDisplay = 'SPACE';
            skillKeyBadge.textContent = keyDisplay;
        }

        if (skillFill && skillLabel) {
            const maxCd = Math.max(0.1, Number(player.skillCooldownMax) || 5);
            const currentCd = Math.max(0, Number(player.skillCooldown) || 0);
            const readyPct = Utils.clamp(1 - (currentCd / maxCd), 0, 1);
            skillFill.style.width = `${(readyPct * 100).toFixed(1)}%`;
            const isRanged = player.attackMode === 'ranged';
            if (currentCd <= 0.01) {
                skillLabel.textContent = isRanged ? 'SKILL READY' : 'MOMENTUM READY';
            } else {
                skillLabel.textContent = isRanged
                    ? `SKILL ${(readyPct * 100).toFixed(0)}%`
                    : `MOMENTUM ${(readyPct * 100).toFixed(0)}%`;
            }
        }

        const xpFill = document.getElementById('hud-xp-fill');
        const xpLabel = document.getElementById('hud-xp-label');
        if (xpFill) xpFill.style.width = `${(player.getXPPercent() * 100).toFixed(1)}%`;
        if (xpLabel) xpLabel.textContent = `XP Lv${player.level}`;

        const charBadge = document.getElementById('hud-char-badge');
        if (charBadge && player.charDef) charBadge.textContent = player.charDef.icon;

        drawMinimap(player, dungeon);
    }

    function drawMinimap(player, dungeon) {
        if (!minimapCtx) return;
        const mw = 150;
        const mh = 150;
        const scale = 2;

        minimapCtx.fillStyle = 'rgba(5,5,8,0.92)';
        minimapCtx.fillRect(0, 0, mw, mh);

        const ts = Dungeon.TILE_SIZE;
        const pgx = Math.floor(player.x / ts);
        const pgy = Math.floor(player.y / ts);
        const offsetX = mw / 2 - pgx * scale;
        const offsetY = mh / 2 - pgy * scale;

        for (const room of dungeon.rooms) {
            if (!room.discovered) continue;
            const rx = room.x * scale + offsetX;
            const ry = room.y * scale + offsetY;
            const rw = room.w * scale;
            const rh = room.h * scale;

            switch (room.type) {
                case Dungeon.ROOM_TYPE.BOSS:
                    minimapCtx.fillStyle = 'rgba(239,68,68,0.55)';
                    break;
                case Dungeon.ROOM_TYPE.TREASURE:
                    minimapCtx.fillStyle = 'rgba(245,158,11,0.4)';
                    break;
                case Dungeon.ROOM_TYPE.REST:
                    minimapCtx.fillStyle = 'rgba(16,185,129,0.4)';
                    break;
                case Dungeon.ROOM_TYPE.ELITE:
                    minimapCtx.fillStyle = 'rgba(249,115,22,0.4)';
                    break;
                default:
                    minimapCtx.fillStyle = room.cleared ? 'rgba(26,26,46,0.8)' : 'rgba(60,40,80,0.5)';
            }
            minimapCtx.fillRect(rx, ry, rw, rh);
            minimapCtx.strokeStyle = 'rgba(124,58,237,0.25)';
            minimapCtx.lineWidth = 0.5;
            minimapCtx.strokeRect(rx, ry, rw, rh);
        }

        const sx = dungeon.stairsX * scale + offsetX;
        const sy = dungeon.stairsY * scale + offsetY;
        minimapCtx.fillStyle = dungeon.theme.stairsColor;
        minimapCtx.fillRect(sx - 2, sy - 2, 5, 5);

        const px = pgx * scale + offsetX;
        const py = pgy * scale + offsetY;
        minimapCtx.fillStyle = '#f1f5f9';
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, 3, 0, Math.PI * 2);
        minimapCtx.fill();

        const rgb = Dungeon.hexToRg(dungeon.theme.stairsColor);
        minimapCtx.strokeStyle = `rgba(${rgb}, 0.55)`;
        minimapCtx.lineWidth = 1.5;
        minimapCtx.strokeRect(0, 0, mw, mh);
    }

    function show() {
        document.getElementById('game-hud').style.display = 'block';
    }

    function hide() {
        document.getElementById('game-hud').style.display = 'none';
    }

    return { init, update, show, hide };
})();
