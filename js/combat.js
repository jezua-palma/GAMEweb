/* ============================================
   COMBAT — Combat resolution & collision
   ============================================ */

const Combat = (() => {
    function emitCombatImpact(type, x, y, extra = null) {
        if (typeof window === 'undefined') return;
        const handler = window.__shadowOnCombatImpact;
        if (typeof handler !== 'function') return;
        const payload = {
            type,
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
        };
        if (extra && typeof extra === 'object') {
            Object.assign(payload, extra);
        }
        handler(payload);
    }

    function projectileHitRadius(projectile, targetRadius) {
        const radius = Math.max(1, Number(targetRadius) || 1);
        const projectileRadius = Math.max(1, Number(projectile?.radius) || 5);
        const speed = Math.hypot(Number(projectile?.vx) || 0, Number(projectile?.vy) || 0);
        // Small sweep allowance reduces tunneling for fast projectiles.
        const sweepAllowance = Math.min(7, speed * 0.012);
        return radius + projectileRadius + sweepAllowance;
    }

    function resolveAttack(player, enemies) {
        if (player.attackMode === 'ranged') return;
        if (!player.attacking || player.attackTimer < player.attackDuration - 0.05) return;
        if (player._lastResolvedSwingId === player.currentSwingId) return;

        // Deal damage once per attack swing.
        const damage = player.getDamage();
        let hitAny = false;
        let hitCount = 0;
        let lastHitX = player.x;
        let lastHitY = player.y;
        let killCount = 0;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            const dist = Utils.dist(player.x, player.y, enemy.x, enemy.y);
            if (dist > player.attackRange + enemy.size) continue;

            // Check if enemy is within attack arc
            const angleToEnemy = Utils.angle(player.x, player.y, enemy.x, enemy.y);
            let angleDiff = angleToEnemy - player.attackAngle;
            
            // Normalize angle difference
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            if (Math.abs(angleDiff) <= player.attackArc / 2) {
                const wasAlive = enemy.alive;
                let skipLocalDamage = false;
                if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                    skipLocalDamage = !!window.__shadowCoopBeforeHit(enemy, damage);
                }
                if (!skipLocalDamage) {
                    enemy.takeDamage(damage, player.x, player.y);
                    if (wasAlive && !enemy.alive) killCount += 1;
                }
                if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                    window.__shadowCoopReportHit(enemy, damage);
                }
                hitAny = true;
                hitCount += 1;
                lastHitX = enemy.x;
                lastHitY = enemy.y;
            }
        }

        player._lastResolvedSwingId = player.currentSwingId;
        if (hitAny) {
            Particles.emitTrail(player.x, player.y, player.charDef.color);
            emitCombatImpact('player-melee-hit', lastHitX, lastHitY, {
                hitCount,
                killCount,
                target: 'enemy',
            });
        }
    }

    function resolveRangedHits(player, enemies) {
        if (!player || !Array.isArray(player.projectiles) || player.projectiles.length === 0) return;

        for (let i = player.projectiles.length - 1; i >= 0; i--) {
            const p = player.projectiles[i];
            if (!p || p.life <= 0) {
                player.projectiles.splice(i, 1);
                continue;
            }

            for (const enemy of enemies) {
                if (!enemy.alive) continue;
                if (p.hitSet && p.hitSet.has(enemy)) continue;

                const dist = Utils.dist(p.x, p.y, enemy.x, enemy.y);
                if (dist > projectileHitRadius(p, enemy.size)) continue;

                const wasAlive = enemy.alive;
                let skipLocalDamage = false;
                if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                    skipLocalDamage = !!window.__shadowCoopBeforeHit(enemy, p.damage);
                }
                if (!skipLocalDamage) {
                    enemy.takeDamage(p.damage, player.x, player.y);
                }
                if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                    window.__shadowCoopReportHit(enemy, p.damage);
                }
                if (p.hitSet) p.hitSet.add(enemy);
                p.remainingHits = Math.max(0, (p.remainingHits || 1) - 1);
                Particles.emitBurst(p.x, p.y, 4, p.color || player.charDef.color, 1.4);
                emitCombatImpact('player-ranged-hit', p.x, p.y, {
                    hitCount: 1,
                    killCount: (!skipLocalDamage && wasAlive && !enemy.alive) ? 1 : 0,
                    target: 'enemy',
                });

                if (p.remainingHits <= 0) {
                    player.projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }

    function resolveBossDamage(player, boss) {
        if (!player || !boss || !boss.alive) return false;

        if (player.attackMode !== 'ranged') {
            if (!player.attacking || player.attackTimer <= player.attackDuration - 0.05) return false;
            if (player._lastResolvedBossSwingId === player.currentSwingId) return false;

            const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
            if (dist >= player.attackRange + boss.size) return false;

            const damage = player.getDamage();
            const wasAlive = boss.alive;
            let skipLocalDamage = false;
            if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                skipLocalDamage = !!window.__shadowCoopBeforeHit(boss, damage);
            }
            if (!skipLocalDamage) {
                boss.takeDamage(damage, player.x, player.y);
            }
            if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                window.__shadowCoopReportHit(boss, damage);
            }
            player._lastResolvedBossSwingId = player.currentSwingId;
            emitCombatImpact('player-melee-hit', boss.x, boss.y, {
                hitCount: 1,
                killCount: (!skipLocalDamage && wasAlive && !boss.alive) ? 1 : 0,
                target: 'boss',
            });
            return true;
        }

        if (!Array.isArray(player.projectiles) || player.projectiles.length === 0) return false;

        let hit = false;
        for (let i = player.projectiles.length - 1; i >= 0; i--) {
            const p = player.projectiles[i];
            if (!p || p.life <= 0) {
                player.projectiles.splice(i, 1);
                continue;
            }
            if (p.hitSet && p.hitSet.has(boss)) continue;

            const dist = Utils.dist(p.x, p.y, boss.x, boss.y);
            if (dist > projectileHitRadius(p, boss.size)) continue;

            let skipLocalDamage = false;
            if (typeof window !== 'undefined' && typeof window.__shadowCoopBeforeHit === 'function') {
                skipLocalDamage = !!window.__shadowCoopBeforeHit(boss, p.damage);
            }
            if (!skipLocalDamage) {
                boss.takeDamage(p.damage, player.x, player.y);
            }
            if (typeof window !== 'undefined' && typeof window.__shadowCoopReportHit === 'function') {
                window.__shadowCoopReportHit(boss, p.damage);
            }
            if (p.hitSet) p.hitSet.add(boss);
            p.remainingHits = Math.max(0, (p.remainingHits || 1) - 1);
            Particles.emitBurst(p.x, p.y, 5, p.color || player.charDef.color, 1.6);
            emitCombatImpact('player-ranged-hit', p.x, p.y, {
                hitCount: 1,
                target: 'boss',
            });
            hit = true;

            if (p.remainingHits <= 0) {
                player.projectiles.splice(i, 1);
            }
        }
        return hit;
    }

    function checkEnemyCollisions(player, enemies) {
        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            // Body collision
            const dist = Utils.dist(player.x, player.y, enemy.x, enemy.y);
            if (dist < player.size + enemy.size) {
                if (enemy.attackCooldown <= 0) {
                    const tookDamage = !!player.takeDamage(enemy.damage);
                    if (tookDamage) {
                        emitCombatImpact('player-damaged', player.x, player.y, {
                            amount: enemy.damage,
                            source: 'contact',
                        });
                    }
                    enemy.attackCooldown = 0.8;
                }
            }

            // Projectile collision
            for (let i = enemy.projectiles.length - 1; i >= 0; i--) {
                const p = enemy.projectiles[i];
                const pdist = Utils.dist(player.x, player.y, p.x, p.y);
                if (pdist < projectileHitRadius(p, player.size)) {
                    const tookDamage = !!player.takeDamage(p.damage);
                    if (tookDamage) {
                        emitCombatImpact('player-damaged', player.x, player.y, {
                            amount: p.damage,
                            source: 'projectile',
                        });
                    }
                    Particles.emitBurst(p.x, p.y, 5, enemy.def.color);
                    enemy.projectiles.splice(i, 1);
                }
            }
        }
    }

    function checkItemCollisions(player, items) {
        for (const item of items) {
            if (item.collected) continue;

            const dist = Utils.dist(player.x, player.y, item.x, item.y);
            if (dist < player.size + item.radius) {
                player.collectItem(item);
            }
        }
    }

    return {
        resolveAttack,
        resolveRangedHits,
        resolveBossDamage,
        checkEnemyCollisions,
        checkItemCollisions,
    };
})();
