/* ============================================
   SPRITE ASSETS - Shared sprite + sprite-sheet store
   ============================================ */

const SpriteAssets = (() => {
    const MANIFEST_PATH = 'assets/kenney/pack_manifest.json';
    const EXAMPLE_MANIFEST_PATH = 'assets/kenney/pack_manifest.example.json';

    const imageMap = new Map();
    const sheetMap = new Map();
    let initialized = false;
    let initPromise = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function loadImage(path) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = path;
        });
    }

    async function fetchManifest(path) {
        try {
            const res = await fetch(path, { cache: 'no-cache' });
            if (!res.ok) return null;
            return await res.json();
        } catch (_err) {
            return null;
        }
    }

    function roundRectPath(ctx, x, y, w, h, r) {
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

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    function putSheet(key, canvas, frameWidth, frameHeight, columns, rows, animations) {
        if (!key || !canvas) return;
        sheetMap.set(key, {
            key,
            image: canvas,
            frameWidth,
            frameHeight,
            columns,
            rows,
            animations: animations || {},
        });
    }

    function drawHumanoidFrame(ctx, w, h, row, col, palette) {
        const cx = w * 0.5;
        const groundY = h - 4;
        const walk = [0, 1.4, 0, -1.4][col % 4];
        const isAttack = row === 3;
        const isSide = row === 1;
        const isUp = row === 2;

        // --- Chibi Knight proportions ---
        const bodyH = 12;
        const bodyW = 16;
        const bodyY = groundY - 22;
        const headR = 9.5;
        const headY = bodyY - headR + 1;
        const legH = 9;
        const legW = 5.5;

        const mainCol = palette.main;
        const darkCol = palette.dark;
        const accentCol = palette.weapon || '#fde68a';
        const capeCol = palette.cape || palette.dark;
        const skinCol = palette.skin || '#e2bc96';

        // === CAPE (behind body) ===
        ctx.fillStyle = capeCol;
        ctx.beginPath();
        const capeSway = Math.sin(col * 1.5) * 1.5;
        ctx.moveTo(cx - 6, bodyY + 2);
        ctx.quadraticCurveTo(cx - 8 + capeSway, bodyY + bodyH + legH - 2, cx - 5 + capeSway * 0.6, groundY + 1);
        ctx.lineTo(cx + 5 + capeSway * 0.6, groundY + 1);
        ctx.quadraticCurveTo(cx + 8 + capeSway, bodyY + bodyH + legH - 2, cx + 6, bodyY + 2);
        ctx.closePath();
        ctx.fill();
        // Cape edge highlight
        ctx.strokeStyle = palette.capeEdge || '#6b1e1e';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // === SHADOW ===
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 2, 10, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // === LEGS (stubby armored boots) ===
        const leftLegX = cx - 5;
        const rightLegX = cx + 0.5;
        const leftLegYOff = walk * 0.6;
        const rightLegYOff = -walk * 0.6;

        // Left leg
        ctx.fillStyle = darkCol;
        roundRectPath(ctx, leftLegX - 1, bodyY + bodyH - 1 + leftLegYOff, legW + 1, legH, 2);
        ctx.fill();
        // Boot accent
        ctx.fillStyle = mainCol;
        roundRectPath(ctx, leftLegX - 0.5, bodyY + bodyH + legH - 4 + leftLegYOff, legW, 4, 1.5);
        ctx.fill();

        // Right leg
        ctx.fillStyle = darkCol;
        roundRectPath(ctx, rightLegX - 0.5, bodyY + bodyH - 1 + rightLegYOff, legW + 1, legH, 2);
        ctx.fill();
        ctx.fillStyle = mainCol;
        roundRectPath(ctx, rightLegX, bodyY + bodyH + legH - 4 + rightLegYOff, legW, 4, 1.5);
        ctx.fill();

        // === BODY (armored torso) ===
        // Main armor plate
        ctx.fillStyle = mainCol;
        roundRectPath(ctx, cx - bodyW * 0.5, bodyY, bodyW, bodyH, 4);
        ctx.fill();

        // Chest plate detail (center vertical stripe)
        ctx.fillStyle = accentCol;
        roundRectPath(ctx, cx - 2.5, bodyY + 1.5, 5, bodyH - 3, 2);
        ctx.fill();

        // Belt / waist line
        ctx.fillStyle = darkCol;
        roundRectPath(ctx, cx - bodyW * 0.5 + 1, bodyY + bodyH - 3.5, bodyW - 2, 3, 1.5);
        ctx.fill();
        // Belt buckle
        ctx.fillStyle = accentCol;
        ctx.beginPath();
        ctx.arc(cx, bodyY + bodyH - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // === SHOULDER PADS ===
        ctx.fillStyle = mainCol;
        // Left shoulder
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.5 - 1, bodyY + 3, 4, 3.5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accentCol;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        // Right shoulder
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * 0.5 + 1, bodyY + 3, 4, 3.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // === ARMS ===
        const armY = bodyY + 4;
        ctx.strokeStyle = darkCol;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        // Left arm
        ctx.beginPath();
        ctx.moveTo(cx - bodyW * 0.5 - 1, armY);
        if (isAttack) {
            ctx.lineTo(cx - bodyW * 0.5 - 4, armY + 6);
        } else {
            ctx.lineTo(cx - bodyW * 0.5 - 3, armY + 6 + walk * 0.3);
        }
        ctx.stroke();
        // Hand
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        if (isAttack) {
            ctx.arc(cx - bodyW * 0.5 - 4, armY + 6, 1.8, 0, Math.PI * 2);
        } else {
            ctx.arc(cx - bodyW * 0.5 - 3, armY + 6 + walk * 0.3, 1.8, 0, Math.PI * 2);
        }
        ctx.fill();

        // Right arm (weapon hand)
        ctx.strokeStyle = darkCol;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx + bodyW * 0.5 + 1, armY);
        if (isAttack) {
            ctx.lineTo(cx + bodyW * 0.5 + 6, armY - 2);
        } else {
            ctx.lineTo(cx + bodyW * 0.5 + 4, armY + 5 - walk * 0.3);
        }
        ctx.stroke();
        // Hand
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        if (isAttack) {
            ctx.arc(cx + bodyW * 0.5 + 6, armY - 2, 1.8, 0, Math.PI * 2);
        } else {
            ctx.arc(cx + bodyW * 0.5 + 4, armY + 5 - walk * 0.3, 1.8, 0, Math.PI * 2);
        }
        ctx.fill();

        // === WEAPON (Class-Specific Drawings) ===
        const rx = isAttack ? cx + bodyW * 0.5 + 6 : cx + bodyW * 0.5 + 4;
        const ry = isAttack ? armY - 2 : armY + 5 - walk * 0.3;

        const lx = isAttack ? cx - bodyW * 0.5 - 4 : cx - bodyW * 0.5 - 3;
        const ly = isAttack ? armY + 6 : armY + 6 + walk * 0.3;

        const classId = palette.classId || 'warrior';

        if (classId === 'mage') {
            // Mage staff: wooden shaft with a glowing crystal tip
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            if (isAttack) {
                ctx.lineTo(rx + 9, ry - 11);
            } else {
                ctx.lineTo(rx + 4, ry + 11);
            }
            ctx.stroke();

            // Crystal tip
            const tx = isAttack ? rx + 9 : rx + 4;
            const ty = isAttack ? ry - 11 : ry + 11;
            ctx.fillStyle = '#22d3ee';
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(tx, ty, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

        } else if (classId === 'rogue') {
            // Rogue dual-wielding daggers
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            // Right Hand Dagger
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            if (isAttack) {
                ctx.lineTo(rx + 6, ry - 6);
            } else {
                ctx.lineTo(rx + 2, ry + 6);
            }
            ctx.stroke();

            // Left Hand Dagger
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx - 2, ly + 6);
            ctx.stroke();

        } else if (classId === 'paladin') {
            // Paladin mace and left hand buckler shield
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            if (isAttack) {
                ctx.lineTo(rx + 8, ry - 9);
            } else {
                ctx.lineTo(rx + 3, ry + 9);
            }
            ctx.stroke();

            // Mace head
            const mx = isAttack ? rx + 8 : rx + 3;
            const my = isAttack ? ry - 9 : ry + 9;
            ctx.fillStyle = '#9ca3af';
            ctx.beginPath();
            ctx.arc(mx, my, 3, 0, Math.PI * 2);
            ctx.fill();

            // Buckler Shield (Left Arm)
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

        } else if (classId === 'archer') {
            // Archer bow
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            if (isAttack) {
                ctx.arc(rx + 3, ry - 3, 7, -Math.PI * 0.3, Math.PI * 0.7);
            } else {
                ctx.arc(rx + 2, ry + 2, 7, Math.PI * 0.2, Math.PI * 1.2);
            }
            ctx.stroke();

            // Bowstring
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            if (isAttack) {
                ctx.moveTo(rx - 1, ry - 9);
                ctx.lineTo(rx - 2, ry + 2);
            } else {
                ctx.moveTo(rx - 2, ry - 3);
                ctx.lineTo(rx + 7, ry + 7);
            }
            ctx.stroke();

        } else {
            // Warrior / Default broadsword
            if (isAttack) {
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + 10, ry - 12);
                ctx.stroke();

                // Blade highlight
                ctx.strokeStyle = '#e5e7eb';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(rx + 1, ry - 1);
                ctx.lineTo(rx + 9, ry - 11);
                ctx.stroke();

                // Crossguard
                ctx.strokeStyle = accentCol;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(rx - 2, ry + 1);
                ctx.lineTo(rx + 3, ry - 2);
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 2.8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + 4, ry + 11);
                ctx.stroke();

                // Blade highlight
                ctx.strokeStyle = '#e5e7eb';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(rx + 0.5, ry + 1);
                ctx.lineTo(rx + 3.5, ry + 10);
                ctx.stroke();

                // Crossguard
                ctx.strokeStyle = accentCol;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(rx - 2.5, ry + 1);
                ctx.lineTo(rx + 2.5, ry - 1);
                ctx.stroke();
            }
        }

        // === HEAD (oversized helmet) ===
        // Helmet base (big round)
        ctx.fillStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.arc(cx, headY, headR, 0, Math.PI * 2);
        ctx.fill();

        // Helmet top half (colored)
        ctx.fillStyle = mainCol;
        ctx.beginPath();
        ctx.arc(cx, headY, headR, Math.PI, Math.PI * 2);
        ctx.fill();

        // Helmet accent band
        ctx.fillStyle = accentCol;
        roundRectPath(ctx, cx - headR + 1, headY - 1.5, headR * 2 - 2, 3, 1.5);
        ctx.fill();

        // Visor slit (eyes area)
        if (!isUp) {
            ctx.fillStyle = '#1a1a2e';
            roundRectPath(ctx, cx - 6, headY + 0.5, 12, 3.5, 1.5);
            ctx.fill();
            // Glowing eyes inside visor
            ctx.fillStyle = accentCol;
            ctx.shadowColor = accentCol;
            ctx.shadowBlur = 4;
            if (isSide) {
                ctx.beginPath();
                ctx.arc(cx + 2, headY + 2.2, 1, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(cx - 2.3, headY + 2.2, 0.9, 0, Math.PI * 2);
                ctx.arc(cx + 2.3, headY + 2.2, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        } else {
            // Back view - helmet back plate
            ctx.fillStyle = darkCol;
            ctx.beginPath();
            ctx.arc(cx, headY + 1, headR - 1.5, 0, Math.PI);
            ctx.fill();
        }

        // Helmet center crest (triangle/gem)
        ctx.fillStyle = accentCol;
        ctx.beginPath();
        ctx.moveTo(cx, headY - headR + 1);
        ctx.lineTo(cx - 3, headY - headR + 5.5);
        ctx.lineTo(cx + 3, headY - headR + 5.5);
        ctx.closePath();
        ctx.fill();
        // Gem in center
        const gemCol = palette.gem || '#ef4444';
        ctx.fillStyle = gemCol;
        ctx.beginPath();
        ctx.arc(cx, headY - headR + 4.5, 1.3, 0, Math.PI * 2);
        ctx.fill();

        // === HELMET HORNS / WINGS ===
        ctx.fillStyle = accentCol;
        ctx.strokeStyle = palette.hornEdge || '#b8860b';
        ctx.lineWidth = 0.6;

        // Left horn/wing
        ctx.beginPath();
        ctx.moveTo(cx - headR + 2, headY - 2);
        ctx.quadraticCurveTo(cx - headR - 5, headY - 10, cx - headR - 2, headY - 16);
        ctx.quadraticCurveTo(cx - headR + 1, headY - 10, cx - headR + 4, headY - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right horn/wing
        ctx.beginPath();
        ctx.moveTo(cx + headR - 2, headY - 2);
        ctx.quadraticCurveTo(cx + headR + 5, headY - 10, cx + headR + 2, headY - 16);
        ctx.quadraticCurveTo(cx + headR - 1, headY - 10, cx + headR - 4, headY - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Helmet outline for polish
        ctx.strokeStyle = darkCol;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx, headY, headR, 0, Math.PI * 2);
        ctx.stroke();
    }

    function buildHumanoidSheet(palette) {
        const frameWidth = 48;
        const frameHeight = 48;
        const columns = 4;
        const rows = 4;
        const c = makeCanvas(frameWidth * columns, frameHeight * rows);
        const ctx = c.getContext('2d');
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                ctx.save();
                ctx.translate(col * frameWidth, row * frameHeight);
                drawHumanoidFrame(ctx, frameWidth, frameHeight, row, col, palette);
                ctx.restore();
            }
        }
        return { canvas: c, frameWidth, frameHeight, columns, rows };
    }

    function buildSlimeSheet(mainColor, darkColor) {
        const frameWidth = 48;
        const frameHeight = 48;
        const columns = 4;
        const rows = 4;
        const c = makeCanvas(frameWidth * columns, frameHeight * rows);
        const ctx = c.getContext('2d');
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const ox = col * frameWidth;
                const oy = row * frameHeight;
                const squish = [0.95, 1.08, 0.92, 1.02][col];
                const rise = [0, -1.5, 0.8, -0.4][col];
                const cx = ox + frameWidth * 0.5;
                const cy = oy + frameHeight * 0.65 + rise;
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.ellipse(cx, cy, 12.5, 10.5 * squish, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.ellipse(cx, cy + 4.2, 8.6, 4.1 * squish, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.arc(cx - 3, cy - 1.3, 1.4, 0, Math.PI * 2);
                ctx.arc(cx + 3, cy - 1.3, 1.4, 0, Math.PI * 2);
                ctx.fill();

                if (row === 3) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
        return { canvas: c, frameWidth, frameHeight, columns, rows };
    }

    function buildBatSheet(mainColor, darkColor) {
        const frameWidth = 48;
        const frameHeight = 48;
        const columns = 4;
        const rows = 4;
        const c = makeCanvas(frameWidth * columns, frameHeight * rows);
        const ctx = c.getContext('2d');
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const ox = col * frameWidth;
                const oy = row * frameHeight;
                const flap = [-0.9, -0.2, 0.9, 0.2][col];
                const cx = ox + frameWidth * 0.5;
                const cy = oy + frameHeight * 0.56;
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.ellipse(cx, cy, 5.5, 7, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.moveTo(cx - 1.5, cy - 1.5);
                ctx.quadraticCurveTo(cx - 13, cy - 9 - flap * 4, cx - 17, cy + 5);
                ctx.quadraticCurveTo(cx - 10, cy + 2.5, cx - 1, cy + 1.8);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(cx + 1.5, cy - 1.5);
                ctx.quadraticCurveTo(cx + 13, cy - 9 - flap * 4, cx + 17, cy + 5);
                ctx.quadraticCurveTo(cx + 10, cy + 2.5, cx + 1, cy + 1.8);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.arc(cx - 1.8, cy - 2.3, 1, 0, Math.PI * 2);
                ctx.arc(cx + 1.8, cy - 2.3, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        return { canvas: c, frameWidth, frameHeight, columns, rows };
    }

    function buildBossSheet(mainColor, darkColor) {
        const frameWidth = 64;
        const frameHeight = 64;
        const columns = 4;
        const rows = 4;
        const c = makeCanvas(frameWidth * columns, frameHeight * rows);
        const ctx = c.getContext('2d');
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const ox = col * frameWidth;
                const oy = row * frameHeight;
                const stride = [0, 1.6, 0, -1.6][col];
                const cx = ox + frameWidth * 0.5;
                const cy = oy + frameHeight * 0.62;

                // Legs
                ctx.fillStyle = darkColor;
                roundRectPath(ctx, cx - 16, cy + 5 + stride * 0.25, 10, 18, 4);
                ctx.fill();
                roundRectPath(ctx, cx + 6, cy + 5 - stride * 0.25, 10, 18, 4);
                ctx.fill();

                // Torso
                ctx.fillStyle = mainColor;
                roundRectPath(ctx, cx - 20, cy - 20, 40, 36, 10);
                ctx.fill();
                ctx.fillStyle = darkColor;
                roundRectPath(ctx, cx - 9, cy - 16, 18, 28, 6);
                ctx.fill();

                // Head
                const headY = cy - 29;
                ctx.fillStyle = '#d6c0a8';
                ctx.beginPath();
                ctx.arc(cx, headY, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.arc(cx, headY - 1.8, 9, Math.PI, Math.PI * 2);
                ctx.fill();

                // Eyes
                ctx.fillStyle = row === 3 ? '#ef4444' : '#f8fafc';
                ctx.beginPath();
                ctx.arc(cx - 3.2, headY - 0.6, 1.4, 0, Math.PI * 2);
                ctx.arc(cx + 3.2, headY - 0.6, 1.4, 0, Math.PI * 2);
                ctx.fill();

                // Weapon cue
                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx + 24, cy + 2);
                ctx.lineTo(cx + 33, cy - 10);
                ctx.stroke();
            }
        }
        return { canvas: c, frameWidth, frameHeight, columns, rows };
    }

    function ensureGeneratedSheets() {
        if (!sheetMap.has('player_adventurer')) {
            const generic = buildHumanoidSheet({
                classId: 'warrior',
                main: '#4f8cdf',
                dark: '#2f4977',
                skin: '#e3be95',
                weapon: '#d1d5db',
                cape: '#2f4977',
                capeEdge: '#1e3a5f',
                gem: '#60a5fa',
                hornEdge: '#3b6cb8',
            });
            putSheet('player_adventurer', generic.canvas, generic.frameWidth, generic.frameHeight, generic.columns, generic.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 9 },
                attack: { frames: [0, 1, 2, 3], fps: 14 },
            });
        }

        const playerPalettes = {
            player_warrior: {
                classId: 'warrior',
                main: '#ef4444', dark: '#7f1d1d', skin: '#deb085', weapon: '#e5e7eb',
                cape: '#7f1d1d', capeEdge: '#5c0e0e', gem: '#fbbf24', hornEdge: '#b91c1c',
            },
            player_rogue: {
                classId: 'rogue',
                main: '#a855f7', dark: '#581c87', skin: '#cfa27c', weapon: '#d8b4fe',
                cape: '#3b0764', capeEdge: '#2e0452', gem: '#c084fc', hornEdge: '#7c3aed',
            },
            player_mage: {
                classId: 'mage',
                main: '#06b6d4', dark: '#0e7490', skin: '#e7c19a', weapon: '#67e8f9',
                cape: '#164e63', capeEdge: '#0c3547', gem: '#22d3ee', hornEdge: '#0891b2',
            },
            player_paladin: {
                classId: 'paladin',
                main: '#f59e0b', dark: '#92400e', skin: '#d8ae86', weapon: '#fde68a',
                cape: '#7f1d1d', capeEdge: '#5c0e0e', gem: '#ef4444', hornEdge: '#b8860b',
            },
        };
        for (const [key, palette] of Object.entries(playerPalettes)) {
            if (sheetMap.has(key)) continue;
            const sh = buildHumanoidSheet(palette);
            putSheet(key, sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 9 },
                attack: { frames: [0, 1, 2, 3], fps: 14 },
            });
        }

        if (!sheetMap.has('enemy_humanoid')) {
            const sh = buildHumanoidSheet({
                classId: 'warrior',
                main: '#64748b',
                dark: '#334155',
                skin: '#d8bd9e',
                weapon: '#cbd5e1',
                cape: '#334155', capeEdge: '#1e293b', gem: '#94a3b8', hornEdge: '#475569',
            });
            putSheet('enemy_humanoid', sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 8 },
                attack: { frames: [0, 1, 2, 3], fps: 12 },
            });
        }

        const enemyVariants = {
            enemy_skeleton: {
                classId: 'skeleton',
                main: '#d4d4d8', dark: '#71717a', skin: '#f4f4f5', weapon: '#f1f5f9',
                cape: '#52525b', capeEdge: '#3f3f46', gem: '#a1a1aa', hornEdge: '#a1a1aa',
            },
            enemy_archer: {
                classId: 'archer',
                main: '#f97316', dark: '#9a3412', skin: '#d2aa83', weapon: '#fdba74',
                cape: '#7c2d12', capeEdge: '#5c1d0e', gem: '#fb923c', hornEdge: '#c2410c',
            },
            enemy_mage: {
                classId: 'mage',
                main: '#06b6d4', dark: '#155e75', skin: '#ebc3a0', weapon: '#67e8f9',
                cape: '#164e63', capeEdge: '#0c3547', gem: '#22d3ee', hornEdge: '#0891b2',
            },
        };
        for (const [key, palette] of Object.entries(enemyVariants)) {
            if (sheetMap.has(key)) continue;
            const sh = buildHumanoidSheet(palette);
            putSheet(key, sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 8 },
                attack: { frames: [0, 1, 2, 3], fps: 12 },
            });
        }

        if (!sheetMap.has('enemy_slime')) {
            const sh = buildSlimeSheet('#22c55e', '#15803d');
            putSheet('enemy_slime', sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 7 },
                attack: { frames: [0, 1, 2, 3], fps: 11 },
            });
        }
        if (!sheetMap.has('enemy_bat')) {
            const sh = buildBatSheet('#a855f7', '#581c87');
            putSheet('enemy_bat', sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1, 2], fps: 6 },
                walk: { frames: [0, 1, 2, 3], fps: 13 },
                attack: { frames: [0, 1, 2, 3], fps: 15 },
            });
        }

        if (!sheetMap.has('boss_titan')) {
            const sh = buildBossSheet('#8b5cf6', '#312e81');
            putSheet('boss_titan', sh.canvas, sh.frameWidth, sh.frameHeight, sh.columns, sh.rows, {
                idle: { frames: [1], fps: 1 },
                walk: { frames: [0, 1, 2, 3], fps: 7 },
                attack: { frames: [0, 1, 2, 3], fps: 11 },
            });
        }
    }

    function parseSheetManifestEntries(rawSheets) {
        if (!rawSheets || typeof rawSheets !== 'object') return [];
        const entries = [];
        for (const [key, value] of Object.entries(rawSheets)) {
            if (!value || typeof value !== 'object') continue;
            const path = typeof value.path === 'string' ? value.path.trim() : '';
            if (!path) continue;
            const frameWidth = Math.max(1, Number(value.frameWidth) || 48);
            const frameHeight = Math.max(1, Number(value.frameHeight) || 48);
            const columns = Math.max(1, Number(value.columns) || 1);
            const rows = Math.max(1, Number(value.rows) || 1);
            const animations = value.animations && typeof value.animations === 'object'
                ? value.animations
                : {};
            entries.push({ key, path, frameWidth, frameHeight, columns, rows, animations });
        }
        return entries;
    }

    async function init() {
        if (initialized) return;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const manifest = await fetchManifest(MANIFEST_PATH)
                || await fetchManifest(EXAMPLE_MANIFEST_PATH)
                || {};

            const spriteEntries = manifest && manifest.sprites && typeof manifest.sprites === 'object'
                ? Object.entries(manifest.sprites)
                : [];
            for (const [key, path] of spriteEntries) {
                if (!key || typeof path !== 'string' || !path.trim()) continue;
                const img = await loadImage(path.trim());
                if (img) imageMap.set(key, img);
            }

            const rawSheets = manifest.spriteSheets || manifest.sheets;
            const sheetEntries = parseSheetManifestEntries(rawSheets);
            for (const entry of sheetEntries) {
                const img = await loadImage(entry.path);
                if (!img) continue;
                const inferredCols = Math.max(1, Math.floor(img.width / entry.frameWidth) || entry.columns);
                const inferredRows = Math.max(1, Math.floor(img.height / entry.frameHeight) || entry.rows);
                sheetMap.set(entry.key, {
                    key: entry.key,
                    image: img,
                    frameWidth: entry.frameWidth,
                    frameHeight: entry.frameHeight,
                    columns: inferredCols,
                    rows: inferredRows,
                    animations: entry.animations || {},
                });
            }

            ensureGeneratedSheets();
            initialized = true;
        })();
        return initPromise;
    }

    function get(key) {
        init();
        return imageMap.get(key) || null;
    }

    function getByLevel(baseKey, levelNum) {
        init();
        const lvl = clamp(Number(levelNum) || 1, 1, 5);
        return get(`${baseKey}_${lvl}`) || get(baseKey);
    }

    function getSheet(key) {
        init();
        return sheetMap.get(key) || null;
    }

    function getSheetByLevel(baseKey, levelNum) {
        init();
        const lvl = clamp(Number(levelNum) || 1, 1, 5);
        return getSheet(`${baseKey}_${lvl}`) || getSheet(baseKey);
    }

    function resolveAnimationFrame(sheet, animationName, timeSec) {
        if (!sheet) return 0;
        const anim = sheet.animations?.[animationName]
            || sheet.animations?.idle
            || null;
        if (!anim) return 0;
        const frames = Array.isArray(anim) ? anim : (Array.isArray(anim.frames) ? anim.frames : [0]);
        if (!frames.length) return 0;
        const fps = Number(anim.fps) > 0 ? Number(anim.fps) : 8;
        const idx = Math.floor(Math.max(0, timeSec || 0) * fps) % frames.length;
        return Number(frames[idx]) || 0;
    }

    function drawFrame(ctx, sheet, frameIndex, dx, dy, dw, dh, flipX = false) {
        if (!ctx || !sheet || !sheet.image) return false;
        const cols = Math.max(1, sheet.columns || 1);
        const rows = Math.max(1, sheet.rows || 1);
        const fw = Math.max(1, sheet.frameWidth || Math.floor(sheet.image.width / cols) || sheet.image.width);
        const fh = Math.max(1, sheet.frameHeight || Math.floor(sheet.image.height / rows) || sheet.image.height);
        const frameCount = cols * rows;
        const safeFrame = ((Math.max(0, Math.floor(frameIndex || 0))) % frameCount + frameCount) % frameCount;
        const sx = (safeFrame % cols) * fw;
        const sy = Math.floor(safeFrame / cols) * fh;

        if (!flipX) {
            ctx.drawImage(sheet.image, sx, sy, fw, fh, dx, dy, dw, dh);
            return true;
        }
        ctx.save();
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet.image, sx, sy, fw, fh, 0, 0, dw, dh);
        ctx.restore();
        return true;
    }

    function drawAnimated(ctx, sheet, animationName, timeSec, rowOffset, dx, dy, dw, dh, flipX = false) {
        if (!sheet) return false;
        const cols = Math.max(1, sheet.columns || 1);
        const rows = Math.max(1, sheet.rows || 1);
        const row = clamp(Number(rowOffset) || 0, 0, rows - 1);
        const frameValue = resolveAnimationFrame(sheet, animationName, timeSec);
        const totalFrames = cols * rows;
        // Supports both styles:
        // - local row frame indices (0..cols-1)
        // - absolute frame indices across the whole sheet (0..totalFrames-1)
        const frame = (frameValue >= cols && frameValue < totalFrames)
            ? frameValue
            : (row * cols + clamp(frameValue, 0, cols - 1));
        return drawFrame(ctx, sheet, frame, dx, dy, dw, dh, flipX);
    }

    init();

    return {
        init,
        get,
        getByLevel,
        getSheet,
        getSheetByLevel,
        resolveAnimationFrame,
        drawFrame,
        drawAnimated,
        has: (key) => imageMap.has(key) || sheetMap.has(key),
    };
})();
