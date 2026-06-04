/* ============================================
   ITEMS - Collectible items, treasure, chest loot
   ============================================ */

const Items = (() => {
    const ITEM_TYPES = {
        HEALTH_POTION: {
            id: 'health_potion',
            name: 'Health Potion',
            icon: 'HP',
            color: '#ef4444',
            description: 'Restores 1 heart',
            rarity: 'common',
        },
        SPEED_BOOST: {
            id: 'speed_boost',
            name: 'Swift Boots',
            icon: 'SPD',
            color: '#06b6d4',
            description: 'Move faster for 15s',
            rarity: 'uncommon',
        },
        DAMAGE_BOOST: {
            id: 'damage_boost',
            name: 'Power Gem',
            icon: 'DMG',
            color: '#f59e0b',
            description: '+50% damage for 20s',
            rarity: 'rare',
        },
        SHIELD: {
            id: 'shield',
            name: 'Magic Shield',
            icon: 'SHD',
            color: '#7c3aed',
            description: 'Block next 2 hits',
            rarity: 'rare',
        },
        GOLD_SMALL: {
            id: 'gold_small',
            name: 'Gold Coin',
            icon: 'G',
            color: '#fbbf24',
            description: '+10 gold',
            rarity: 'common',
            value: 10,
        },
        GOLD_LARGE: {
            id: 'gold_large',
            name: 'Gold Cache',
            icon: 'GG',
            color: '#f59e0b',
            description: '+50 gold',
            rarity: 'uncommon',
            value: 50,
        },
        KEY: {
            id: 'key',
            name: 'Dungeon Key',
            icon: 'KEY',
            color: '#d97706',
            description: 'Opens locked chests',
            rarity: 'uncommon',
        },
        TREASURE_RELIC: {
            id: 'treasure_relic',
            name: 'Ancient Relic',
            icon: 'REL',
            color: '#facc15',
            description: 'Quest treasure used for story progression',
            rarity: 'epic',
            value: 150,
        },
        TREASURE_MAP: {
            id: 'treasure_map',
            name: 'War Map Fragment',
            icon: 'MAP',
            color: '#fb923c',
            description: 'Rare map fragment for story mode',
            rarity: 'rare',
            value: 110,
        },
    };

    class Item {
        constructor(x, y, type) {
            this.x = x;
            this.y = y;
            this.type = type;
            this.radius = 12;
            this.bobOffset = Math.random() * Math.PI * 2;
            this.collected = false;
            this.spawnTime = Date.now();
        }

        update(dt) {
            this.bobOffset += dt * 3;
        }

        draw(ctx, cam) {
            if (this.collected) return;
            const sx = this.x - cam.x;
            const sy = this.y - cam.y + Math.sin(this.bobOffset) * 4;

            ctx.save();
            ctx.shadowColor = this.type.color;
            ctx.shadowBlur = 12;

            ctx.fillStyle = this.type.color;
            ctx.beginPath();
            ctx.arc(sx, sy, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#0b0f1a';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.type.icon, sx, sy + 0.5);
            ctx.restore();
        }
    }

    function spawnItemsForRoom(room, floor) {
        const items = [];
        const ts = Dungeon.TILE_SIZE;

        if (room.type === Dungeon.ROOM_TYPE.TREASURE) {
            const cx = room.centerX * ts + ts / 2;
            const cy = room.centerY * ts + ts / 2;

            for (let i = 0; i < Utils.randInt(3, 6); i++) {
                const ox = Utils.randFloat(-60, 60);
                const oy = Utils.randFloat(-60, 60);
                const type = Math.random() < 0.3 ? ITEM_TYPES.GOLD_LARGE : ITEM_TYPES.GOLD_SMALL;
                items.push(new Item(cx + ox, cy + oy, type));
            }

            const powerUps = [ITEM_TYPES.HEALTH_POTION, ITEM_TYPES.SPEED_BOOST, ITEM_TYPES.DAMAGE_BOOST, ITEM_TYPES.SHIELD];
            items.push(new Item(cx, cy - 30, Utils.pick(powerUps)));
        }

        if (room.type === Dungeon.ROOM_TYPE.REST) {
            const cx = room.centerX * ts + ts / 2;
            const cy = room.centerY * ts + ts / 2;
            items.push(new Item(cx, cy, ITEM_TYPES.HEALTH_POTION));
            if (Math.random() < 0.4) {
                items.push(new Item(cx + 30, cy, ITEM_TYPES.HEALTH_POTION));
            }
        }

        return items;
    }

    function spawnDrops(x, y, floor, luck = 1, source = 'enemy') {
        const drops = [];
        const luckMult = Math.max(0.6, luck || 1);

        if (source === 'boss') {
            drops.push(new Item(x + Utils.randFloat(-18, 18), y + Utils.randFloat(-18, 18), ITEM_TYPES.GOLD_LARGE));
            drops.push(new Item(x + Utils.randFloat(-18, 18), y + Utils.randFloat(-18, 18), ITEM_TYPES.GOLD_LARGE));
            drops.push(new Item(x + Utils.randFloat(-14, 14), y + Utils.randFloat(-14, 14), ITEM_TYPES.TREASURE_RELIC));
        }

        const goldChance = Math.min(0.92, (0.52 + floor * 0.012) * luckMult);
        if (Math.random() < goldChance) {
            const largeChance = Math.min(0.6, 0.16 + floor * 0.015 + (luckMult - 1) * 0.25);
            const goldType = Math.random() < largeChance ? ITEM_TYPES.GOLD_LARGE : ITEM_TYPES.GOLD_SMALL;
            drops.push(new Item(x + Utils.randFloat(-15, 15), y + Utils.randFloat(-15, 15), goldType));
        }

        const powerChance = Math.min(0.5, (0.08 + floor * 0.01) * luckMult);
        if (Math.random() < powerChance) {
            const rare = [ITEM_TYPES.HEALTH_POTION, ITEM_TYPES.SPEED_BOOST, ITEM_TYPES.DAMAGE_BOOST, ITEM_TYPES.SHIELD];
            drops.push(new Item(x + Utils.randFloat(-12, 12), y + Utils.randFloat(-12, 12), Utils.pick(rare)));
        }

        const sustainChance = Math.min(0.28, Math.max(0, floor - 4) * 0.02 * luckMult);
        if (Math.random() < sustainChance) {
            drops.push(new Item(x + Utils.randFloat(-10, 10), y + Utils.randFloat(-10, 10), ITEM_TYPES.HEALTH_POTION));
        }

        const sourceTreasureBonus =
            source === 'boss' ? 1 :
            source === 'elite' ? 0.35 : 0;
        const treasureChance = Math.min(0.9, (0.03 + floor * 0.006 + sourceTreasureBonus) * luckMult);
        if (Math.random() < treasureChance) {
            const treasureType = Math.random() < 0.6 ? ITEM_TYPES.TREASURE_RELIC : ITEM_TYPES.TREASURE_MAP;
            drops.push(new Item(x + Utils.randFloat(-12, 12), y + Utils.randFloat(-12, 12), treasureType));
        }

        return drops;
    }

    function spawnChestLoot(x, y, floor = 1) {
        const drops = [];
        const treasureType = Math.random() < 0.7 ? ITEM_TYPES.TREASURE_RELIC : ITEM_TYPES.TREASURE_MAP;
        drops.push(new Item(x + Utils.randFloat(-8, 8), y + Utils.randFloat(-8, 8), treasureType));

        const goldCount = Utils.randInt(2, 4) + Math.floor(floor / 4);
        for (let i = 0; i < goldCount; i++) {
            const gType = Math.random() < 0.35 ? ITEM_TYPES.GOLD_LARGE : ITEM_TYPES.GOLD_SMALL;
            drops.push(new Item(x + Utils.randFloat(-22, 22), y + Utils.randFloat(-22, 22), gType));
        }

        if (Math.random() < 0.5) {
            const support = [ITEM_TYPES.HEALTH_POTION, ITEM_TYPES.SPEED_BOOST, ITEM_TYPES.DAMAGE_BOOST, ITEM_TYPES.SHIELD];
            drops.push(new Item(x + Utils.randFloat(-12, 12), y + Utils.randFloat(-12, 12), Utils.pick(support)));
        }
        return drops;
    }

    return {
        ITEM_TYPES,
        Item,
        spawnItemsForRoom,
        spawnDrops,
        spawnChestLoot,
    };
})();
