/* ============================================
   BOSS — 5 Unique Level Bosses with Scaled AI
   ============================================ */

const Boss = (() => {
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

    function bossSkinTone(id) {
        if (id === 'bone_colossus') return '#d6d3d1';
        if (id === 'plague_rat') return '#c6a27e';
        if (id === 'inferno_drake') return '#d8a87e';
        if (id === 'void_wraith') return '#b8a3d7';
        return '#be9877';
    }

    // ── Per-level boss definitions ──────────────────────────────────────────
    const BOSS_DEFS = {
        1: {
            id: 'bone_colossus',
            name: 'Bone Colossus',
            subtitle: 'Guardian of the Crypts',
            icon: '💀',
            color: '#e2e8f0',
            colorDark: '#94a3b8',
            colorGlow: 'rgba(226,232,240,0.6)',
            size: 30,
            baseHp: 60,
            baseSpeed: 55,
            baseDamage: 2,
            score: 600,
            shootCooldown: 2.2,
            specialCooldown: 5.0,
            phaseMsg: 'BONE STORM!',
            bgFlash: 'rgba(200,200,220,0.08)',
        },
        2: {
            id: 'plague_rat',
            name: 'Plague Rat King',
            subtitle: 'Sovereign of the Sewers',
            icon: '🐀',
            color: '#4ade80',
            colorDark: '#166534',
            colorGlow: 'rgba(74,222,128,0.6)',
            size: 26,
            baseHp: 50,
            baseSpeed: 90,
            baseDamage: 1.5,
            score: 700,
            shootCooldown: 1.8,
            specialCooldown: 6.0,
            phaseMsg: 'SWARM!',
            bgFlash: 'rgba(50,200,50,0.07)',
        },
        3: {
            id: 'inferno_drake',
            name: 'Inferno Drake',
            subtitle: 'Flame of the Ruins',
            icon: '🔥',
            color: '#fb923c',
            colorDark: '#9a3412',
            colorGlow: 'rgba(251,146,60,0.7)',
            size: 34,
            baseHp: 80,
            baseSpeed: 70,
            baseDamage: 3,
            score: 850,
            shootCooldown: 1.4,
            specialCooldown: 7.0,
            phaseMsg: 'INFERNO RAGE!',
            bgFlash: 'rgba(250,100,0,0.09)',
        },
        4: {
            id: 'void_wraith',
            name: 'Void Wraith',
            subtitle: 'Unmaker of Worlds',
            icon: '🌀',
            color: '#a855f7',
            colorDark: '#4c1d95',
            colorGlow: 'rgba(168,85,247,0.7)',
            size: 28,
            baseHp: 90,
            baseSpeed: 80,
            baseDamage: 2.5,
            score: 1000,
            shootCooldown: 1.2,
            specialCooldown: 5.5,
            phaseMsg: 'VOID COLLAPSE!',
            bgFlash: 'rgba(100,0,200,0.1)',
        },
        5: {
            id: 'shadow_overlord',
            name: 'Shadow Overlord',
            subtitle: 'The Eternal Darkness',
            icon: '☠️',
            color: '#ef4444',
            colorDark: '#7f1d1d',
            colorGlow: 'rgba(239,68,68,0.8)',
            size: 38,
            baseHp: 140,
            baseSpeed: 85,
            baseDamage: 4,
            score: 1500,
            shootCooldown: 1.0,
            specialCooldown: 4.5,
            phaseMsg: '⚠️ FINAL FORM!',
            bgFlash: 'rgba(200,0,0,0.12)',
        },
    };

    // ── Balance scaling: boss stats adjust relative to player ───────────────
    function calcStats(def, player) {
        const pLevel     = player ? player.level       : 1;
        const pMaxHp     = player ? player.maxHp        : 5;
        const pDamage    = player ? player.attackDamage : 2;
        const pArmor     = player ? (player.armor || 0) : 0;

        // HP: base × (1 + 0.15 per player level), target ~25–35 hits to kill
        const hp = Math.round(def.baseHp * (1 + pLevel * 0.15));

        // Speed: cap relative to player speed
        const speed = def.baseSpeed + pLevel * 1.5;

        // Damage: should be proportional to player's max HP
        // Aim: player takes 4–6 hits before dying (ignoring armor)
        const rawDmg    = def.baseDamage + pLevel * 0.3;
        const scaledDmg = Math.max(1, rawDmg - pArmor * 0.5);

        return { hp, speed, damage: scaledDmg };
    }

    // ── Boss class ───────────────────────────────────────────────────────────
    class BossEnemy {
        constructor(x, y, levelNum, player) {
            this.def      = BOSS_DEFS[Math.min(levelNum, 5)] || BOSS_DEFS[5];
            this.levelNum = levelNum;

            const scaled   = calcStats(this.def, player);
            this.x         = x;
            this.y         = y;
            this.size      = this.def.size;
            this.color     = this.def.color;
            this.hp        = scaled.hp;
            this.maxHp     = scaled.hp;
            this.speed     = scaled.speed;
            this.damage    = scaled.damage;
            this.alive     = true;
            this.isBoss    = true;

            // Phase 2 at 50%
            this.phase         = 1;
            this.enraged       = false;
            this.phaseShown    = false;
            this.enrageMsg     = 0;     // countdown timer for flash msg

            // AI timers
            this.shootCooldown   = 0;
            this.specialCooldown = 0;
            this.teleportTimer   = 0;
            this.aiTimer         = 0;
            this.chargeCooldown  = 0;
            this.chargeActive    = false;
            this.chargeDirX      = 0;
            this.chargeDirY      = 0;
            this.chargeTimer     = 0;

            // Visuals
            this.hitFlash    = 0;
            this.knockbackX  = 0;
            this.knockbackY  = 0;
            this.animTimer   = 0;
            this.bobAmount   = 0;
            this.haloAngle   = 0;
            this.shieldActive = false;
            this.shieldTimer  = 0;

            // Projectiles (from boss)
            this.projectiles = [];

            // Melee contact
            this.attackCooldown = 0;

            // Score
            this.score = this.def.score;
        }

        // ── Update ──────────────────────────────────────────────────────────
        update(dt, playerX, playerY, dungeon) {
            if (!this.alive) return;

            this.animTimer      += dt;
            this.bobAmount       = Math.sin(this.animTimer * 3) * 3;
            this.haloAngle      += dt * (this.enraged ? 3 : 1.5);
            this.hitFlash        = Math.max(0, this.hitFlash - dt * 4);
            this.shootCooldown   -= dt;
            this.specialCooldown -= dt;
            this.chargeCooldown  -= dt;
            this.enrageMsg       = Math.max(0, this.enrageMsg - dt);
            this.shieldTimer     = Math.max(0, this.shieldTimer - dt);
            this.shieldActive    = this.shieldTimer > 0;

            // Knockback decay
            this.x += this.knockbackX * dt * 8;
            this.y += this.knockbackY * dt * 8;
            this.knockbackX *= 0.82;
            this.knockbackY *= 0.82;

            // Phase 2 trigger at 50% HP
            if (!this.enraged && this.hp <= this.maxHp * 0.5) {
                this.enterPhase2();
            }

            // Dispatch unique AI per boss
            const dist = Math.hypot(this.x - playerX, this.y - playerY);
            this._runAI(dt, playerX, playerY, dungeon, dist);

            // Update projectiles
            this.projectiles = this.projectiles.filter(p => {
                p.x   += p.vx * dt;
                p.y   += p.vy * dt;
                p.life -= dt;
                if (p.homing && p.life > 0.5) {
                    const a = Math.atan2(playerY - p.y, playerX - p.x);
                    p.vx  += Math.cos(a) * 120 * dt;
                    p.vy  += Math.sin(a) * 120 * dt;
                    const spd = Math.hypot(p.vx, p.vy);
                    if (spd > p.maxSpeed) { p.vx = p.vx/spd*p.maxSpeed; p.vy = p.vy/spd*p.maxSpeed; }
                }
                return p.life > 0;
            });
        }

        enterPhase2() {
            this.enraged         = true;
            this.phase           = 2;
            this.speed          *= 1.4;
            this.damage         *= 1.25;
            this.shootCooldown   = this.def.shootCooldown * 0.65;
            this.specialCooldown = this.def.specialCooldown * 0.6;
            this.enrageMsg       = 3.0;
            Particles.emitBurst(this.x, this.y, 30, this.def.color, 6);
            Audio.playSFX('levelup');
        }

        _runAI(dt, px, py, dungeon, dist) {
            switch (this.def.id) {
                case 'bone_colossus': this._aiBoneColossus(dt, px, py, dungeon, dist); break;
                case 'plague_rat':    this._aiPlagueRat(dt, px, py, dungeon, dist); break;
                case 'inferno_drake': this._aiInfernoDrake(dt, px, py, dungeon, dist); break;
                case 'void_wraith':   this._aiVoidWraith(dt, px, py, dungeon, dist); break;
                case 'shadow_overlord': this._aiShadowOverlord(dt, px, py, dungeon, dist); break;
            }
        }

        // ── Boss 1: Bone Colossus — stomps + bone barrage + shield phase ────
        _aiBoneColossus(dt, px, py, dungeon, dist) {
            // Chase player
            this._moveToward(px, py, dt, dungeon);

            // Bone throw (spread shot)
            if (this.shootCooldown <= 0) {
                const a = Math.atan2(py - this.y, px - this.x);
                const spread = this.enraged ? 5 : 3;
                for (let i = 0; i < spread; i++) {
                    const off = (i - Math.floor(spread/2)) * 0.28;
                    this._shoot(a + off, 170, 2.5, false);
                }
                this.shootCooldown = this.def.shootCooldown * (this.enraged ? 0.7 : 1);
                Audio.playSFX('slash');
            }

            // Special: Shield phase (immune for 1.5s, then shatters outward)
            if (this.specialCooldown <= 0) {
                this.shieldTimer     = 1.5;
                this.specialCooldown = this.def.specialCooldown;
                Particles.emitBurst(this.x, this.y, 16, this.def.color, 4);
                // After shield, bone shatter
                setTimeout(() => {
                    if (!this.alive) return;
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2;
                        this._shoot(a, 200, 1.8, false);
                    }
                    Audio.playSFX('hit');
                }, 1500);
            }
        }

        // ── Boss 2: Plague Rat King — fast dash + poison spit + mini summon ─
        _aiPlagueRat(dt, px, py, dungeon, dist) {
            // Charge attack
            if (this.chargeActive) {
                const spd = this.speed * 2.8 * dt;
                const nx = this.x + this.chargeDirX * spd;
                const ny = this.y + this.chargeDirY * spd;
                const ts = Dungeon.TILE_SIZE;
                if (dungeon.isWalkable(Math.floor(nx/ts), Math.floor(this.y/ts))) this.x = nx;
                if (dungeon.isWalkable(Math.floor(this.x/ts), Math.floor(ny/ts))) this.y = ny;
                this.chargeTimer -= dt;
                if (this.chargeTimer <= 0) this.chargeActive = false;
                return;
            }

            this._moveToward(px, py, dt, dungeon);

            // Poison spit (homing)
            if (this.shootCooldown <= 0) {
                const a = Math.atan2(py - this.y, px - this.x);
                this._shoot(a, 150, 3.0, this.enraged); // homing in phase 2
                if (this.enraged) this._shoot(a + 0.4, 140, 3.0, false);
                this.shootCooldown = this.def.shootCooldown * (this.enraged ? 0.6 : 1);
                Audio.playSFX('slash');
            }

            // Special: charge dash
            if (this.chargeCooldown <= 0 && dist < 300) {
                const a = Math.atan2(py - this.y, px - this.x);
                this.chargeDirX  = Math.cos(a);
                this.chargeDirY  = Math.sin(a);
                this.chargeActive = true;
                this.chargeTimer  = 0.35;
                this.chargeCooldown = this.def.specialCooldown;
                Particles.emitBurst(this.x, this.y, 10, this.def.color, 3);
            }
        }

        // ── Boss 3: Inferno Drake — fireball burst + fire cone + lava trail ─
        _aiInfernoDrake(dt, px, py, dungeon, dist) {
            this._moveToward(px, py, dt, dungeon);

            // Fireball burst
            if (this.shootCooldown <= 0) {
                const a = Math.atan2(py - this.y, px - this.x);
                const count = this.enraged ? 5 : 3;
                for (let i = 0; i < count; i++) {
                    const off = (i - Math.floor(count/2)) * 0.22;
                    setTimeout(() => {
                        if (!this.alive) return;
                        this._shoot(a + off, 200, 2.2, false);
                        Audio.playSFX('slash');
                    }, i * 120);
                }
                this.shootCooldown = this.def.shootCooldown * (this.enraged ? 0.55 : 1);
            }

            // Special: 360° flame ring
            if (this.specialCooldown <= 0) {
                const count = this.enraged ? 16 : 10;
                for (let i = 0; i < count; i++) {
                    const a = (i / count) * Math.PI * 2;
                    this._shoot(a, 160, 2.5, false);
                }
                this.specialCooldown = this.def.specialCooldown;
                Particles.emitBurst(this.x, this.y, 24, '#ff6600', 5);
                Audio.playSFX('levelup');
            }

            // Lava trail particles
            if (Math.random() < 0.3) {
                Particles.emitBurst(this.x, this.y, 1, '#ff4400', 1);
            }
        }

        // ── Boss 4: Void Wraith — teleport + homing orbs + void pulse ───────
        _aiVoidWraith(dt, px, py, dungeon, dist) {
            // Teleport near player every few seconds
            this.teleportTimer -= dt;
            if (this.teleportTimer <= 0 && dist > 120) {
                this._teleport(px, py, dungeon);
                this.teleportTimer = this.enraged ? 2.2 : 3.5;
            } else {
                this._moveToward(px, py, dt, dungeon);
            }

            // Homing void orbs
            if (this.shootCooldown <= 0) {
                const a = Math.atan2(py - this.y, px - this.x);
                this._shoot(a, 120, 4.0, true);   // homing
                if (this.enraged) {
                    this._shoot(a + Math.PI, 130, 3.5, true); // reverse homing
                }
                this.shootCooldown = this.def.shootCooldown * (this.enraged ? 0.5 : 1);
                Audio.playSFX('slash');
            }

            // Special: void pulse ring
            if (this.specialCooldown <= 0) {
                const count = this.enraged ? 12 : 8;
                for (let i = 0; i < count; i++) {
                    const a = (i / count) * Math.PI * 2;
                    this._shoot(a, 180, 2.0, true);
                }
                this.specialCooldown = this.def.specialCooldown;
                Particles.emitBurst(this.x, this.y, 20, this.def.color, 4);
            }
        }

        // ── Boss 5: Shadow Overlord — uses ALL patterns ──────────────────────
        _aiShadowOverlord(dt, px, py, dungeon, dist) {
            // Phase 1: heavy chase + burst fire
            // Phase 2: teleport + combined attack patterns

            if (this.enraged && this.teleportTimer <= 0) {
                this._teleport(px, py, dungeon);
                this.teleportTimer = 1.8;
            } else {
                this._moveToward(px, py, dt, dungeon);
                this.teleportTimer -= dt;
            }

            if (this.shootCooldown <= 0) {
                const a = Math.atan2(py - this.y, px - this.x);
                const count = this.enraged ? 6 : 4;
                // Spread + homing combo
                for (let i = 0; i < count; i++) {
                    const off = (i - (count-1)/2) * 0.25;
                    this._shoot(a + off, this.enraged ? 200 : 160, 3.0, i % 2 === 0);
                }
                this.shootCooldown = this.def.shootCooldown * (this.enraged ? 0.45 : 1);
                Audio.playSFX('slash');
            }

            // Special: 3-ring hellstorm
            if (this.specialCooldown <= 0) {
                const rings = this.enraged ? [8, 12, 16] : [6, 10];
                rings.forEach((count, ri) => {
                    setTimeout(() => {
                        if (!this.alive) return;
                        for (let i = 0; i < count; i++) {
                            const a = (i / count) * Math.PI * 2 + (ri * 0.3);
                            this._shoot(a, 150 + ri * 20, 2.5 + ri * 0.3, false);
                        }
                        Particles.emitBurst(this.x, this.y, 10, this.def.color, 3);
                    }, ri * 300);
                });
                this.specialCooldown = this.def.specialCooldown;
                Audio.playSFX('levelup');
            }
        }

        // ── Helpers ─────────────────────────────────────────────────────────
        _moveToward(px, py, dt, dungeon) {
            if (this.chargeActive) return;
            const ts  = Dungeon.TILE_SIZE;
            const spd = this.speed * dt;
            const a   = Math.atan2(py - this.y, px - this.x);
            const nx  = this.x + Math.cos(a) * spd;
            const ny  = this.y + Math.sin(a) * spd;
            if (dungeon.isWalkable(Math.floor(nx/ts), Math.floor(this.y/ts))) this.x = nx;
            if (dungeon.isWalkable(Math.floor(this.x/ts), Math.floor(ny/ts))) this.y = ny;
        }

        _teleport(px, py, dungeon) {
            const ts = Dungeon.TILE_SIZE;
            for (let i = 0; i < 20; i++) {
                const ang  = Math.random() * Math.PI * 2;
                const dist = 80 + Math.random() * 80;
                const nx   = px + Math.cos(ang) * dist;
                const ny   = py + Math.sin(ang) * dist;
                if (dungeon.isWalkable(Math.floor(nx/ts), Math.floor(ny/ts))) {
                    Particles.emitBurst(this.x, this.y, 10, this.def.color, 3);
                    this.x = nx;
                    this.y = ny;
                    Particles.emitBurst(this.x, this.y, 10, this.def.color, 3);
                    break;
                }
            }
        }

        _shoot(angle, speed, life, homing) {
            this.projectiles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life,
                damage:   this.damage,
                homing:   !!homing,
                maxSpeed: speed * 1.4,
                color:    this.def.color,
            });
        }

        // ── Damage ──────────────────────────────────────────────────────────
        takeDamage(amount, fromX, fromY) {
            if (!this.alive) return;
            if (this.shieldActive) {
                Particles.emitBurst(this.x, this.y, 6, '#7c3aed', 2);
                return;
            }
            this.hp -= amount;
            this.hitFlash = 1;
            const ang = Math.atan2(this.y - fromY, this.x - fromX);
            this.knockbackX = Math.cos(ang) * 60;
            this.knockbackY = Math.sin(ang) * 60;
            Particles.emitBurst(this.x, this.y, 8, this.def.color, 2);
            if (this.hp <= 0) {
                this.hp = 0;
                this.alive = false;
                Audio.playSFX('enemydeath');
                Particles.emitBurst(this.x, this.y, 40, this.def.color, 6);
                Particles.emitBurst(this.x, this.y, 20, '#ffffff', 4);
            } else {
                Audio.playSFX('hit');
            }
        }

        // ── Draw ─────────────────────────────────────────────────────────────
        resolveFacingDirection(angle) {
            const a = Number.isFinite(angle) ? angle : 0;
            const c = Math.cos(a);
            const s = Math.sin(a);
            if (Math.abs(c) > Math.abs(s)) return c >= 0 ? 'right' : 'left';
            return s >= 0 ? 'down' : 'up';
        }

        getBossSheet() {
            if (typeof SpriteAssets === 'undefined') return null;
            return SpriteAssets.getSheet(`boss_${this.def.id}`) || SpriteAssets.getSheet('boss_titan');
        }

        drawSpriteBody(ctx, sx, sy) {
            const sheet = this.getBossSheet();
            if (!sheet) return false;

            const moving = this.chargeActive || Math.hypot(this.knockbackX, this.knockbackY) > 18;
            const attacking = this.chargeActive || this.shootCooldown < 0.16 || this.specialCooldown < 0.18;
            const dir = this.resolveFacingDirection(this.haloAngle * 0.35);
            const row = attacking ? 3 : (dir === 'up' ? 2 : (dir === 'down' ? 0 : 1));
            const flipX = dir === 'left';
            const anim = attacking ? 'attack' : (moving ? 'walk' : 'idle');

            const drawW = this.size * 2.85;
            const drawH = this.size * 2.85;
            const dx = sx - drawW * 0.5;
            const dy = sy - drawH * 0.76;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 5, this.size * 0.85, this.size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowColor = this.hitFlash > 0.5 ? '#ffffff' : this.def.color;
            ctx.shadowBlur = this.enraged ? 26 : 16;
            const drew = SpriteAssets.drawAnimated(ctx, sheet, anim, this.animTimer, row, dx, dy, drawW, drawH, flipX);
            if (!drew) {
                ctx.restore();
                return false;
            }

            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(${Dungeon.hexToRg(this.def.color)}, ${this.enraged ? 0.3 : 0.2})`;
            ctx.fillRect(dx, dy, drawW, drawH);
            ctx.restore();
            return true;
        }

        draw(ctx, cam) {
            if (!this.alive) return;
            const sx = this.x - cam.x;
            const sy = this.y - cam.y + this.bobAmount;
            const spriteRendered = this.drawSpriteBody(ctx, sx, sy);
            const col = this.def.color;
            if (!spriteRendered) {
            const dark = this.def.colorDark;
            const skin = bossSkinTone(this.def.id);
            const faceAngle = this.haloAngle * 0.35;
            const stride = Math.sin(this.animTimer * 8) * 3.5;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 5, this.size * 0.85, this.size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = this.enraged ? 0.45 : 0.25;
            ctx.strokeStyle = col;
            ctx.lineWidth   = this.enraged ? 3 : 2;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 18;
            const rings = this.enraged ? 2 : 1;
            for (let r = 0; r < rings; r++) {
                const rOff = r * 0.8;
                ctx.beginPath();
                ctx.arc(sx, sy, this.size + 10 + r * 6 + Math.sin(this.haloAngle + rOff) * 4,
                    this.haloAngle + rOff, this.haloAngle + rOff + Math.PI * 1.6);
                ctx.stroke();
            }
            ctx.restore();

            if (this.shieldActive) {
                ctx.save();
                ctx.globalAlpha = 0.35;
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth   = 3;
                ctx.shadowColor = '#7c3aed';
                ctx.shadowBlur  = 20;
                ctx.beginPath();
                ctx.arc(sx, sy, this.size + 14, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.shadowColor = col;
            ctx.shadowBlur = this.enraged ? 28 : 16;

            if (this.hitFlash > 0.5) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 22; }

            // Legs
            ctx.fillStyle = dark;
            drawRoundedRect(ctx, sx - this.size * 0.34, sy + 6 + stride * 0.25, this.size * 0.28, this.size * 0.8, 5);
            ctx.fill();
            drawRoundedRect(ctx, sx + this.size * 0.06, sy + 6 - stride * 0.25, this.size * 0.28, this.size * 0.8, 5);
            ctx.fill();

            // Torso armor
            ctx.fillStyle = this.hitFlash > 0.5 ? '#ffffff' : col;
            drawRoundedRect(ctx, sx - this.size * 0.48, sy - this.size * 0.62, this.size * 0.96, this.size * 1.12, 11);
            ctx.fill();
            ctx.fillStyle = dark;
            drawRoundedRect(ctx, sx - this.size * 0.24, sy - this.size * 0.48, this.size * 0.48, this.size * 0.86, 8);
            ctx.fill();

            // Arms
            ctx.strokeStyle = dark;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx - this.size * 0.45, sy - this.size * 0.28);
            ctx.lineTo(sx - this.size * 0.86, sy + this.size * 0.34);
            ctx.moveTo(sx + this.size * 0.45, sy - this.size * 0.28);
            ctx.lineTo(sx + this.size * 0.9, sy + this.size * 0.3);
            ctx.stroke();

            // Head
            const hx = sx + Math.cos(faceAngle) * 2;
            const hy = sy - this.size * 0.98;
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(hx, hy, this.size * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(hx, hy - this.size * 0.06, this.size * 0.28, Math.PI, Math.PI * 2);
            ctx.fill();

            // Eyes
            ctx.fillStyle = this.enraged ? '#ef4444' : '#f8fafc';
            ctx.beginPath();
            ctx.arc(hx - this.size * 0.09, hy - this.size * 0.02, this.size * 0.04, 0, Math.PI * 2);
            ctx.arc(hx + this.size * 0.09, hy - this.size * 0.02, this.size * 0.04, 0, Math.PI * 2);
            ctx.fill();

            // Weapon silhouette
            const wx = sx + this.size * 0.9;
            const wy = sy + this.size * 0.28;
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.lineTo(wx + this.size * 0.55, wy - this.size * 0.65);
            ctx.stroke();

            ctx.restore();
            }

            if (this.enrageMsg > 0) {
                ctx.save();
                ctx.globalAlpha = Math.min(1, this.enrageMsg);
                ctx.font = 'bold 13px Inter, sans-serif';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle    = col;
                ctx.shadowColor  = col;
                ctx.shadowBlur   = 14;
                ctx.fillText(this.def.phaseMsg, sx, sy - this.size - 22);
                ctx.restore();
            }

            for (const p of this.projectiles) {
                const px = p.x - cam.x;
                const py = p.y - cam.y;
                ctx.save();
                ctx.shadowColor = p.color;
                ctx.shadowBlur  = 12;
                ctx.fillStyle   = p.color;
                ctx.beginPath();
                ctx.arc(px, py, p.homing ? 5 : 4, 0, Math.PI * 2);
                ctx.fill();
                // Homing orbs get an extra glow ring
                if (p.homing) {
                    ctx.globalAlpha  = 0.4;
                    ctx.strokeStyle  = p.color;
                    ctx.lineWidth    = 1.5;
                    ctx.beginPath();
                    ctx.arc(px, py, 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
    }

    // ── Factory ──────────────────────────────────────────────────────────────
    function spawnBoss(room, levelNum, player) {
        const ts = Dungeon.TILE_SIZE;
        const x  = room.centerX * ts + ts / 2;
        const y  = room.centerY * ts + ts / 2;
        return new BossEnemy(x, y, levelNum, player);
    }

    // ── Collision helper (used by game.js) ───────────────────────────────────
    function checkBossProjectiles(boss, player) {
        if (!boss || !boss.alive) return;
        for (const p of boss.projectiles) {
            const dist = Math.hypot(p.x - player.x, p.y - player.y);
            if (dist < player.size + 5) {
                player.takeDamage(p.damage);
                p.life = 0; // consume
            }
        }
    }

    return { BOSS_DEFS, BossEnemy, spawnBoss, checkBossProjectiles };
})();
