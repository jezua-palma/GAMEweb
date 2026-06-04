/* ============================================
   PARTICLES — Visual particle effects system
   ============================================ */

const Particles = (() => {
    let particles = [];
    let enabled = true;
    let qualityMultiplier = 1;
    let maxParticles = 1200;
    let maxTextParticles = 120;

    class Particle {
        constructor(x, y, opts = {}) {
            this.x = x;
            this.y = y;
            this.vx = opts.vx || Utils.randFloat(-2, 2);
            this.vy = opts.vy || Utils.randFloat(-2, 2);
            this.life = opts.life || Utils.randFloat(0.3, 0.8);
            this.maxLife = this.life;
            this.size = opts.size || Utils.randFloat(2, 5);
            this.color = opts.color || '#7c3aed';
            this.gravity = opts.gravity || 0;
            this.friction = opts.friction || 0.98;
            this.shrink = opts.shrink !== undefined ? opts.shrink : true;
            this.glow = opts.glow || false;
        }

        update(dt) {
            this.life -= dt;
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.vy += this.gravity;
            this.x += this.vx;
            this.y += this.vy;
        }

        draw(ctx, cam) {
            const alpha = Math.max(0, this.life / this.maxLife);
            const sz = this.shrink ? this.size * alpha : this.size;
            const sx = this.x - cam.x;
            const sy = this.y - cam.y;

            ctx.save();
            ctx.globalAlpha = alpha;

            if (this.glow) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
            }

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(0.5, sz), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        isDead() {
            return this.life <= 0;
        }
    }

    function emit(x, y, count, opts = {}) {
        if (!enabled) return;
        const scaledCount = Math.max(1, Math.round(count * qualityMultiplier));
        for (let i = 0; i < scaledCount; i++) {
            if (particles.length >= maxParticles) break;
            particles.push(new Particle(x, y, {
                ...opts,
                vx: (opts.vx || 0) + Utils.randFloat(-2, 2) * (opts.spread || 1),
                vy: (opts.vy || 0) + Utils.randFloat(-2, 2) * (opts.spread || 1),
            }));
        }
    }

    function emitBurst(x, y, count, color, speed = 3) {
        if (!enabled) return;
        const scaledCount = Math.max(1, Math.round(count * qualityMultiplier));
        for (let i = 0; i < scaledCount; i++) {
            if (particles.length >= maxParticles) break;
            const angle = (Math.PI * 2 / scaledCount) * i + Utils.randFloat(-0.3, 0.3);
            const spd = Utils.randFloat(speed * 0.5, speed);
            particles.push(new Particle(x, y, {
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                color: color,
                size: Utils.randFloat(2, 5),
                life: Utils.randFloat(0.3, 0.6),
                glow: true,
            }));
        }
    }

    function emitTrail(x, y, color) {
        if (!enabled) return;
        if (particles.length >= maxParticles) return;
        if (qualityMultiplier < 1 && Math.random() > qualityMultiplier) return;
        particles.push(new Particle(x, y, {
            vx: Utils.randFloat(-0.5, 0.5),
            vy: Utils.randFloat(-0.5, 0.5),
            color: color,
            size: Utils.randFloat(1, 3),
            life: Utils.randFloat(0.2, 0.4),
            glow: true,
        }));
    }

    function update(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(dt);
            if (particles[i].isDead()) {
                particles.splice(i, 1);
            }
        }
    }

    function draw(ctx, cam) {
        for (const p of particles) {
            p.draw(ctx, cam);
        }
    }

    // Floating text particles (for "+20 XP", "CRIT!", etc.)
    let textParticles = [];

    function emitText(x, y, text, color) {
        if (!enabled) return;
        if (textParticles.length >= maxTextParticles) return;
        textParticles.push({
            x, y,
            text,
            color: color || '#fff',
            life: 1.2,
            maxLife: 1.2,
            vy: -1.2,
        });
    }

    function updateTexts(dt) {
        for (let i = textParticles.length - 1; i >= 0; i--) {
            const t = textParticles[i];
            t.life -= dt;
            t.y += t.vy;
            if (t.life <= 0) textParticles.splice(i, 1);
        }
    }

    function drawTexts(ctx, cam) {
        for (const t of textParticles) {
            const alpha = Math.max(0, t.life / t.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = t.color;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 8;
            ctx.fillText(t.text, t.x - cam.x, t.y - cam.y);
            ctx.restore();
        }
    }

    // Wrap original update/draw to include text particles
    const _origUpdate = update;
    const _origDraw   = draw;

    function fullUpdate(dt) {
        _origUpdate(dt);
        updateTexts(dt);
    }

    function fullDraw(ctx, cam) {
        _origDraw(ctx, cam);
        drawTexts(ctx, cam);
    }

    function fullClear() {
        particles = [];
        textParticles = [];
    }

    function setQuality(mult) {
        const q = Number(mult);
        qualityMultiplier = Number.isFinite(q) ? Utils.clamp(q, 0.2, 1.4) : 1;
        maxParticles = Math.round(260 + qualityMultiplier * 1040);
        maxTextParticles = Math.round(35 + qualityMultiplier * 120);
    }

    return {
        emit,
        emitBurst,
        emitTrail,
        emitText,
        update: fullUpdate,
        draw: fullDraw,
        clear: fullClear,
        setEnabled(v) { enabled = v; },
        setQuality,
        get qualityMultiplier() { return qualityMultiplier; },
        get count() { return particles.length; }
    };
})();
