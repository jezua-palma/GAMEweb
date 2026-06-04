/* ============================================
   ENEMY - Enemy types, AI, and spawn director
   ============================================ */

const Enemies = (() => {
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

    function enemySkinTone(def) {
        if (def.name === 'Skeleton') return '#d6d3d1';
        if (def.name === 'Mage') return '#f5d4b5';
        if (def.name === 'Archer') return '#d7b08a';
        return '#caa281';
    }

    const ENEMY_DEFS = {
        slime: {
            name: 'Slime',
            color: '#22c55e',
            colorDark: '#15803d',
            size: 14,
            speed: 40,
            hp: 2,
            damage: 1,
            score: 10,
            behavior: 'chase',
            minFloor: 1,
            threat: 0.9,
            aggro: 220,
        },
        skeleton: {
            name: 'Skeleton',
            color: '#e2e8f0',
            colorDark: '#94a3b8',
            size: 14,
            speed: 60,
            hp: 3,
            damage: 1,
            score: 20,
            behavior: 'rush',
            minFloor: 1,
            threat: 1.0,
            aggro: 240,
        },
        bat: {
            name: 'Bat',
            color: '#a855f7',
            colorDark: '#7c3aed',
            size: 10,
            speed: 90,
            hp: 1,
            damage: 1,
            score: 15,
            behavior: 'erratic',
            minFloor: 2,
            threat: 1.15,
            aggro: 280,
        },
        archer: {
            name: 'Archer',
            color: '#f97316',
            colorDark: '#ea580c',
            size: 13,
            speed: 35,
            hp: 3,
            damage: 1,
            score: 30,
            behavior: 'ranged',
            minFloor: 3,
            threat: 1.25,
            aggro: 300,
        },
        mage: {
            name: 'Mage',
            color: '#06b6d4',
            colorDark: '#0891b2',
            size: 13,
            speed: 30,
            hp: 4,
            damage: 2,
            score: 50,
            behavior: 'teleport',
            minFloor: 4,
            threat: 1.45,
            aggro: 310,
        },
        boss: {
            name: 'Dark Lord',
            color: '#ef4444',
            colorDark: '#dc2626',
            size: 24,
            speed: 45,
            hp: 15,
            damage: 2,
            score: 200,
            behavior: 'boss',
            minFloor: 5,
            threat: 2.0,
            aggro: 360,
        },
    };

    class Enemy {
        constructor(x, y, def, floor) {
            this.x = x;
            this.y = y;
            this.def = { ...def };
            this.floor = floor;

            const threat = this.def.threat || 1;
            const hpScale = 1 + floor * 0.1 + threat * 0.05;
            const speedScale = 1 + Math.min(0.65, floor * 0.024);

            this.hp = Math.max(1, Math.round(def.hp * hpScale));
            this.maxHp = this.hp;
            this.speed = def.speed * speedScale;
            this.damage = Math.max(1, def.damage + Math.floor(floor / 4));
            this.size = def.size;

            this.alive = true;
            this.rewardGranted = false;
            this.isElite = false;
            this.isReinforcement = false;

            this.knockbackX = 0;
            this.knockbackY = 0;
            this.hitFlash = 0;
            this.attackCooldown = 0;
            this.shootCooldown = 0;
            this.projectiles = [];

            this.projectileSpeed = 150 + floor * 3;
            this.projectileLife = 2.8 + Math.min(1.2, floor * 0.03);
            this.projectileRadius = 4;

            // AI
            this.aiTimer = 0;
            this.dirX = 0;
            this.dirY = 0;
            this.teleportTimer = Utils.randFloat(3, 6);
            this.patrolAngle = Math.random() * Math.PI * 2;
            this.pressure = 0;
            this.strafeDir = Math.random() < 0.5 ? -1 : 1;
            this.strafeTimer = Utils.randFloat(0.45, 1.2);
            this.preferredRange = Utils.randFloat(150, 205);
            this.personalSpace = this.size + Utils.randFloat(8, 16);
            this.lastPlayerX = x;
            this.lastPlayerY = y;
            this.lastSeenPlayerX = x;
            this.lastSeenPlayerY = y;
            this.losTimer = Utils.randFloat(0.05, 0.18);
            this.hasPlayerSight = true;
            this.volleyShots = 0;
            this.volleyDelay = 0;

            // Animation
            this.animTimer = 0;
            this.bobAmount = 0;
        }

        update(dt, playerX, playerY, dungeon, pressure = 0, allies = null) {
            if (!this.alive) return;

            this.pressure = Math.max(0, pressure || 0);
            const aggression = 1 + Math.min(0.75, this.pressure * 0.18);
            const rawPlayerVX = dt > 0 ? (playerX - this.lastPlayerX) / dt : 0;
            const rawPlayerVY = dt > 0 ? (playerY - this.lastPlayerY) / dt : 0;
            const playerVX = Utils.clamp(rawPlayerVX, -280, 280);
            const playerVY = Utils.clamp(rawPlayerVY, -280, 280);
            this.lastPlayerX = playerX;
            this.lastPlayerY = playerY;

            this.animTimer += dt;
            this.bobAmount = Math.sin(this.animTimer * 4) * 2;
            this.attackCooldown = Math.max(0, this.attackCooldown - dt * aggression);
            this.shootCooldown = Math.max(0, this.shootCooldown - dt * aggression);
            this.hitFlash = Math.max(0, this.hitFlash - dt * 5);

            // Apply knockback
            this.x += this.knockbackX * dt * 10;
            this.y += this.knockbackY * dt * 10;
            this.knockbackX *= 0.85;
            this.knockbackY *= 0.85;

            const dist = Utils.dist(this.x, this.y, playerX, playerY);
            const baseAggro = (this.def.aggro || 240) + this.pressure * 24;
            const aggro = this.def.behavior === 'boss' ? Math.max(420, baseAggro) : baseAggro;
            const ts = Dungeon.TILE_SIZE;
            const canTrackPlayer = dist < aggro;
            this.losTimer -= dt * (1 + Math.min(0.65, this.pressure * 0.12));
            if (this.losTimer <= 0) {
                this.hasPlayerSight = canTrackPlayer ? this.hasLineOfSight(playerX, playerY, dungeon) : false;
                this.losTimer = Utils.randFloat(0.08, 0.22);
            }
            const canSeePlayer = canTrackPlayer && this.hasPlayerSight;
            if (canSeePlayer) {
                this.lastSeenPlayerX = playerX;
                this.lastSeenPlayerY = playerY;
            }
            const separation = this.computeSeparation(allies);

            // AI behavior
            switch (this.def.behavior) {
                case 'chase':
                    if (canTrackPlayer) {
                        const tx = canSeePlayer ? playerX : this.lastSeenPlayerX;
                        const ty = canSeePlayer ? playerY : this.lastSeenPlayerY;
                        const a = Utils.angle(this.x, this.y, tx, ty);
                        this.moveSteered(Math.cos(a), Math.sin(a), this.speed * aggression * dt, dungeon, separation, 0.9);
                    } else {
                        this.patrol(dt * 0.75, dungeon);
                    }
                    break;

                case 'rush':
                    if (canTrackPlayer) {
                        const tx = canSeePlayer ? playerX : this.lastSeenPlayerX;
                        const ty = canSeePlayer ? playerY : this.lastSeenPlayerY;
                        const a = Utils.angle(this.x, this.y, tx, ty);
                        const rushMult = dist < 90 ? 1.8 : 1.15;
                        let moveX = Math.cos(a);
                        let moveY = Math.sin(a);
                        if (dist < 140) {
                            moveX += Math.cos(a + Math.PI / 2 * this.strafeDir) * 0.28;
                            moveY += Math.sin(a + Math.PI / 2 * this.strafeDir) * 0.28;
                        }
                        this.moveSteered(moveX, moveY, this.speed * rushMult * aggression * dt, dungeon, separation, 0.8);
                    } else {
                        this.patrol(dt, dungeon);
                    }
                    break;

                case 'erratic':
                    this.aiTimer -= dt * aggression;
                    if (this.aiTimer <= 0) {
                        this.aiTimer = Utils.randFloat(0.22, 0.65);
                        if (canTrackPlayer) {
                            const tx = canSeePlayer ? playerX : this.lastSeenPlayerX;
                            const ty = canSeePlayer ? playerY : this.lastSeenPlayerY;
                            const a = Utils.angle(this.x, this.y, tx, ty);
                            this.dirX = Math.cos(a + Utils.randFloat(-0.65, 0.65));
                            this.dirY = Math.sin(a + Utils.randFloat(-0.65, 0.65));
                        } else {
                            this.dirX = Utils.randFloat(-1, 1);
                            this.dirY = Utils.randFloat(-1, 1);
                        }
                    }
                    this.moveSteered(this.dirX, this.dirY, this.speed * aggression * dt, dungeon, separation, 0.7);
                    break;

                case 'ranged':
                    if (canTrackPlayer) {
                        this.strafeTimer -= dt * aggression;
                        if (this.strafeTimer <= 0) {
                            this.strafeTimer = Utils.randFloat(0.45, 1.25);
                            if (Math.random() < 0.65) this.strafeDir *= -1;
                        }

                        const angleToPlayer = Utils.angle(this.x, this.y, playerX, playerY);
                        const preferredMin = this.preferredRange - 24;
                        const preferredMax = this.preferredRange + 50;
                        let moveX = 0;
                        let moveY = 0;

                        if (!canSeePlayer || dist > preferredMax) {
                            moveX += Math.cos(angleToPlayer);
                            moveY += Math.sin(angleToPlayer);
                        } else if (dist < preferredMin) {
                            moveX -= Math.cos(angleToPlayer);
                            moveY -= Math.sin(angleToPlayer);
                        }

                        if (canSeePlayer && dist >= preferredMin - 10 && dist <= preferredMax + 36) {
                            const strafeAngle = angleToPlayer + Math.PI / 2 * this.strafeDir;
                            moveX += Math.cos(strafeAngle) * 0.92;
                            moveY += Math.sin(strafeAngle) * 0.92;
                        }
                        this.moveSteered(moveX, moveY, this.speed * aggression * dt, dungeon, separation, 1);

                        if (canSeePlayer && this.shootCooldown <= 0 && dist < 325) {
                            this.shootPredictive(playerX, playerY, playerVX, playerVY, 0.28);
                            if (this.pressure > 2.5 && Math.random() < 0.28) {
                                this.shoot(playerX + Utils.randFloat(-22, 22), playerY + Utils.randFloat(-22, 22));
                            }
                            this.shootCooldown = Math.max(0.5, 1.2 - this.pressure * 0.07);
                        }
                    } else {
                        this.patrol(dt * 0.85, dungeon);
                    }
                    break;

                case 'teleport':
                    this.teleportTimer -= dt * aggression;
                    if (canTrackPlayer && this.teleportTimer <= 0) {
                        this.tryTeleportNear(playerX, playerY, dungeon);
                        this.teleportTimer = Utils.randFloat(1.2, 2.9);
                    }
                    if (canTrackPlayer) {
                        const angleToPlayer = Utils.angle(this.x, this.y, playerX, playerY);
                        let moveX = 0;
                        let moveY = 0;
                        if (dist < 125) {
                            moveX -= Math.cos(angleToPlayer);
                            moveY -= Math.sin(angleToPlayer);
                        } else if (dist > 200 || !canSeePlayer) {
                            moveX += Math.cos(angleToPlayer);
                            moveY += Math.sin(angleToPlayer);
                        }
                        const strafeAngle = angleToPlayer + Math.PI / 2 * this.strafeDir;
                        moveX += Math.cos(strafeAngle) * 0.35;
                        moveY += Math.sin(strafeAngle) * 0.35;
                        this.moveSteered(moveX, moveY, this.speed * 0.95 * aggression * dt, dungeon, separation, 0.85);

                        if (canSeePlayer && this.shootCooldown <= 0) {
                            this.shootPredictive(playerX, playerY, playerVX, playerVY, 0.32);
                            if (this.pressure > 2.5 && Math.random() < 0.35) {
                                this.shoot(playerX + Utils.randFloat(-35, 35), playerY + Utils.randFloat(-35, 35));
                            }
                            this.shootCooldown = Math.max(0.62, 1.75 - this.pressure * 0.09);
                        }
                    } else {
                        this.patrol(dt * 0.6, dungeon);
                    }
                    break;

                case 'boss':
                    if (canTrackPlayer) {
                        this.strafeTimer -= dt * 0.7 * aggression;
                        if (this.strafeTimer <= 0) {
                            this.strafeTimer = Utils.randFloat(0.5, 1.35);
                            if (Math.random() < 0.7) this.strafeDir *= -1;
                        }

                        const a = Utils.angle(this.x, this.y, playerX, playerY);
                        let moveX = Math.cos(a);
                        let moveY = Math.sin(a);
                        if (dist < 170) {
                            moveX -= Math.cos(a) * 1.45;
                            moveY -= Math.sin(a) * 1.45;
                        } else if (dist > 285) {
                            moveX += Math.cos(a) * 0.6;
                            moveY += Math.sin(a) * 0.6;
                        }
                        const strafeA = a + Math.PI / 2 * this.strafeDir;
                        moveX += Math.cos(strafeA) * 0.8;
                        moveY += Math.sin(strafeA) * 0.8;
                        this.moveSteered(moveX, moveY, this.speed * aggression * dt, dungeon, separation, 0.45);

                        if (this.volleyShots > 0) {
                            this.volleyDelay -= dt;
                            if (this.volleyDelay <= 0) {
                                this.shootPredictive(playerX, playerY, playerVX, playerVY, 0.34);
                                if (this.pressure > 2.8 && Math.random() < 0.2) {
                                    this.shoot(playerX + Utils.randFloat(-28, 28), playerY + Utils.randFloat(-28, 28));
                                }
                                this.volleyShots -= 1;
                                this.volleyDelay = 0.12;
                            }
                        } else if (canSeePlayer && this.shootCooldown <= 0) {
                            this.volleyShots = this.pressure > 2.8 ? 7 : 5;
                            this.volleyDelay = 0;
                            this.shootCooldown = Math.max(1.75, 2.55 - this.pressure * 0.13);
                        }
                    } else {
                        this.patrol(dt * 0.55, dungeon);
                    }
                    break;
            }

            // Update projectiles
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
                    Particles.emitBurst(p.x, p.y, 2, this.def.color, 0.9);
                    this.projectiles.splice(i, 1);
                }
            }
        }

        hasLineOfSight(targetX, targetY, dungeon) {
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 16) return true;
            const step = Math.max(10, Dungeon.TILE_SIZE * 0.52);
            const samples = Math.max(2, Math.min(22, Math.ceil(dist / step)));
            for (let i = 1; i < samples; i++) {
                const t = i / samples;
                const x = this.x + dx * t;
                const y = this.y + dy * t;
                const gx = Math.floor(x / Dungeon.TILE_SIZE);
                const gy = Math.floor(y / Dungeon.TILE_SIZE);
                if (!dungeon.isWalkable(gx, gy)) return false;
            }
            return true;
        }

        computeSeparation(allies) {
            if (!Array.isArray(allies) || allies.length < 2) return { x: 0, y: 0, strength: 0 };

            let sx = 0;
            let sy = 0;
            let collisions = 0;
            for (const ally of allies) {
                if (!ally || ally === this || !ally.alive) continue;
                const dx = this.x - ally.x;
                const dy = this.y - ally.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= 0.01) continue;
                const desired = this.personalSpace + Math.max(6, (ally.size || 10) * 0.35);
                if (dist >= desired) continue;
                const push = (desired - dist) / desired;
                sx += (dx / dist) * push;
                sy += (dy / dist) * push;
                collisions += 1;
            }
            if (collisions === 0) return { x: 0, y: 0, strength: 0 };
            const norm = Utils.normalize(sx, sy);
            return {
                x: norm.x,
                y: norm.y,
                strength: Math.min(1, collisions / 3),
            };
        }

        moveSteered(dirX, dirY, amount, dungeon, separation = null, separationWeight = 0.8) {
            let sx = dirX;
            let sy = dirY;
            if (separation && (separation.x !== 0 || separation.y !== 0)) {
                const mul = separationWeight * (separation.strength || 1);
                sx += separation.x * mul;
                sy += separation.y * mul;
            }
            const norm = Utils.normalize(sx, sy);
            if (norm.x === 0 && norm.y === 0) return;
            this.dirX = norm.x;
            this.dirY = norm.y;
            this.moveToward(Math.atan2(norm.y, norm.x), amount, dungeon);
        }

        moveToward(angle, amount, dungeon) {
            const ts = Dungeon.TILE_SIZE;
            const nx = this.x + Math.cos(angle) * amount;
            const ny = this.y + Math.sin(angle) * amount;

            const gx = Math.floor(nx / ts);
            const gy = Math.floor(ny / ts);

            if (dungeon.isWalkable(gx, gy)) {
                this.x = nx;
                this.y = ny;
            }
        }

        patrol(dt, dungeon) {
            this.patrolAngle += Utils.randFloat(-0.55, 0.55) * dt;
            this.moveToward(this.patrolAngle, this.speed * 0.42 * dt, dungeon);
        }

        shootPredictive(targetX, targetY, targetVX = 0, targetVY = 0, leadStrength = 0.26) {
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.hypot(dx, dy);
            const travelTime = distance / Math.max(60, this.projectileSpeed);
            const lead = Utils.clamp(leadStrength, 0, 0.55);
            const px = targetX + targetVX * travelTime * lead;
            const py = targetY + targetVY * travelTime * lead;
            this.shoot(px, py);
        }

        tryTeleportNear(playerX, playerY, dungeon) {
            const ts = Dungeon.TILE_SIZE;
            for (let attempt = 0; attempt < 7; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = this.preferredRange + Utils.randFloat(-38, 42);
                const nx = playerX + Math.cos(angle) * dist;
                const ny = playerY + Math.sin(angle) * dist;
                const gx = Math.floor(nx / ts);
                const gy = Math.floor(ny / ts);
                if (!dungeon.isWalkable(gx, gy)) continue;
                Particles.emitBurst(this.x, this.y, 8, this.def.color);
                this.x = nx;
                this.y = ny;
                Particles.emitBurst(this.x, this.y, 8, this.def.color);
                return true;
            }
            return false;
        }

        shoot(targetX, targetY) {
            const a = Utils.angle(this.x, this.y, targetX, targetY);
            const speed = this.projectileSpeed * (1 + Math.min(0.5, this.pressure * 0.1));
            this.projectiles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                life: this.projectileLife,
                damage: this.damage,
                radius: this.projectileRadius || 4,
            });
            Audio.playSFX('slash');
        }

        takeDamage(amount, fromX, fromY) {
            if (!this.alive) return;
            this.hp -= amount;
            this.hitFlash = 1;

            // Knockback
            const angle = Utils.angle(fromX, fromY, this.x, this.y);
            const knockbackForce = this.isElite ? 140 : 200;
            this.knockbackX = Math.cos(angle) * knockbackForce;
            this.knockbackY = Math.sin(angle) * knockbackForce;

            Particles.emitBurst(this.x, this.y, this.isElite ? 8 : 6, this.def.color, 2.2);
            if (typeof Particles !== 'undefined' && Particles.emitText) {
                Particles.emitText(this.x, this.y - 18, `-${amount}`, this.isElite ? '#f59e0b' : '#ef4444');
            }

            if (this.hp <= 0) {
                this.alive = false;
                Audio.playSFX('enemydeath');
                Particles.emitBurst(this.x, this.y, this.isElite ? 22 : 15, this.def.color, this.isElite ? 4.8 : 4);
            } else {
                Audio.playSFX('hit');
            }
        }

        resolveFacingDirection(angle) {
            const a = Number.isFinite(angle) ? angle : 0;
            const c = Math.cos(a);
            const s = Math.sin(a);
            if (Math.abs(c) > Math.abs(s)) return c >= 0 ? 'right' : 'left';
            return s >= 0 ? 'down' : 'up';
        }

        getSheetKey() {
            if (this.def.name === 'Slime') return 'enemy_slime';
            if (this.def.name === 'Bat') return 'enemy_bat';
            if (this.def.name === 'Skeleton') return 'enemy_skeleton';
            if (this.def.name === 'Archer') return 'enemy_archer';
            if (this.def.name === 'Mage') return 'enemy_mage';
            return 'enemy_humanoid';
        }

        getEnemySheet() {
            if (typeof SpriteAssets === 'undefined') return null;
            return SpriteAssets.getSheet(this.getSheetKey()) || SpriteAssets.getSheet('enemy_humanoid');
        }

        drawSpriteBody(ctx, sx, sy) {
            const sheet = this.getEnemySheet();
            if (!sheet) return false;

            const moveAngle = Math.atan2(this.dirY || 0.0001, this.dirX || 1);
            const facing = Number.isFinite(moveAngle) ? moveAngle : 0;
            const dir = this.resolveFacingDirection(facing);
            const moving = Math.hypot(this.dirX, this.dirY) > 0.08;
            const attacking = this.attackCooldown > 0.03 || this.shootCooldown < 0.15;
            const row = attacking ? 3 : (dir === 'up' ? 2 : (dir === 'down' ? 0 : 1));
            const flipX = dir === 'left';
            const anim = attacking ? 'attack' : (moving ? 'walk' : 'idle');

            const scale = this.def.name === 'Bat' ? 2.65 : (this.def.name === 'Slime' ? 2.45 : 2.8);
            const drawW = this.size * scale;
            const drawH = this.size * scale;
            const dx = sx - drawW * 0.5;
            const dy = sy - drawH * 0.74;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 6, this.size * 0.85, this.size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();

            if (this.hitFlash > 0) {
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 15;
            } else if (this.isElite) {
                ctx.shadowColor = '#f59e0b';
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowColor = `${this.def.color}99`;
                ctx.shadowBlur = 6;
            }

            const drew = SpriteAssets.drawAnimated(ctx, sheet, anim, this.animTimer, row, dx, dy, drawW, drawH, flipX);
            if (!drew) {
                ctx.restore();
                return false;
            }

            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(${Dungeon.hexToRg(this.def.color)}, ${this.isElite ? 0.28 : 0.2})`;
            ctx.fillRect(dx, dy, drawW, drawH);

            if (this.isElite) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy - 2, this.size + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            return true;
        }

        draw(ctx, cam) {
            if (!this.alive) return;
            const sx = this.x - cam.x;
            const sy = this.y - cam.y + this.bobAmount;
            const spriteRendered = this.drawSpriteBody(ctx, sx, sy);
            if (!spriteRendered) {
            const skin = enemySkinTone(this.def);
            const moveAngle = Math.atan2(this.dirY || 0.0001, this.dirX || 1);
            const facing = Number.isFinite(moveAngle) ? moveAngle : 0;
            const stride = Math.sin(this.animTimer * 9) * 2.2;
            const torsoColor = this.hitFlash > 0.5 ? '#f8fafc' : this.def.color;

            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + this.size + 6, this.size * 0.85, this.size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            if (this.hitFlash > 0) {
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 15;
            } else if (this.isElite) {
                ctx.shadowColor = '#f59e0b';
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowColor = `${this.def.color}99`;
                ctx.shadowBlur = 6;
            }

            if (this.def.behavior === 'erratic' && this.def.name === 'Bat') {
                const flap = Math.sin(this.animTimer * 18) * 0.45;
                ctx.fillStyle = torsoColor;
                ctx.beginPath();
                ctx.ellipse(sx, sy - 2, this.size * 0.55, this.size * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = this.def.colorDark;
                ctx.beginPath();
                ctx.moveTo(sx - 2, sy - 2);
                ctx.quadraticCurveTo(sx - this.size * 1.6, sy - this.size * flap, sx - this.size * 1.9, sy + this.size * 0.7);
                ctx.quadraticCurveTo(sx - this.size * 1.1, sy + this.size * 0.2, sx - 2, sy);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(sx + 2, sy - 2);
                ctx.quadraticCurveTo(sx + this.size * 1.6, sy - this.size * flap, sx + this.size * 1.9, sy + this.size * 0.7);
                ctx.quadraticCurveTo(sx + this.size * 1.1, sy + this.size * 0.2, sx + 2, sy);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.arc(sx - 2, sy - 4, 1.2, 0, Math.PI * 2);
                ctx.arc(sx + 2, sy - 4, 1.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.def.name === 'Slime') {
                ctx.fillStyle = torsoColor;
                ctx.beginPath();
                ctx.ellipse(sx, sy, this.size * 0.95, this.size * 0.8, Math.sin(this.animTimer * 4) * 0.08, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = this.def.colorDark;
                ctx.beginPath();
                ctx.ellipse(sx, sy + 3, this.size * 0.65, this.size * 0.42, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.arc(sx - this.size * 0.25, sy - this.size * 0.15, 1.6, 0, Math.PI * 2);
                ctx.arc(sx + this.size * 0.25, sy - this.size * 0.15, 1.6, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Legs
                ctx.fillStyle = this.def.colorDark;
                drawRoundedRect(ctx, sx - 6, sy + 4 + stride * 0.3, 5, 11, 2);
                ctx.fill();
                drawRoundedRect(ctx, sx + 1, sy + 4 - stride * 0.3, 5, 11, 2);
                ctx.fill();

                // Torso
                ctx.fillStyle = torsoColor;
                drawRoundedRect(ctx, sx - 8, sy - 9, 16, 17, 5);
                ctx.fill();
                ctx.fillStyle = this.def.colorDark;
                drawRoundedRect(ctx, sx - 4, sy - 7, 8, 13, 3);
                ctx.fill();

                // Head
                const hx = sx + Math.cos(facing) * 1.5;
                const hy = sy - 14;
                ctx.fillStyle = skin;
                ctx.beginPath();
                ctx.arc(hx, hy, 5.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = this.def.colorDark;
                ctx.beginPath();
                ctx.arc(hx, hy - 1.5, 5.9, Math.PI, Math.PI * 2);
                ctx.fill();

                // Eyes
                ctx.fillStyle = this.def.behavior === 'boss' ? '#ef4444' : '#f8fafc';
                ctx.beginPath();
                ctx.arc(hx - 1.8 + Math.cos(facing) * 0.5, hy - 0.2, 0.9, 0, Math.PI * 2);
                ctx.arc(hx + 1.8 + Math.cos(facing) * 0.5, hy - 0.2, 0.9, 0, Math.PI * 2);
                ctx.fill();

                // Weapon cues
                const handX = sx + Math.cos(facing) * 8;
                const handY = sy - 3 + Math.sin(facing) * 2;
                if (this.def.behavior === 'ranged') {
                    ctx.strokeStyle = '#d1d5db';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(handX, handY, 4.5, -0.8, 0.8);
                    ctx.stroke();
                } else if (this.def.behavior === 'teleport') {
                    ctx.strokeStyle = '#67e8f9';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(handX, handY);
                    ctx.lineTo(handX + Math.cos(facing) * 8, handY + Math.sin(facing) * 8);
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = '#d1d5db';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(handX, handY);
                    ctx.lineTo(handX + Math.cos(facing) * 7, handY + Math.sin(facing) * 7);
                    ctx.stroke();
                }
            }

            if (this.isElite) {
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy - 2, this.size + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            }

            if (this.hp < this.maxHp) {
                const barW = this.size * 2;
                const barH = 4;
                const bx = sx - barW / 2;
                const by = sy - this.size - 14;

                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(bx, by, barW, barH);

                ctx.fillStyle = this.hp / this.maxHp > 0.3 ? '#22c55e' : '#ef4444';
                ctx.fillRect(bx, by, barW * (this.hp / this.maxHp), barH);
            }

            for (const p of this.projectiles) {
                const px = p.x - cam.x;
                const py = p.y - cam.y;
                const radius = p.radius || 4;
                ctx.save();
                ctx.shadowColor = this.def.color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = this.def.color;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    function getAvailableTypes(floor) {
        return Object.entries(ENEMY_DEFS)
            .filter(([key, def]) => def.minFloor <= floor && key !== 'boss')
            .map(([, def]) => def);
    }

    function pickEnemyDef(available, floorBias, recentNames = []) {
        if (!available.length) return ENEMY_DEFS.slime;

        const weighted = available.map((def) => {
            const diff = Math.max(0, floorBias - def.minFloor);
            const scoreWeight = (def.score || 10) / 22;
            const repeats = recentNames.filter((name) => name === def.name).length;
            const varietyPenalty = repeats === 0 ? 1 : (repeats === 1 ? 0.62 : 0.38);
            const weight = (1 + diff * 0.26 + scoreWeight) * varietyPenalty;
            return { def, weight };
        });

        const total = weighted.reduce((sum, w) => sum + w.weight, 0);
        let roll = Math.random() * total;
        for (const entry of weighted) {
            roll -= entry.weight;
            if (roll <= 0) return entry.def;
        }
        return weighted[weighted.length - 1].def;
    }

    function randomRoomPoint(room, tileSize) {
        const ox = Utils.randInt(2, room.w - 3);
        const oy = Utils.randInt(2, room.h - 3);
        return {
            x: (room.x + ox) * tileSize + tileSize / 2,
            y: (room.y + oy) * tileSize + tileSize / 2,
        };
    }

    function makeElite(enemy, bonusMultiplier = 1) {
        enemy.isElite = true;
        enemy.hp = Math.round(enemy.hp * (1.85 * bonusMultiplier));
        enemy.maxHp = enemy.hp;
        enemy.speed *= 1.14;
        enemy.damage = Math.max(enemy.damage + 1, Math.round(enemy.damage * (1.2 * bonusMultiplier)));
        enemy.projectileSpeed *= 1.12;
        enemy.projectileRadius = 5;
        enemy.def = {
            ...enemy.def,
            score: Math.round((enemy.def.score || 20) * (3.1 * bonusMultiplier)),
        };
    }

    function spawnEnemiesForRoom(room, floor) {
        if (room.type === Dungeon.ROOM_TYPE.START || room.type === Dungeon.ROOM_TYPE.REST) return [];
        if (room.type === Dungeon.ROOM_TYPE.BOSS) return [];

        const ts = Dungeon.TILE_SIZE;
        const enemies = [];
        const available = getAvailableTypes(floor);
        const recentNames = [];
        if (!available.length) return [];

        // Elite room: fewer bodies, much higher threat.
        if (room.type === Dungeon.ROOM_TYPE.ELITE) {
            const eliteCount = Math.min(6, Utils.randInt(2, 4) + Math.floor(floor / 8));
            for (let i = 0; i < eliteCount; i++) {
                const def = pickEnemyDef(available, floor + 3, recentNames);
                const pos = randomRoomPoint(room, ts);
                const elite = new Enemy(pos.x, pos.y, def, floor + 1);
                makeElite(elite, 1 + Math.min(0.25, floor * 0.01));
                enemies.push(elite);
                recentNames.push(def.name);
                if (recentNames.length > 4) recentNames.shift();
            }
            return enemies;
        }

        const roomArea = Math.max(1, room.w * room.h);
        const areaFactor = Utils.clamp((roomArea - 70) / 90, 0, 1.25);
        let count = Utils.randInt(3, 4) + Math.floor(floor * 0.55 + areaFactor * 2);
        if (room.type === Dungeon.ROOM_TYPE.TREASURE) {
            count = Math.max(2, count - 1);
        }
        const maxEnemies = Math.min(10, Math.max(3, Math.round(4 + floor * 0.55 + areaFactor * 2.2)));
        const totalEnemies = Math.min(count, maxEnemies);

        for (let i = 0; i < totalEnemies; i++) {
            const def = pickEnemyDef(available, floor + Math.floor(i / 3), recentNames);
            const pos = randomRoomPoint(room, ts);
            const enemy = new Enemy(pos.x, pos.y, def, floor);

            // Small champion chance on later floors.
            if (floor >= 4 && Math.random() < Math.min(0.18, floor * 0.012)) {
                makeElite(enemy, 0.55);
            }
            enemies.push(enemy);
            recentNames.push(def.name);
            if (recentNames.length > 4) recentNames.shift();
        }

        // Ensure occasional mixed threat (ranged/teleport support) on deeper floors.
        if (floor >= 3 && enemies.length >= 3) {
            const hasBackliner = enemies.some((enemy) =>
                enemy.def.behavior === 'ranged' || enemy.def.behavior === 'teleport'
            );
            if (!hasBackliner && Math.random() < 0.75) {
                const backliners = available.filter((def) =>
                    def.behavior === 'ranged' || def.behavior === 'teleport'
                );
                if (backliners.length) {
                    const replaceIndex = Utils.randInt(0, enemies.length - 1);
                    const replaced = enemies[replaceIndex];
                    const nextDef = backliners[Utils.randInt(0, backliners.length - 1)];
                    const replacement = new Enemy(replaced.x, replaced.y, nextDef, floor);
                    if (replaced.isElite) {
                        makeElite(replacement, 0.55);
                    }
                    enemies[replaceIndex] = replacement;
                }
            }
        }

        return enemies;
    }

    function spawnReinforcements(room, floor, wave = 1) {
        if (!room) return [];
        if (room.type === Dungeon.ROOM_TYPE.START || room.type === Dungeon.ROOM_TYPE.REST || room.type === Dungeon.ROOM_TYPE.BOSS) {
            return [];
        }

        const ts = Dungeon.TILE_SIZE;
        const intensityFloor = floor + wave * 2;
        const available = getAvailableTypes(intensityFloor);
        if (!available.length) return [];

        const isEliteRoom = room.type === Dungeon.ROOM_TYPE.ELITE;
        const baseCount = isEliteRoom ? 2 : 1;
        const count = Math.min(isEliteRoom ? 4 : 3, baseCount + Math.floor(wave / 2));
        const list = [];
        const recentNames = [];

        for (let i = 0; i < count; i++) {
            const def = pickEnemyDef(available, intensityFloor + 1, recentNames);
            const pos = randomRoomPoint(room, ts);
            const enemy = new Enemy(pos.x, pos.y, def, intensityFloor);
            enemy.isReinforcement = true;
            enemy.def = {
                ...enemy.def,
                score: Math.round((enemy.def.score || 20) * (1.35 + wave * 0.2)),
            };

            // Reinforcements spawn as mini-elites occasionally.
            if (isEliteRoom || Math.random() < 0.35) {
                makeElite(enemy, 0.45 + wave * 0.05);
            }
            list.push(enemy);
            recentNames.push(def.name);
            if (recentNames.length > 4) recentNames.shift();
        }

        return list;
    }

    return {
        ENEMY_DEFS,
        Enemy,
        spawnEnemiesForRoom,
        spawnReinforcements,
    };
})();
