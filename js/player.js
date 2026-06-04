/* ============================================
   PLAYER - Player character with class and XP system
   ============================================ */

const Player = (() => {
    const DASH_SPEED = 460;
    const DASH_DURATION = 0.15;
    const ATTACK_BUFFER_WINDOW = 0.14;
    const DASH_BUFFER_WINDOW = 0.2;
    const AUTO_AIM_MAX_ANGLE = Math.PI * 0.22;
    const AUTO_AIM_RANGE_BONUS = 150;

    function skinToneForClass(classId) {
        if (classId === 'mage') return '#f0d2b3';
        if (classId === 'rogue') return '#d9b28c';
        if (classId === 'paladin') return '#cfa07a';
        return '#e2bc96';
    }

    function drawRoundedRect(ctx, x, y, w, h, r) {
        const rr = Math.max(1, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    class PlayerCharacter {
        constructor(x, y, charDef, charName) {
            this.x = x;
            this.y = y;
            this.charDef = charDef;
            this.charName = charName || charDef.name;
            this.size = 14;

            const s = charDef.stats;
            this.speed = s.speed;
            this.hp = s.maxHp;
            this.maxHp = s.maxHp;
            this.dashCooldownMax = s.dashCooldown;
            this.armor = s.armor || 0;
            this.alive = true;

            this.weaponTier = 0;
            const w0 = charDef.weaponTiers[0];
            this.attackDamage = w0.damage;
            this.attackRange = w0.range;
            this.attackArc = w0.arc * Math.PI;
            this.attackMode = charDef.attackMode || 'melee';
            this.projectileTemplate = {
                speed: charDef.projectile?.speed || 420,
                life: charDef.projectile?.life || 1.0,
                radius: charDef.projectile?.radius || 5,
                color: charDef.projectile?.color || charDef.color,
                canPierce: !!charDef.projectile?.canPierce,
            };
            this.projectiles = [];
            this.skillCooldown = 0;
            this.skillCooldownMax = charDef.skill?.cooldown || 5.0;

            this.xpMultiplier = charDef.id === 'mage' ? 1.3 : 1.0;
            this.goldMultiplier = 1.0;
            this.attackCooldownMult = 1.0;
            this.regenRate = charDef.id === 'paladin' ? 1 / 12 : 0;
            this.regenAccum = 0;

            this.vx = 0;
            this.vy = 0;
            this.moveX = 0;
            this.moveY = 0;

            this.dashing = false;
            this.dashTimer = 0;
            this.dashCooldown = 0;
            this.dashDirX = 0;
            this.dashDirY = 0;

            this.attacking = false;
            this.attackAngle = 0;
            this.attackTimer = 0;
            this.attackCooldown = 0;
            this.attackDuration = 0.15;
            this.attackSequence = 0;
            this.currentSwingId = 0;
            this.attackBufferTimer = 0;
            this.attackBufferTargets = null;
            this.dashBufferTimer = 0;

            this.mouseX = 0;
            this.mouseY = 0;
            this.aimAngle = 0;

            this.invincible = 0;
            this.hitFlash = 0;
            this.speedBuffTimer = 0;
            this.damageBuffTimer = 0;
            this.shieldHits = 0;
            this.frenzyTimer = 0;
            this.frenzyStacks = 0;

            this.critChance = charDef.id === 'rogue' ? 0.1 : 0;

            this.animTimer = 0;
            this.bobAmount = 0;

            this.gold = 0;
            this.heldItem = null;
            this.keys = 0;
            this.treasures = 0;

            this.kills = 0;
            this.score = 0;

            this.xp = 0;
            this.level = 1;
            this.xpToNextLevel = Characters.xpForLevel(1);
            this.pendingLevelUp = false;
            this.upgradesChosen = 0;
        }

        gainXP(amount) {
            const earned = Math.round(amount * this.xpMultiplier);
            this.xp += earned;
            Particles.emitText(this.x, this.y - 20, `+${earned} XP`, '#a78bfa');
            while (this.xp >= this.xpToNextLevel) {
                this.xp -= this.xpToNextLevel;
                this.level += 1;
                this.xpToNextLevel = Characters.xpForLevel(this.level);
                this.pendingLevelUp = true;
                Audio.playSFX('levelup');
            }
        }

        update(dt, dungeon) {
            if (!this.alive) return;

            this.animTimer += dt;
            this.invincible = Math.max(0, this.invincible - dt);
            this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
            this.attackTimer = Math.max(0, this.attackTimer - dt);
            this.attackCooldown = Math.max(0, this.attackCooldown - dt);
            this.dashCooldown = Math.max(0, this.dashCooldown - dt);
            this.skillCooldown = Math.max(0, this.skillCooldown - dt);
            this.speedBuffTimer = Math.max(0, this.speedBuffTimer - dt);
            this.damageBuffTimer = Math.max(0, this.damageBuffTimer - dt);
            this.frenzyTimer = Math.max(0, this.frenzyTimer - dt);
            this.attackBufferTimer = Math.max(0, this.attackBufferTimer - dt);
            this.dashBufferTimer = Math.max(0, this.dashBufferTimer - dt);
            if (this.frenzyTimer <= 0) this.frenzyStacks = 0;

            if (this.regenRate > 0) {
                this.regenAccum += this.regenRate * dt;
                if (this.regenAccum >= 1) {
                    this.regenAccum = 0;
                    this.heal(1);
                }
            }

            this.aimAngle = Utils.angle(0, 0, this.mouseX, this.mouseY);

            const frenzySpeedMult = 1 + this.frenzyStacks * 0.045;
            const currentSpeed = this.dashing
                ? DASH_SPEED
                : (this.speedBuffTimer > 0 ? this.speed * 1.5 * frenzySpeedMult : this.speed * frenzySpeedMult);

            let mx;
            let my;
            if (this.dashing) {
                mx = this.dashDirX * currentSpeed * dt;
                my = this.dashDirY * currentSpeed * dt;
                this.dashTimer -= dt;
                if (this.dashTimer <= 0) this.dashing = false;
                if (typeof Particles !== 'undefined' && Particles.emitTrail) {
                    Particles.emitTrail(this.x, this.y, this.charDef.color || '#a78bfa');
                }
            } else {
                const norm = Utils.normalize(this.moveX, this.moveY);
                mx = norm.x * currentSpeed * dt;
                my = norm.y * currentSpeed * dt;
            }

            const ts = Dungeon.TILE_SIZE;
            const oldX = this.x;
            const oldY = this.y;
            const nx = this.x + mx;
            const ny = this.y + my;

            if (dungeon.isWalkable(Math.floor((nx + (mx > 0 ? this.size : -this.size)) / ts), Math.floor(this.y / ts))) {
                this.x = nx;
            }
            if (dungeon.isWalkable(Math.floor(this.x / ts), Math.floor((ny + (my > 0 ? this.size : -this.size)) / ts))) {
                this.y = ny;
            }
            if (dt > 0) {
                this.vx = (this.x - oldX) / dt;
                this.vy = (this.y - oldY) / dt;
            } else {
                this.vx = 0;
                this.vy = 0;
            }

            this.tryConsumeBufferedActions();

            this.bobAmount = (Math.abs(this.moveX) > 0 || Math.abs(this.moveY) > 0)
                ? Math.sin(this.animTimer * 10) * 2.2
                : Math.sin(this.animTimer * 2) * 0.9;

            this.updateProjectiles(dt, dungeon);
            this.attacking = this.attackTimer > 0;
            if (this.dashing) Particles.emitTrail(this.x, this.y, this.charDef.color);
        }

        normalizeAngleDiff(diff) {
            let v = diff;
            while (v > Math.PI) v -= Math.PI * 2;
            while (v < -Math.PI) v += Math.PI * 2;
            return v;
        }

        chooseAutoAimAngle(targets) {
            const baseAngle = this.aimAngle;
            if (this.attackMode !== 'ranged' || !Array.isArray(targets) || !targets.length) return baseAngle;

            const assistRange = Math.max(150, this.attackRange + AUTO_AIM_RANGE_BONUS);
            const hasManualAim = Math.hypot(this.mouseX, this.mouseY) > 16;
            let bestAngle = baseAngle;
            let bestScore = Infinity;

            for (const target of targets) {
                if (!target || !target.alive) continue;
                const dist = Math.hypot((target.x || 0) - this.x, (target.y || 0) - this.y);
                const targetSize = Math.max(4, Number(target.size) || 12);
                if (dist > assistRange + targetSize) continue;

                const targetAngle = Utils.angle(this.x, this.y, target.x, target.y);
                const angleDiff = Math.abs(this.normalizeAngleDiff(targetAngle - baseAngle));
                const dynamicWindow = hasManualAim
                    ? AUTO_AIM_MAX_ANGLE + Math.min(0.22, targetSize / Math.max(18, dist))
                    : Math.PI;
                if (angleDiff > dynamicWindow) continue;

                const eliteBias = target.isElite ? -0.18 : 0;
                const bossBias = target.kind === 'boss' ? -0.26 : 0;
                const score = angleDiff * 2.7 + dist * 0.006 + eliteBias + bossBias;
                if (score < bestScore) {
                    bestScore = score;
                    bestAngle = targetAngle;
                }
            }
            return bestAngle;
        }

        tryConsumeBufferedActions() {
            if (!this.alive) {
                this.attackBufferTimer = 0;
                this.dashBufferTimer = 0;
                this.attackBufferTargets = null;
                return;
            }

            if (this.dashBufferTimer > 0 && this.dashCooldown <= 0 && !this.dashing) {
                this.dashBufferTimer = 0;
                this.performDashNow();
            }

            if (this.attackBufferTimer > 0 && this.attackCooldown <= 0) {
                const bufferedTargets = this.attackBufferTargets;
                this.attackBufferTimer = 0;
                this.attackBufferTargets = null;
                this.performAttackNow(bufferedTargets);
            }
        }

        performDashNow() {
            if (!this.alive || this.dashCooldown > 0 || this.dashing) return false;

            const skillKey = (typeof Game !== 'undefined' && Game.settings) ? Game.settings.skillKey : 'Space';
            if (skillKey === 'Space' && this.skillCooldown <= 0) {
                if (this.attackMode === 'ranged') {
                    this.triggerSkillShot();
                    this.skillCooldown = this.skillCooldownMax;
                } else if (this.attackMode === 'melee') {
                    this.triggerMeleeSkill();
                    this.skillCooldown = this.skillCooldownMax;
                }
            }

            let dx = this.moveX;
            let dy = this.moveY;
            if (dx === 0 && dy === 0) {
                dx = Math.cos(this.aimAngle);
                dy = Math.sin(this.aimAngle);
            }

            const norm = Utils.normalize(dx, dy);
            this.dashDirX = norm.x;
            this.dashDirY = norm.y;
            this.dashing = true;
            this.dashTimer = DASH_DURATION;
            this.dashCooldown = this.dashCooldownMax;
            this.invincible = DASH_DURATION + 0.05;
            this.dashBufferTimer = 0;
            Audio.playSFX('dash');
            return true;
        }

        performAttackNow(targets) {
            if (!this.alive || this.attackCooldown > 0) return false;

            const frenzyAttackRate = 1 + this.frenzyStacks * 0.07;
            if (this.attackMode === 'ranged') {
                const fireAngle = this.chooseAutoAimAngle(targets);
                this.aimAngle = fireAngle;
                const damage = this.getDamage();
                const lifeMult = this.charDef.id === 'mage' ? 1.15 : 1.0;
                const speedMult = this.charDef.id === 'rogue' ? 1.08 : 1.0;
                this.spawnProjectile(fireAngle, {
                    damage,
                    speed: this.projectileTemplate.speed * speedMult,
                    life: this.projectileTemplate.life * lifeMult,
                    radius: this.projectileTemplate.radius,
                    color: this.projectileTemplate.color,
                    canPierce: this.projectileTemplate.canPierce,
                });
                this.attackTimer = this.attackDuration * 0.45;
                this.attackCooldown = 0.19 * (this.attackCooldownMult || 1) / frenzyAttackRate;
                this.attacking = true;
                this.attackBufferTimer = 0;
                this.attackBufferTargets = null;
                Audio.playSFX('slash');
                return true;
            }

            this.attackSequence += 1;
            this.currentSwingId = this.attackSequence;
            this.attackAngle = this.aimAngle;
            this.attackTimer = this.attackDuration;
            this.attackCooldown = 0.31 * (this.attackCooldownMult || 1) / frenzyAttackRate;
            this.attacking = true;
            this.attackBufferTimer = 0;
            this.attackBufferTargets = null;
            Audio.playSFX('slash');
            return true;
        }

        dash() {
            if (!this.alive) return false;
            if (this.dashCooldown > 0 || this.dashing) {
                this.dashBufferTimer = DASH_BUFFER_WINDOW;
                return false;
            }
            return this.performDashNow();
        }

        useSkill() {
            if (!this.alive || this.skillCooldown > 0) return false;
            if (this.attackMode === 'ranged') {
                this.triggerSkillShot();
                this.skillCooldown = this.skillCooldownMax;
                return true;
            } else if (this.attackMode === 'melee') {
                this.triggerMeleeSkill();
                this.skillCooldown = this.skillCooldownMax;
                return true;
            }
            return false;
        }

        attack(targets = null) {
            if (!this.alive) return false;
            if (this.attackCooldown > 0) {
                this.attackBufferTimer = ATTACK_BUFFER_WINDOW;
                this.attackBufferTargets = Array.isArray(targets) ? targets.slice(0, 24) : null;
                return false;
            }
            return this.performAttackNow(targets);
        }

        spawnProjectile(angle, options = {}) {
            const speed = options.speed || this.projectileTemplate.speed;
            const life = options.life || this.projectileTemplate.life;
            const radius = options.radius || this.projectileTemplate.radius;
            const damage = Math.max(1, Math.ceil(options.damage || this.getDamage()));
            const color = options.color || this.projectileTemplate.color;
            const canPierce = options.canPierce !== undefined ? !!options.canPierce : this.projectileTemplate.canPierce;
            const spawnOffset = this.size + 8;
            const px = this.x + Math.cos(angle) * spawnOffset;
            const py = this.y + Math.sin(angle) * spawnOffset;

            this.projectiles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life,
                radius,
                damage,
                color,
                canPierce,
                remainingHits: canPierce ? 2 : 1,
                hitSet: new Set(),
            });
            Particles.emitTrail(px, py, color);
        }

        triggerSkillShot() {
            if (this.attackMode !== 'ranged' || !this.alive) return;

            const baseDamage = Math.ceil(this.getDamage() * 1.2);
            if (this.charDef.id === 'mage') {
                const burst = 5;
                for (let i = 0; i < burst; i++) {
                    const spread = (i - Math.floor(burst / 2)) * 0.16;
                    this.spawnProjectile(this.aimAngle + spread, {
                        damage: baseDamage + 1,
                        speed: this.projectileTemplate.speed * 0.92,
                        life: this.projectileTemplate.life * 1.25,
                        radius: this.projectileTemplate.radius + 1,
                        color: '#7dd3fc',
                        canPierce: true,
                    });
                }
                Particles.emitBurst(this.x, this.y, 10, '#67e8f9', 3);
            } else {
                const burst = 3;
                for (let i = 0; i < burst; i++) {
                    const spread = (i - 1) * 0.12;
                    this.spawnProjectile(this.aimAngle + spread, {
                        damage: baseDamage,
                        speed: this.projectileTemplate.speed * 1.16,
                        life: this.projectileTemplate.life * 0.95,
                        radius: this.projectileTemplate.radius,
                        color: '#d8b4fe',
                        canPierce: false,
                    });
                }
                Particles.emitBurst(this.x, this.y, 8, '#c084fc', 2.6);
            }
            Audio.playSFX('levelup');
        }

        triggerMeleeSkill() {
            if (this.attackMode !== 'melee' || !this.alive) return;

            if (this.charDef.id === 'warrior') {
                // Warrior: Cleave skill. Deals massive damage to all enemies in a 75px radius.
                const damage = Math.ceil(this.getDamage() * 1.5);
                let hitAny = false;
                const enemies = (typeof Game !== 'undefined' && Game.enemies) ? Game.enemies : [];
                const boss = (typeof Game !== 'undefined' && Game.boss) ? Game.boss : null;

                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const dist = Utils.dist(this.x, this.y, enemy.x, enemy.y);
                    if (dist <= 75 + enemy.size) {
                        let skipLocalDamage = false;
                        if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                            skipLocalDamage = !!window.__shadowCoopBeforeHit(enemy, damage);
                        }
                        if (!skipLocalDamage) {
                            enemy.takeDamage(damage, this.x, this.y);
                        }
                        if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                            window.__shadowCoopReportHit(enemy, damage);
                        }
                        hitAny = true;
                    }
                }

                if (boss && boss.alive) {
                    const dist = Utils.dist(this.x, this.y, boss.x, boss.y);
                    if (dist <= 75 + boss.size) {
                        let skipLocalDamage = false;
                        if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                            skipLocalDamage = !!window.__shadowCoopBeforeHit(boss, damage);
                        }
                        if (!skipLocalDamage) {
                            boss.takeDamage(damage, this.x, this.y);
                        }
                        if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                            window.__shadowCoopReportHit(boss, damage);
                        }
                        hitAny = true;
                    }
                }

                Particles.emitBurst(this.x, this.y, 16, '#ef4444', 3.2);
                Audio.playSFX('slash');
            } else if (this.charDef.id === 'paladin') {
                // Paladin: Holy Bastion. Heals 1 HP and shields against next 2 hits.
                this.heal(1);
                this.shieldHits = (this.shieldHits || 0) + 2;
                Particles.emitBurst(this.x, this.y, 15, '#fbbf24', 3.0);
                Audio.playSFX('levelup');
            }
        }

        updateProjectiles(dt, dungeon) {
            if (!this.projectiles.length) return;
            const ts = Dungeon.TILE_SIZE;

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;

                if (p.life <= 0) {
                    this.projectiles.splice(i, 1);
                    continue;
                }

                const gx = Math.floor(p.x / ts);
                const gy = Math.floor(p.y / ts);
                if (!dungeon.isWalkable(gx, gy)) {
                    Particles.emitBurst(p.x, p.y, 3, p.color, 1.1);
                    this.projectiles.splice(i, 1);
                }
            }
        }

        takeDamage(amount) {
            if (this.invincible > 0 || !this.alive) return false;
            if (this.shieldHits > 0) {
                this.shieldHits -= 1;
                this.invincible = 0.5;
                Particles.emitBurst(this.x, this.y, 8, '#7c3aed', 3);
                if (typeof Particles !== 'undefined' && Particles.emitText) {
                    Particles.emitText(this.x, this.y - 20, 'BLOCKED', '#a78bfa');
                }
                Audio.playSFX('pickup');
                return true;
            }

            const finalDmg = Math.max(1, amount - (this.armor || 0));
            const nextHp = this.hp - finalDmg;
            if (nextHp <= 0 && this.heldItem && this.heldItem.id === 'health_potion') {
                // Auto-consume potion on lethal damage to preserve flow in tense fights.
                this.heldItem = null;
                this.hp = Utils.clamp(nextHp + 2, 1, this.maxHp);
                this.hitFlash = 0.7;
                this.invincible = 0.75;
                Particles.emitText(this.x, this.y - 26, 'LAST STAND', '#fbbf24');
                Particles.emitBurst(this.x, this.y, 12, '#f59e0b', 3.1);
                Audio.playSFX('pickup');
                return true;
            }

            this.hp = nextHp;
            this.hitFlash = 1;
            this.invincible = 1.0;
            Audio.playSFX('hit');
            Particles.emitBurst(this.x, this.y, 10, '#ef4444', 3);
            if (typeof Particles !== 'undefined' && Particles.emitText) {
                Particles.emitText(this.x, this.y - 20, `-${finalDmg} HP`, '#fca5a5');
            }
            if (this.hp <= 0) {
                this.hp = 0;
                this.alive = false;
                Audio.playSFX('death');
                Particles.emitBurst(this.x, this.y, 25, '#ef4444', 5);
            }
            return true;
        }

        heal(amount) {
            const prev = this.hp;
            this.hp = Math.min(this.maxHp, this.hp + amount);
            if (this.hp > prev) {
                Particles.emitBurst(this.x, this.y, 6, '#22c55e', 2);
            }
        }

        collectItem(item) {
            if (item.collected) return;
            item.collected = true;
            const mult = this.goldMultiplier || 1;

            switch (item.type.id) {
                case 'health_potion':
                    if (this.heldItem === null && this.hp >= this.maxHp) this.heldItem = item.type;
                    else this.heal(1);
                    break;
                case 'speed_boost':
                    this.speedBuffTimer = 15;
                    break;
                case 'damage_boost':
                    this.damageBuffTimer = 20;
                    break;
                case 'shield':
                    this.shieldHits = 2;
                    break;
                case 'gold_small':
                    this.gold += Math.round(10 * mult);
                    this.score += Math.round(10 * mult);
                    Audio.playSFX('coin');
                    break;
                case 'gold_large':
                    this.gold += Math.round(50 * mult);
                    this.score += Math.round(50 * mult);
                    Audio.playSFX('coin');
                    break;
                case 'key':
                    this.keys += 1;
                    break;
                case 'treasure_relic':
                    this.treasures += 1;
                    this.gold += Math.round((item.type.value || 120) * 0.2);
                    this.score += item.type.value || 120;
                    Audio.playSFX('levelup');
                    break;
                case 'treasure_map':
                    this.treasures += 1;
                    this.gold += Math.round((item.type.value || 100) * 0.25);
                    this.score += item.type.value || 100;
                    Audio.playSFX('levelup');
                    break;
            }

            if (item.type.id !== 'gold_small' && item.type.id !== 'gold_large') {
                Audio.playSFX('pickup');
            }
            Particles.emitBurst(item.x, item.y, 8, item.type.color, 2);
        }

        useItem() {
            if (!this.heldItem || !this.alive) return;
            if (this.heldItem.id === 'health_potion') this.heal(1);
            this.heldItem = null;
        }

        getDamage() {
            let dmg = this.damageBuffTimer > 0 ? this.attackDamage * 1.5 : this.attackDamage;
            dmg *= 1 + this.frenzyStacks * 0.06;
            // Blood Frenzy: Warrior gains +15% damage when at or below half HP
            if (this.charDef.id === 'warrior' && this.hp <= Math.floor(this.maxHp / 2)) {
                dmg *= 1.15;
            }
            if (this.critChance > 0 && Math.random() < this.critChance) {
                dmg *= 2;
                Particles.emitText(this.x, this.y - 30, 'CRIT', '#f59e0b');
            }
            return Math.ceil(dmg);
        }

        onCombatKill(comboCount) {
            if (!this.alive) return;
            this.frenzyTimer = Math.min(9, this.frenzyTimer + 1.1);
            const stackGain = comboCount >= 6 ? 2 : 1;
            this.frenzyStacks = Math.min(6, this.frenzyStacks + stackGain);
        }

        resolveFacingDirection(angle) {
            const a = Number.isFinite(angle) ? angle : 0;
            const c = Math.cos(a);
            const s = Math.sin(a);
            if (Math.abs(c) > Math.abs(s)) return c >= 0 ? 'right' : 'left';
            return s >= 0 ? 'down' : 'up';
        }

        getPlayerSheet() {
            if (typeof SpriteAssets === 'undefined') return null;
            return SpriteAssets.getSheet(`player_${this.charDef.id}`)
                || SpriteAssets.getSheet('player_adventurer');
        }

        drawSpriteBody(ctx, sx, sy, colorHex) {
            const sheet = this.getPlayerSheet();
            if (!sheet) return false;

            const moving = Math.hypot(this.moveX, this.moveY) > 0.08 && !this.dashing;
            const motionAngle = moving ? Math.atan2(this.moveY, this.moveX) : this.aimAngle;
            const dir = this.resolveFacingDirection(motionAngle);
            const row = this.attacking ? 3 : (dir === 'up' ? 2 : (dir === 'down' ? 0 : 1));
            const flipX = dir === 'left';
            const anim = this.attacking ? 'attack' : (moving ? 'walk' : 'idle');

            const drawW = this.size * 2.95;
            const drawH = this.size * 2.95;
            const dx = sx - drawW * 0.5;
            const dy = sy - drawH * 0.78;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 6, this.size * 0.92, this.size * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            if (this.invincible > 0 && !this.dashing) {
                ctx.globalAlpha = 0.52 + Math.sin(this.animTimer * 20) * 0.22;
            }
            if (this.hitFlash > 0.5) {
                ctx.shadowColor = '#fca5a5';
                ctx.shadowBlur = 16;
            } else {
                ctx.shadowColor = `${colorHex}aa`;
                ctx.shadowBlur = 9;
            }

            const drew = SpriteAssets.drawAnimated(ctx, sheet, anim, this.animTimer, row, dx, dy, drawW, drawH, flipX);
            if (!drew) {
                ctx.restore();
                return false;
            }

            // Class tint keeps generated fallback sheets visually distinct.
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(${Dungeon.hexToRg(colorHex)}, 0.18)`;
            ctx.fillRect(dx, dy, drawW, drawH);
            ctx.restore();
            return true;
        }

        drawProceduralBody(ctx, sx, sy, col, dark, skin) {
            const facing = this.aimAngle;
            const cos = Math.cos(facing);
            const sin = Math.sin(facing);
            const stride = Math.sin(this.animTimer * 11) * (Math.abs(this.moveX) > 0 || Math.abs(this.moveY) > 0 ? 3 : 0.6);

            ctx.save();

            // Cape (behind body)
            ctx.fillStyle = dark;
            ctx.beginPath();
            const capeSway = Math.sin(this.animTimer * 3) * 2;
            ctx.moveTo(sx - 6, sy - 6);
            ctx.quadraticCurveTo(sx - 7 - cos * 4 + capeSway, sy + 6, sx - 4 - cos * 6 + capeSway * 0.6, sy + this.size + 4);
            ctx.lineTo(sx + 4 - cos * 6 + capeSway * 0.6, sy + this.size + 4);
            ctx.quadraticCurveTo(sx + 7 - cos * 4 + capeSway, sy + 6, sx + 6, sy - 6);
            ctx.closePath();
            ctx.fill();

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 6, this.size * 0.9, this.size * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            if (this.invincible > 0 && !this.dashing) {
                ctx.globalAlpha = 0.55 + Math.sin(this.animTimer * 20) * 0.25;
            }
            if (this.hitFlash > 0.5) {
                ctx.shadowColor = '#fca5a5';
                ctx.shadowBlur = 16;
            } else {
                ctx.shadowColor = `${col}aa`;
                ctx.shadowBlur = 8;
            }

            // Legs (stubby armored boots)
            ctx.fillStyle = dark;
            drawRoundedRect(ctx, sx - 6, sy + 3 + stride * 0.3, 5.5, 10, 2);
            ctx.fill();
            drawRoundedRect(ctx, sx + 0.5, sy + 3 - stride * 0.3, 5.5, 10, 2);
            ctx.fill();
            // Boot accents
            ctx.fillStyle = col;
            drawRoundedRect(ctx, sx - 5.5, sy + 9 + stride * 0.3, 5, 4, 1.5);
            ctx.fill();
            drawRoundedRect(ctx, sx + 0.5, sy + 9 - stride * 0.3, 5, 4, 1.5);
            ctx.fill();

            // Torso (armored plate)
            ctx.fillStyle = col;
            drawRoundedRect(ctx, sx - 9, sy - 10, 18, 15, 4);
            ctx.fill();

            // Chest detail (center stripe)
            const accentCol = this.charDef.colorGlow ? col : '#fde68a';
            ctx.fillStyle = '#fde68a';
            drawRoundedRect(ctx, sx - 2.5, sy - 8.5, 5, 11, 2);
            ctx.fill();

            // Belt
            ctx.fillStyle = dark;
            drawRoundedRect(ctx, sx - 8, sy + 2, 16, 3, 1.5);
            ctx.fill();

            // Shoulder pads
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(sx - 9, sy - 6, 4, 3.5, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(sx + 9, sy - 6, 4, 3.5, 0.2, 0, Math.PI * 2);
            ctx.fill();

            // Arms
            const shoulderY = sy - 6;
            const armReach = this.attacking ? 13 : 9;
            ctx.strokeStyle = dark;
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            // Left arm
            ctx.beginPath();
            ctx.moveTo(sx - 9, shoulderY);
            ctx.lineTo(sx - 12 + Math.cos(facing + Math.PI * 0.7) * 3, shoulderY + 7 + Math.sin(facing + Math.PI * 0.7) * 3);
            ctx.stroke();
            // Right arm
            ctx.beginPath();
            ctx.moveTo(sx + 9, shoulderY);
            ctx.lineTo(sx + 9 + Math.cos(facing) * armReach * 0.5, shoulderY + Math.sin(facing) * armReach * 0.5 + (this.attacking ? -2 : 5));
            ctx.stroke();
            // Hands
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(sx - 12 + Math.cos(facing + Math.PI * 0.7) * 3, shoulderY + 7 + Math.sin(facing + Math.PI * 0.7) * 3, 1.8, 0, Math.PI * 2);
            ctx.fill();
            const handX = sx + 9 + Math.cos(facing) * armReach * 0.5;
            const handY = shoulderY + Math.sin(facing) * armReach * 0.5 + (this.attacking ? -2 : 5);
            ctx.beginPath();
            ctx.arc(handX, handY, 1.8, 0, Math.PI * 2);
            ctx.fill();

            // Weapon (large sword)
            const weaponLen = this.attackRange * 0.42;
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(handX + Math.cos(facing - (this.attacking ? 0.6 : -0.1)) * weaponLen, handY + Math.sin(facing - (this.attacking ? 0.6 : -0.1)) * weaponLen);
            ctx.stroke();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(handX + Math.cos(facing) * 2, handY + Math.sin(facing) * 2);
            ctx.lineTo(handX + Math.cos(facing - (this.attacking ? 0.6 : -0.1)) * (weaponLen - 2), handY + Math.sin(facing - (this.attacking ? 0.6 : -0.1)) * (weaponLen - 2));
            ctx.stroke();

            // Head (oversized helmet)
            const headX = sx + cos * 1.5;
            const headY = sy - 18 + sin * 0.8;
            const headR = 9;

            // Helmet base
            ctx.fillStyle = '#e5e7eb';
            ctx.beginPath();
            ctx.arc(headX, headY, headR, 0, Math.PI * 2);
            ctx.fill();

            // Helmet top (colored)
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(headX, headY, headR, Math.PI, Math.PI * 2);
            ctx.fill();

            // Helmet band
            ctx.fillStyle = '#fde68a';
            drawRoundedRect(ctx, headX - headR + 1, headY - 1.5, headR * 2 - 2, 3, 1.5);
            ctx.fill();

            // Visor
            ctx.fillStyle = '#1a1a2e';
            drawRoundedRect(ctx, headX - 5.5, headY + 0.5, 11, 3.5, 1.5);
            ctx.fill();

            // Glowing eyes
            ctx.fillStyle = '#fde68a';
            ctx.shadowColor = '#fde68a';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(headX - 2 + cos * 0.5, headY + 2.2, 0.9, 0, Math.PI * 2);
            ctx.arc(headX + 2 + cos * 0.5, headY + 2.2, 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Crest triangle
            ctx.fillStyle = '#fde68a';
            ctx.beginPath();
            ctx.moveTo(headX, headY - headR + 1);
            ctx.lineTo(headX - 2.5, headY - headR + 5);
            ctx.lineTo(headX + 2.5, headY - headR + 5);
            ctx.closePath();
            ctx.fill();

            // Gem
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(headX, headY - headR + 4, 1.2, 0, Math.PI * 2);
            ctx.fill();

            // Horns / Wings
            ctx.fillStyle = '#fde68a';
            ctx.beginPath();
            ctx.moveTo(headX - headR + 2, headY - 2);
            ctx.quadraticCurveTo(headX - headR - 4, headY - 9, headX - headR - 1, headY - 14);
            ctx.quadraticCurveTo(headX - headR + 1, headY - 9, headX - headR + 3, headY - 5);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(headX + headR - 2, headY - 2);
            ctx.quadraticCurveTo(headX + headR + 4, headY - 9, headX + headR + 1, headY - 14);
            ctx.quadraticCurveTo(headX + headR - 1, headY - 9, headX + headR - 3, headY - 5);
            ctx.closePath();
            ctx.fill();

            // Helmet outline
            ctx.strokeStyle = dark;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(headX, headY, headR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }

        drawStatusRings(ctx, sx, sy) {
            if (this.shieldHits > 0) {
                ctx.strokeStyle = 'rgba(124, 58, 237, 0.65)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy - 4, this.size + 8, 0, Math.PI * 2);
                ctx.stroke();
            }

            if (this.speedBuffTimer > 0) {
                ctx.strokeStyle = 'rgba(6,182,212,0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, this.size + 5, 0, Math.PI * 2);
                ctx.stroke();
            }
            if (this.damageBuffTimer > 0) {
                ctx.strokeStyle = 'rgba(245,158,11,0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, this.size + 9, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        draw(ctx, cam) {
            if (!this.alive) return;

            const sx = this.x - cam.x;
            const sy = this.y - cam.y + this.bobAmount;
            const col = this.charDef.color;
            const dark = this.charDef.colorDark;
            const skin = skinToneForClass(this.charDef.id);

            const spriteRendered = this.drawSpriteBody(ctx, sx, sy, col);
            if (!spriteRendered) {
                this.drawProceduralBody(ctx, sx, sy, col, dark, skin);
            }

            ctx.save();
            this.drawStatusRings(ctx, sx, sy);
            ctx.restore();

            if (this.attackMode === 'melee' && this.attacking && this.attackTimer > 0) {
                this.drawAttackSlash(ctx, sx, sy);
            }
            this.drawProjectiles(ctx, cam);

            const chX = sx + Math.cos(this.aimAngle) * 40;
            const chY = sy + Math.sin(this.aimAngle) * 40;
            ctx.strokeStyle = `rgba(${Dungeon.hexToRg(col)}, 0.55)`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(chX, chY, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(chX - 3, chY);
            ctx.lineTo(chX + 3, chY);
            ctx.moveTo(chX, chY - 3);
            ctx.lineTo(chX, chY + 3);
            ctx.stroke();
        }

        drawAttackSlash(ctx, sx, sy) {
            const progress = 1 - (this.attackTimer / this.attackDuration);
            const startAngle = this.attackAngle - this.attackArc / 2;
            const sweepAngle = this.attackArc * progress;
            const col = this.charDef.color;

            ctx.save();
            ctx.strokeStyle = `rgba(${Dungeon.hexToRg(col)}, ${1 - progress})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = col;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(sx, sy, this.attackRange, startAngle, startAngle + sweepAngle);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255,255,255, ${0.4 - progress * 0.4})`;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(sx, sy, this.attackRange * 0.8, startAngle, startAngle + sweepAngle);
            ctx.stroke();
            ctx.restore();
        }

        drawProjectiles(ctx, cam) {
            if (!this.projectiles.length) return;
            for (const p of this.projectiles) {
                const px = p.x - cam.x;
                const py = p.y - cam.y;
                ctx.save();
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(px, py, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        getDashCooldownPercent() {
            if (this.dashCooldown <= 0) return 1;
            return 1 - (this.dashCooldown / this.dashCooldownMax);
        }

        getXPPercent() {
            return this.xp / this.xpToNextLevel;
        }

        getMomentumMultiplier() {
            return 1 + this.frenzyStacks * 0.06;
        }
    }

    return { PlayerCharacter };
})();
