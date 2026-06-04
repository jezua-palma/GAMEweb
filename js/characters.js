/* ============================================
   CHARACTERS — Character definitions, XP & Level-up system
   ============================================ */

const Characters = (() => {

    // ===== CHARACTER DEFINITIONS =====
    const DEFS = {
        warrior: {
            id: 'warrior',
            name: 'Warrior',
            title: 'Berserker Fury',
            icon: '⚔️',
            color: '#ef4444',
            colorDark: '#991b1b',
            colorGlow: 'rgba(239,68,68,0.5)',
            description: 'Devastating melee fighter. Highest damage output but fragile. Active Cleave skill triggers on dash.',
            stats: { maxHp: 4, speed: 145, damage: 3.0, dashCooldown: 1.2, armor: 0 },
            attackMode: 'melee',
            skill: { cooldown: 5.0 },
            weaponTiers: [
                { name: 'Iron Sword',    icon: '🗡️', damage: 3.0, range: 52, arc: 0.7 },
                { name: 'Battle Axe',   icon: '🪓', damage: 4.2, range: 60, arc: 0.9 },
                { name: 'Greatsword',   icon: '⚔️', damage: 5.5, range: 70, arc: 1.1 },
            ],
            passives: ['Heavy Strike (melee hits stun for 0.2s)', 'Blood Frenzy (+15% damage when below half HP)'],
        },
        rogue: {
            id: 'rogue',
            name: 'Rogue',
            title: 'Shadow Step',
            icon: '🗡️',
            color: '#a855f7',
            colorDark: '#6b21a8',
            colorGlow: 'rgba(168,85,247,0.5)',
            description: 'Swift as shadow with marksman precision. Fires quick ranged shots.',
            stats: { maxHp: 4, speed: 190, damage: 1.5, dashCooldown: 0.7, armor: 0 },
            attackMode: 'ranged',
            projectile: { speed: 520, life: 0.95, radius: 5, color: '#c084fc', canPierce: false },
            skill: { cooldown: 4.8 },
            weaponTiers: [
                { name: 'Dagger',       icon: '🔪', damage: 1.5, range: 42, arc: 0.5 },
                { name: 'Twin Blades',  icon: '⚔️', damage: 2.2, range: 46, arc: 0.7 },
                { name: 'Shadow Edge',  icon: '🗡️', damage: 3.2, range: 52, arc: 0.9 },
            ],
            passives: ['Lethal Speed (dash recharges faster)', 'Critical Strike (10% chance ×2 damage)'],
        },
        mage: {
            id: 'mage',
            name: 'Mage',
            title: 'Arcane Mind',
            icon: '🔮',
            color: '#06b6d4',
            colorDark: '#0e7490',
            colorGlow: 'rgba(6,182,212,0.5)',
            description: 'Channels arcane energy into ranged spell shots and burst skills.',
            stats: { maxHp: 3, speed: 135, damage: 3.0, dashCooldown: 1.8, armor: 0 },
            attackMode: 'ranged',
            projectile: { speed: 460, life: 1.25, radius: 6, color: '#67e8f9', canPierce: true },
            skill: { cooldown: 5.2 },
            weaponTiers: [
                { name: 'Magic Staff',  icon: '🪄', damage: 3.0, range: 60, arc: 0.5 },
                { name: 'Arcane Wand',  icon: '✨', damage: 4.2, range: 70, arc: 0.7 },
                { name: 'Void Scepter', icon: '🔮', damage: 6.0, range: 80, arc: 0.9 },
            ],
            passives: ['Spellweave (attacks leave lingering magic burst)', 'XP Scholar (+30% XP gain)'],
        },
        paladin: {
            id: 'paladin',
            name: 'Paladin',
            title: 'Divine Guard',
            icon: '🛡️',
            color: '#f59e0b',
            colorDark: '#b45309',
            colorGlow: 'rgba(245,158,11,0.5)',
            description: 'Unbreakable holy tank. Highest HP and armor with HP regeneration. Active Holy Bastion skill triggers on dash.',
            stats: { maxHp: 7, speed: 105, damage: 1.5, dashCooldown: 1.8, armor: 3 },
            attackMode: 'melee',
            skill: { cooldown: 7.5 },
            weaponTiers: [
                { name: 'Holy Mace',     icon: '🔨', damage: 1.5, range: 48, arc: 0.6 },
                { name: 'Sacred Hammer', icon: '⚒️', damage: 2.2, range: 54, arc: 0.8 },
                { name: 'Divine Relic',  icon: '✝️', damage: 3.0, range: 62, arc: 1.0 },
            ],
            passives: ['Holy Aura (regenerates 1 HP every 12s)', 'Blessed Armor (+3 armor base)'],
        },
    };

    // ===== XP TABLE =====
    function xpForLevel(level) {
        return Math.floor(60 * Math.pow(1.45, level - 1));
    }

    // ===== UPGRADE POOL =====
    const UPGRADES = [
        {
            id: 'max_hp',
            name: '+1 Max Health',
            desc: 'Gain an extra heart. Also heals 1 HP.',
            icon: '❤️',
            category: 'survival',
            apply(p) { p.maxHp++; p.hp = Math.min(p.hp + 1, p.maxHp); },
        },
        {
            id: 'speed',
            name: 'Swift Feet',
            desc: 'Movement speed +25.',
            icon: '👟',
            category: 'mobility',
            apply(p) { p.speed += 25; },
        },
        {
            id: 'damage',
            name: 'Sharp Edge',
            desc: 'Attack damage +0.5.',
            icon: '⚔️',
            category: 'offense',
            apply(p) { p.attackDamage += 0.5; },
        },
        {
            id: 'dash_cd',
            name: 'Quick Dash',
            desc: 'Dash cooldown reduced by 0.25s.',
            icon: '💨',
            category: 'mobility',
            apply(p) { p.dashCooldownMax = Math.max(0.3, p.dashCooldownMax - 0.25); },
        },
        {
            id: 'weapon_up',
            name: 'Weapon Upgrade',
            desc: 'Advance your weapon to the next tier.',
            icon: '🔱',
            category: 'weapon',
            apply(p) {
                if (p.weaponTier < 2) {
                    p.weaponTier++;
                    const tier = p.charDef.weaponTiers[p.weaponTier];
                    p.attackDamage = tier.damage;
                    p.attackRange  = tier.range;
                    p.attackArc    = tier.arc * Math.PI;
                }
            },
            canApply(p) { return p.weaponTier < 2; },
        },
        {
            id: 'armor',
            name: 'Iron Skin',
            desc: '+1 armor. Reduces all damage taken.',
            icon: '🛡️',
            category: 'survival',
            apply(p) { p.armor = (p.armor || 0) + 1; },
        },
        {
            id: 'regen',
            name: 'Regeneration',
            desc: 'Slowly regain 1 HP every 12 seconds.',
            icon: '🌿',
            category: 'survival',
            apply(p) { p.regenRate = (p.regenRate || 0) + (1 / 12); },
        },
        {
            id: 'xp_bonus',
            name: 'Scholar',
            desc: '+25% XP gain from kills.',
            icon: '📚',
            category: 'utility',
            apply(p) { p.xpMultiplier = (p.xpMultiplier || 1) + 0.25; },
        },
        {
            id: 'gold_bonus',
            name: 'Treasure Sense',
            desc: '+50% gold pickup value.',
            icon: '💰',
            category: 'utility',
            apply(p) { p.goldMultiplier = (p.goldMultiplier || 1) + 0.5; },
        },
        {
            id: 'attack_speed',
            name: 'Battle Fury',
            desc: 'Attack 20% faster.',
            icon: '🌀',
            category: 'offense',
            apply(p) { p.attackCooldownMult = (p.attackCooldownMult || 1) * 0.8; },
        },
        {
            id: 'shield_charge',
            name: 'Magic Barrier',
            desc: 'Gain 2 shield charges (block hits).',
            icon: '🔵',
            category: 'survival',
            apply(p) { p.shieldHits = (p.shieldHits || 0) + 2; },
        },
        {
            id: 'range',
            name: 'Long Reach',
            desc: 'Attack range +15.',
            icon: '📏',
            category: 'offense',
            apply(p) { p.attackRange += 15; },
        },
    ];

    function getRandomUpgrades(player, count = 3) {
        const available = UPGRADES.filter(u => !u.canApply || u.canApply(player));
        const shuffled  = [...available].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    return { DEFS, xpForLevel, UPGRADES, getRandomUpgrades };
})();
