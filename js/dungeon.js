/* ============================================
   DUNGEON â€” Procedural dungeon with themed levels
   ============================================ */

const Dungeon = (() => {
    const TILE_SIZE = 40;
    const ROOM_MIN = 8;
    const ROOM_MAX = 15;

    // Tile types
    const TILE = {
        VOID: 0,
        FLOOR: 1,
        WALL: 2,
        DOOR: 3,
        STAIRS: 4,
        CHEST: 5,
        PILLAR: 6,
        LAVA: 7,
        WATER: 8,
        CRACKED: 9,
    };

    // Room types
    const ROOM_TYPE = {
        COMBAT: 'combat',
        TREASURE: 'treasure',
        REST: 'rest',
        BOSS: 'boss',
        START: 'start',
        ELITE: 'elite',
    };

    const USE_ICON_DECORATIONS = false;
    const KENNEY_MANIFEST_PATH = 'assets/kenney/pack_manifest.json';
    const KENNEY_EXAMPLE_MANIFEST_PATH = 'assets/kenney/pack_manifest.example.json';

    const SETPIECE_LIBRARY = {
        1: [
            { type: 'crate', weight: 1.5 },
            { type: 'bones', weight: 1.1 },
            { type: 'urn', weight: 1.0 },
            { type: 'rubble', weight: 1.4 },
            { type: 'pillarBroken', weight: 0.9 },
        ],
        2: [
            { type: 'barrel', weight: 1.3 },
            { type: 'mushroomPatch', weight: 1.2 },
            { type: 'slimePod', weight: 1.0 },
            { type: 'rubble', weight: 1.1 },
            { type: 'pipeScrap', weight: 0.9 },
        ],
        3: [
            { type: 'brazier', weight: 1.2 },
            { type: 'charPile', weight: 1.0 },
            { type: 'spikeBarricade', weight: 0.85 },
            { type: 'pillarBroken', weight: 1.0 },
            { type: 'rubble', weight: 1.2 },
        ],
        4: [
            { type: 'crystalCluster', weight: 1.4 },
            { type: 'arcNode', weight: 1.0 },
            { type: 'voidObelisk', weight: 0.9 },
            { type: 'runeTotem', weight: 1.0 },
            { type: 'rubble', weight: 0.6 },
        ],
        5: [
            { type: 'altar', weight: 1.0 },
            { type: 'brazier', weight: 1.1 },
            { type: 'bloodSpikes', weight: 1.1 },
            { type: 'cursedStatue', weight: 0.9 },
            { type: 'rubble', weight: 0.7 },
        ],
    };

    const SETPIECE_SPRITE_KEY = {
        crate: 'setpiece_crate',
        bones: 'setpiece_bones',
        urn: 'setpiece_urn',
        rubble: 'setpiece_rubble',
        pillarBroken: 'setpiece_pillar_broken',
        barrel: 'setpiece_barrel',
        mushroomPatch: 'setpiece_mushroom_patch',
        slimePod: 'setpiece_slime_pod',
        pipeScrap: 'setpiece_pipe_scrap',
        brazier: 'setpiece_brazier',
        charPile: 'setpiece_char_pile',
        spikeBarricade: 'setpiece_spike_barricade',
        crystalCluster: 'setpiece_crystal_cluster',
        arcNode: 'setpiece_arc_node',
        voidObelisk: 'setpiece_void_obelisk',
        runeTotem: 'setpiece_rune_totem',
        altar: 'setpiece_altar',
        bloodSpikes: 'setpiece_blood_spikes',
        cursedStatue: 'setpiece_cursed_statue',
        floor: 'tile_floor',
        wall: 'tile_wall',
        stairs: 'tile_stairs',
        chest: 'tile_chest',
    };

    const AUTOTILE_BITS = {
        N: 1,
        E: 2,
        S: 4,
        W: 8,
    };

    const BattlefieldSpriteStore = (() => {
        let initPromise = null;
        let initialized = false;
        const sprites = new Map();

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

        async function init() {
            if (initialized) return;
            if (initPromise) return initPromise;
            initPromise = (async () => {
                const manifest = await fetchManifest(KENNEY_MANIFEST_PATH)
                    || await fetchManifest(KENNEY_EXAMPLE_MANIFEST_PATH);
                const spriteEntries = manifest && manifest.sprites && typeof manifest.sprites === 'object'
                    ? Object.entries(manifest.sprites)
                    : [];
                for (const [key, path] of spriteEntries) {
                    if (!key || typeof path !== 'string' || !path.trim()) continue;
                    const img = await loadImage(path.trim());
                    if (img) sprites.set(key, img);
                }
                initialized = true;
            })();
            return initPromise;
        }

        function get(key) {
            return sprites.get(key) || null;
        }

        function getByLevel(baseKey, levelNum) {
            const lvl = Math.max(1, Math.min(5, levelNum || 1));
            return get(`${baseKey}_${lvl}`) || get(baseKey);
        }

        return {
            init,
            get,
            getByLevel,
            has: (key) => sprites.has(key),
        };
    })();

    // ===== PER-LEVEL DECORATION SETS =====
    const LEVEL_DECORATIONS = {
        1: { // Stone Crypts
            floor: [
                { icon: 'ðŸ’€', chance: 0.018, scale: 0.9, label: 'skull' },
                { icon: 'ðŸ¦´', chance: 0.022, scale: 0.8, label: 'bone' },
                { icon: 'ðŸ•¯ï¸', chance: 0.014, scale: 0.85, label: 'candle', animated: true },
                { icon: 'ðŸª¨', chance: 0.020, scale: 0.75, label: 'rock' },
            ],
            wall: [
                { icon: 'ðŸ•¸ï¸', chance: 0.06, scale: 1.1, label: 'cobweb', corner: true },
            ],
            shapes: [
                // blood stains drawn as canvas arcs
                { type: 'stain', color: 'rgba(80,10,10,0.35)', chance: 0.012 },
                // dust cloud wisps
                { type: 'wisp', color: 'rgba(100,80,130,0.08)', chance: 0.018 },
            ],
        },
        2: { // Sewer Depths
            floor: [
                { icon: 'ðŸ„', chance: 0.025, scale: 0.9, label: 'mushroom' },
                { icon: 'ðŸ€', chance: 0.010, scale: 0.7, label: 'rat' },
                { icon: 'ðŸª²', chance: 0.015, scale: 0.65, label: 'bug' },
                { icon: 'ðŸ«§', chance: 0.018, scale: 0.8, label: 'bubble', animated: true },
            ],
            wall: [
                { icon: 'ðŸŸ¢', chance: 0.05, scale: 0.6, label: 'algae' },
            ],
            shapes: [
                { type: 'puddle', color: 'rgba(20,60,30,0.4)', chance: 0.016 },
                { type: 'slime', color: 'rgba(50,140,30,0.25)', chance: 0.020 },
            ],
        },
        3: { // Burning Ruins
            floor: [
                { icon: 'ðŸŒ²', chance: 0.012, scale: 1.1, label: 'charredTree' },
                { icon: 'ðŸªµ', chance: 0.022, scale: 0.85, label: 'log' },
                { icon: 'â›ï¸', chance: 0.010, scale: 0.8, label: 'pickaxe' },
                { icon: 'ðŸŒ‘', chance: 0.018, scale: 0.75, label: 'ash', animated: false },
            ],
            wall: [
                { icon: 'ðŸ”¥', chance: 0.055, scale: 0.85, label: 'wallflame', animated: true },
            ],
            shapes: [
                { type: 'ash', color: 'rgba(90,60,20,0.3)', chance: 0.022 },
                { type: 'ember', color: 'rgba(255,100,0,0.18)', chance: 0.016 },
            ],
        },
        4: { // Void Abyss
            floor: [
                { icon: 'ðŸ’Ž', chance: 0.018, scale: 0.9, label: 'crystal' },
                { icon: 'ðŸ”®', chance: 0.012, scale: 0.85, label: 'orb', animated: true },
                { icon: 'â­', chance: 0.016, scale: 0.7, label: 'star', animated: true },
                { icon: 'ðŸŒ€', chance: 0.010, scale: 0.8, label: 'rift', animated: true },
            ],
            wall: [
                { icon: 'âœ¨', chance: 0.060, scale: 0.75, label: 'sparkle', animated: true },
            ],
            shapes: [
                { type: 'voidpool', color: 'rgba(40,10,80,0.45)', chance: 0.014 },
                { type: 'starfield', color: 'rgba(150,100,255,0.12)', chance: 0.025 },
            ],
        },
        5: { // Dark Sanctum
            floor: [
                { icon: 'ðŸŒ¹', chance: 0.015, scale: 0.9, label: 'rose' },
                { icon: 'â˜ ï¸', chance: 0.014, scale: 0.9, label: 'relic' },
                { icon: 'ðŸ•¯ï¸', chance: 0.018, scale: 0.85, label: 'darkcandle', animated: true },
                { icon: 'ðŸ—¡ï¸', chance: 0.010, scale: 0.8, label: 'blade' },
            ],
            wall: [
                { icon: 'ðŸ©¸', chance: 0.055, scale: 0.9, label: 'blood' },
            ],
            shapes: [
                { type: 'ritual', color: 'rgba(150,0,40,0.2)', chance: 0.008 },
                { type: 'blood', color: 'rgba(100,0,0,0.4)', chance: 0.018 },
            ],
        },
    };

    // ===== LEVEL THEMES =====
    // 5 stages per level â†’ stage (1â€“5)=Lv1, (6â€“10)=Lv2, (11â€“15)=Lv3, (16â€“20)=Lv4, (21+)=Lv5
    const THEMES = {
        1: {
            name: 'Stone Crypts',
            floorColor: '#1a1520',
            floorAccent: '#241b2e',
            floorHighlight: 'rgba(124,58,237,0.06)',
            wallColor: '#2d2540',
            wallTop: '#3d3358',
            wallShadow: 'rgba(0,0,0,0.5)',
            voidColor: '#050508',
            stairsColor: '#10b981',
            stairsBg: 'rgba(16,185,129,0.2)',
            pillarColor: '#352b4a',
            glowColor: 'rgba(124,58,237,0.12)',
            ambientColor: 'rgba(80,30,120,0.04)',
            torchColor: '#f59e0b',
            hasLava: false,
            hasWater: false,
            hasCracks: true,
            hasPillars: true,
            hasMoss: false,
            bgColor: '#050508',
        },
        2: {
            name: 'Sewer Depths',
            floorColor: '#0e1f1a',
            floorAccent: '#142820',
            floorHighlight: 'rgba(16,185,129,0.06)',
            wallColor: '#1a3028',
            wallTop: '#254038',
            wallShadow: 'rgba(0,0,0,0.6)',
            voidColor: '#030d08',
            stairsColor: '#06b6d4',
            stairsBg: 'rgba(6,182,212,0.2)',
            pillarColor: '#1c3a2c',
            glowColor: 'rgba(16,185,129,0.1)',
            ambientColor: 'rgba(16,80,50,0.05)',
            torchColor: '#22c55e',
            hasLava: false,
            hasWater: true,
            hasCracks: true,
            hasPillars: false,
            hasMoss: true,
            bgColor: '#030d08',
        },
        3: {
            name: 'Burning Ruins',
            floorColor: '#1f1208',
            floorAccent: '#2a1a0c',
            floorHighlight: 'rgba(239,68,68,0.06)',
            wallColor: '#3a2010',
            wallTop: '#4a3018',
            wallShadow: 'rgba(0,0,0,0.5)',
            voidColor: '#080300',
            stairsColor: '#f97316',
            stairsBg: 'rgba(249,115,22,0.2)',
            pillarColor: '#4a2c14',
            glowColor: 'rgba(249,115,22,0.1)',
            ambientColor: 'rgba(120,50,10,0.06)',
            torchColor: '#ef4444',
            hasLava: true,
            hasWater: false,
            hasCracks: true,
            hasPillars: true,
            hasMoss: false,
            bgColor: '#080300',
        },
        4: {
            name: 'Void Abyss',
            floorColor: '#0a0814',
            floorAccent: '#12102a',
            floorHighlight: 'rgba(99,102,241,0.08)',
            wallColor: '#18163a',
            wallTop: '#221f4a',
            wallShadow: 'rgba(0,0,0,0.7)',
            voidColor: '#02020a',
            stairsColor: '#818cf8',
            stairsBg: 'rgba(129,140,248,0.2)',
            pillarColor: '#1e1c42',
            glowColor: 'rgba(99,102,241,0.15)',
            ambientColor: 'rgba(60,40,120,0.06)',
            torchColor: '#818cf8',
            hasLava: false,
            hasWater: false,
            hasCracks: false,
            hasPillars: true,
            hasMoss: false,
            bgColor: '#02020a',
        },
        5: {
            name: 'Dark Sanctum',
            floorColor: '#12020a',
            floorAccent: '#1e0812',
            floorHighlight: 'rgba(244,63,94,0.08)',
            wallColor: '#2a0a18',
            wallTop: '#3a1025',
            wallShadow: 'rgba(0,0,0,0.7)',
            voidColor: '#060002',
            stairsColor: '#f43f5e',
            stairsBg: 'rgba(244,63,94,0.2)',
            pillarColor: '#300a1c',
            glowColor: 'rgba(244,63,94,0.15)',
            ambientColor: 'rgba(120,10,50,0.07)',
            torchColor: '#cd2d5e',
            hasLava: true,
            hasWater: false,
            hasCracks: true,
            hasPillars: true,
            hasMoss: false,
            bgColor: '#060002',
        },
    };

    function getTheme(levelNum) {
        const t = Math.min(levelNum, 5);
        return THEMES[t] || THEMES[5];
    }

    const OVERWORLD_BASE_THEME = {
        isOverworld: true,
        hasLava: false,
        hasWater: false,
        hasCracks: false,
        hasPillars: false,
        floorColor: '#d9bd68',
        floorAccent: '#caa65a',
        floorHighlight: 'rgba(255,255,255,0.08)',
        wallColor: '#477d2d',
        wallTop: '#6fbf3a',
        wallShadow: 'rgba(37, 69, 27, 0.48)',
        voidColor: '#5e9b2f',
        stairsColor: '#f7d66f',
        stairsBg: 'rgba(247, 214, 111, 0.24)',
        pillarColor: '#5c7d31',
        glowColor: 'rgba(255, 233, 128, 0.12)',
        ambientColor: 'rgba(255,255,255,0.04)',
        torchColor: '#f8d76a',
        bgColor: '#67a93a',
        grassColor: '#6eaa35',
        grassAlt: '#79b83e',
        grassLight: '#8fd04a',
        grassDark: '#3f792a',
        hedgeColor: '#4a962f',
        hedgeDark: '#26641f',
        dirtColor: '#d8bb6b',
        dirtLight: '#ead98d',
        dirtDark: '#a97f42',
        waterColor: '#35afd1',
        waterDeep: '#1f7fad',
        waterLight: '#8de8f2',
        bankColor: '#7e6338',
        woodColor: '#8a5a31',
        woodLight: '#bb8148',
        trunkColor: '#72512d',
        rockColor: '#8b866e',
        flowerColor: '#f56d76',
    };

    Object.assign(THEMES[1], OVERWORLD_BASE_THEME, {
        name: 'Emerald Wilds',
        bgColor: '#70aa36',
        grassColor: '#6eaa35',
        grassAlt: '#7fbd3f',
        grassLight: '#96d653',
        grassDark: '#3d7828',
        hedgeColor: '#4d9f32',
        hedgeDark: '#26651f',
        dirtColor: '#dcc271',
        dirtLight: '#efdd93',
        dirtDark: '#ad8445',
        waterColor: '#37bad2',
        waterDeep: '#2088af',
        waterLight: '#9beaf2',
        flowerColor: '#f86f7f',
    });

    Object.assign(THEMES[2], OVERWORLD_BASE_THEME, {
        name: 'Riverfen Crossing',
        bgColor: '#5f9f3b',
        grassColor: '#579a3a',
        grassAlt: '#68ad43',
        grassLight: '#82c860',
        grassDark: '#2f6d35',
        hedgeColor: '#3f863a',
        hedgeDark: '#205c2e',
        dirtColor: '#caae68',
        dirtLight: '#dec985',
        dirtDark: '#8c7443',
        waterColor: '#2fa9c8',
        waterDeep: '#1b739f',
        waterLight: '#91e4ee',
        bankColor: '#66723a',
        flowerColor: '#d9f06a',
    });

    Object.assign(THEMES[3], OVERWORLD_BASE_THEME, {
        name: 'Emberwood Trail',
        bgColor: '#769a35',
        grassColor: '#78993a',
        grassAlt: '#89a946',
        grassLight: '#a8c957',
        grassDark: '#566a28',
        hedgeColor: '#6d8f31',
        hedgeDark: '#3f5522',
        dirtColor: '#d6ae63',
        dirtLight: '#edcd86',
        dirtDark: '#9b653a',
        waterColor: '#2f9fc3',
        waterDeep: '#236e9a',
        waterLight: '#8ed9ee',
        bankColor: '#7f5c35',
        flowerColor: '#ff9f4a',
    });

    Object.assign(THEMES[4], OVERWORLD_BASE_THEME, {
        name: 'Starfall Glade',
        bgColor: '#597f49',
        grassColor: '#5c8848',
        grassAlt: '#699a55',
        grassLight: '#83b06b',
        grassDark: '#355b3b',
        hedgeColor: '#477b45',
        hedgeDark: '#244c35',
        dirtColor: '#cab370',
        dirtLight: '#e7d38f',
        dirtDark: '#887049',
        waterColor: '#3899c9',
        waterDeep: '#28699e',
        waterLight: '#a3dff4',
        bankColor: '#5d6543',
        flowerColor: '#b7a6ff',
    });

    Object.assign(THEMES[5], OVERWORLD_BASE_THEME, {
        name: 'Nightbloom Grove',
        bgColor: '#425f35',
        grassColor: '#466d39',
        grassAlt: '#527c41',
        grassLight: '#6d9658',
        grassDark: '#253e2d',
        hedgeColor: '#385f36',
        hedgeDark: '#1a3328',
        dirtColor: '#b89e67',
        dirtLight: '#d6c181',
        dirtDark: '#745f43',
        waterColor: '#2f83b2',
        waterDeep: '#215a8b',
        waterLight: '#8fc9ef',
        bankColor: '#4f573c',
        flowerColor: '#ff75b7',
    });

    class Room {
        constructor(x, y, w, h, type) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.type = type;
            this.centerX = Math.floor(x + w / 2);
            this.centerY = Math.floor(y + h / 2);
            this.connected = [];
            this.cleared = type === ROOM_TYPE.START;
            this.enemies = [];
            this.items = [];
            this.discovered = type === ROOM_TYPE.START;
            // Decoration seeds (deterministic per room)
            this.seed = Math.random() * 1000 | 0;
        }

        contains(px, py) {
            return px >= this.x && px < this.x + this.w &&
                   py >= this.y && py < this.y + this.h;
        }
    }

    class DungeonLevel {
        constructor(stage, levelNum) {
            this.stage = stage;              // 1-5 within the level
            this.levelNum = levelNum;        // which level (1,2,3...)
            this.isBossStage = stage === 5;
            this.floor = (levelNum - 1) * 5 + stage; // absolute floor #
            this.theme = getTheme(levelNum);
            this.rooms = [];
            this.grid = [];
            this.decorTiles = [];  // extra visual data
            this.width = 0;
            this.height = 0;
            this.startRoom = null;
            this.stairsX = 0;
            this.stairsY = 0;
            this.lavaTiles = [];
            this.waterTiles = [];
            this.waterTileKeys = new Set();
            this.bridgeTiles = [];
            this.bridgeTileKeys = new Set();
            this.torchPositions = [];
            this.torchTimer = 0;
            this.decorations = [];   // { x, y, icon, scale, animated, label, animOffset }
            this.shapeDecorations = []; // { x, y, type, color, r, r2, angle }
            this.setPieces = [];     // thematic battlefield objects
            this.overworldProps = []; // outdoor trees, rocks, stumps, flowers
            this.overworldPropsSorted = [];
            this.overworldChunkSize = 8;
            this.overworldTerrainChunks = new Map();
            this.generate();
            BattlefieldSpriteStore.init();
        }

        generate() {
            // More rooms on later stages
            const baseRooms = 5 + this.stage;
            const maxRooms = Math.min(baseRooms + Math.floor(this.levelNum / 2), 12);

            this.width = 90;
            this.height = 90;
            this.grid = Array.from({ length: this.height }, () =>
                Array(this.width).fill(TILE.VOID)
            );

            // Generate rooms
            let attempts = 0;
            while (this.rooms.length < maxRooms && attempts < 300) {
                const w = Utils.randInt(ROOM_MIN, ROOM_MAX);
                const h = Utils.randInt(ROOM_MIN, ROOM_MAX);
                const x = Utils.randInt(2, this.width - w - 2);
                const y = Utils.randInt(2, this.height - h - 2);

                let overlap = false;
                for (const room of this.rooms) {
                    if (x < room.x + room.w + 2 && x + w + 2 > room.x &&
                        y < room.y + room.h + 2 && y + h + 2 > room.y) {
                        overlap = true;
                        break;
                    }
                }

                if (!overlap) {
                    let type;
                    if (this.rooms.length === 0) {
                        type = ROOM_TYPE.START;
                    } else {
                        const roll = Math.random();
                        if (roll < 0.12 && this.rooms.length > 2) type = ROOM_TYPE.TREASURE;
                        else if (roll < 0.22 && this.rooms.length > 1) type = ROOM_TYPE.REST;
                        else if (roll < 0.28 && this.rooms.length > 3) type = ROOM_TYPE.ELITE;
                        else type = ROOM_TYPE.COMBAT;
                    }
                    this.rooms.push(new Room(x, y, w, h, type));
                }
                attempts++;
            }

            // Boss stage: last room becomes boss
            if (this.isBossStage && this.rooms.length > 1) {
                this.rooms[this.rooms.length - 1].type = ROOM_TYPE.BOSS;
                this.bossRoom = this.rooms[this.rooms.length - 1];
            } else {
                this.bossRoom = null;
            }

            // Carve rooms into grid
            for (const room of this.rooms) {
                for (let ry = room.y; ry < room.y + room.h; ry++) {
                    for (let rx = room.x; rx < room.x + room.w; rx++) {
                        const isEdge = ry === room.y || ry === room.y + room.h - 1 ||
                                       rx === room.x || rx === room.x + room.w - 1;
                        this.grid[ry][rx] = isEdge ? TILE.WALL : TILE.FLOOR;
                    }
                }
            }

            // Corridors
            for (let i = 1; i < this.rooms.length; i++) {
                this.connectRooms(this.rooms[i - 1], this.rooms[i]);
                this.rooms[i - 1].connected.push(i);
                this.rooms[i].connected.push(i - 1);
            }

            // Extra connections
            for (let i = 0; i < 3; i++) {
                const a = Utils.randInt(0, this.rooms.length - 1);
                const b = Utils.randInt(0, this.rooms.length - 1);
                if (a !== b && !this.rooms[a].connected.includes(b)) {
                    this.connectRooms(this.rooms[a], this.rooms[b]);
                    this.rooms[a].connected.push(b);
                    this.rooms[b].connected.push(a);
                }
            }

            // Stairs in last room
            this.startRoom = this.rooms[0];
            const lastRoom = this.rooms[this.rooms.length - 1];
            this.stairsX = lastRoom.centerX;
            this.stairsY = lastRoom.centerY;
            this.grid[this.stairsY][this.stairsX] = TILE.STAIRS;

            // Chests in treasure rooms
            for (const room of this.rooms) {
                if (room.type === ROOM_TYPE.TREASURE) {
                    const cx = room.centerX;
                    const cy = room.centerY;
                    if (this.grid[cy][cx] === TILE.FLOOR) {
                        this.grid[cy][cx] = TILE.CHEST;
                    }
                }
            }

            // Add pillars in large rooms
            if (this.theme.hasPillars) {
                this.addPillars();
            }

            // Place environment tiles (lava/water/cracks)
            this.addEnvironmentTiles();

            if (this.theme.isOverworld) {
                this.addOverworldFeatures();
            } else {
                // Place torches
                this.addTorches();

                // Place environment decorations
                this.addDecorations();
                this.addSetPieces();
            }
        }

        addPillars() {
            for (const room of this.rooms) {
                if (room.type === ROOM_TYPE.START || room.w < 10 || room.h < 10) continue;
                if (Math.random() < 0.5) continue;
                // Place 4 pillars symmetrically
                const px1 = room.x + 2;
                const py1 = room.y + 2;
                const px2 = room.x + room.w - 3;
                const py2 = room.y + room.h - 3;

                for (const [px, py] of [[px1,py1],[px2,py1],[px1,py2],[px2,py2]]) {
                    if (this.grid[py]?.[px] === TILE.FLOOR) {
                        this.grid[py][px] = TILE.WALL; // Pillars use wall tile but styled differently
                    }
                }
            }
        }

        addEnvironmentTiles() {
            if (this.theme.isOverworld) return;

            // Mark some floor tiles as cracked, water, or lava based on theme
            for (const room of this.rooms) {
                if (room.type === ROOM_TYPE.START) continue;
                for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
                    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
                        if (this.grid[ry][rx] !== TILE.FLOOR) continue;
                        const roll = Math.random();
                        if (this.theme.hasLava && roll < 0.03 && this.isInteriorFloor(rx, ry)) {
                            this.lavaTiles.push({ x: rx, y: ry });
                        } else if (this.theme.hasWater && roll < 0.04 && this.isInteriorFloor(rx, ry)) {
                            this.addWaterTile(rx, ry);
                        } else if (this.theme.hasCracks && roll < 0.08) {
                            // store crack seed per tile (no separate tile type, drawn visually)
                        }
                    }
                }
            }
        }

        isInteriorFloor(x, y) {
            // Check that all neighbours are also floor (true interior)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const t = this.grid[y + dy]?.[x + dx];
                    if (t === TILE.WALL || t === TILE.VOID) return false;
                }
            }
            return true;
        }

        addDecorations() {
            const ts = TILE_SIZE;
            const themeDefs = LEVEL_DECORATIONS[Math.min(this.levelNum, 5)] || LEVEL_DECORATIONS[1];

            for (const room of this.rooms) {
                // Floor decorations
                for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
                    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
                        if (this.grid[ry][rx] !== TILE.FLOOR) continue;
                        const wx = rx * ts + ts / 2;
                        const wy = ry * ts + ts / 2;

                        // Icon decorations on floor (optional, disabled for grounded battlefield look)
                        if (USE_ICON_DECORATIONS) {
                            for (const def of (themeDefs.floor || [])) {
                                if (Math.random() < def.chance) {
                                    this.decorations.push({
                                        x: wx + Utils.randFloat(-8, 8),
                                        y: wy + Utils.randFloat(-8, 8),
                                        icon: def.icon,
                                        scale: def.scale * (0.85 + Math.random() * 0.3),
                                        animated: !!def.animated,
                                        animOffset: Math.random() * Math.PI * 2,
                                        layer: 'floor',
                                    });
                                    break; // one decoration per tile
                                }
                            }
                        }

                        // Shape decorations on floor
                        for (const def of (themeDefs.shapes || [])) {
                            if (Math.random() < def.chance) {
                                this.shapeDecorations.push({
                                    x: wx,
                                    y: wy,
                                    type: def.type,
                                    color: def.color,
                                    r: Utils.randFloat(8, 18),
                                    r2: Utils.randFloat(4, 10),
                                    angle: Math.random() * Math.PI * 2,
                                    seed: Math.random(),
                                });
                                break;
                            }
                        }

                        if (Math.random() < 0.03) {
                            this.shapeDecorations.push({
                                x: wx + Utils.randFloat(-6, 6),
                                y: wy + Utils.randFloat(-6, 6),
                                type: Math.random() < 0.6 ? 'debris' : 'battlemark',
                                color: 'rgba(110, 100, 90, 0.32)',
                                r: Utils.randFloat(6, 14),
                                r2: Utils.randFloat(3, 8),
                                angle: Math.random() * Math.PI * 2,
                                seed: Math.random(),
                            });
                        }
                    }
                }

                // Wall decorations (corner cobwebs, algae, blood drips, sparkles)
                for (let ry = room.y; ry < room.y + room.h; ry++) {
                    for (let rx = room.x; rx < room.x + room.w; rx++) {
                        if (this.grid[ry][rx] !== TILE.WALL) continue;
                        const wx = rx * ts + ts / 2;
                        const wy = ry * ts + ts / 2;

                        if (USE_ICON_DECORATIONS) {
                            for (const def of (themeDefs.wall || [])) {
                                if (Math.random() < def.chance) {
                                    this.decorations.push({
                                        x: wx + Utils.randFloat(-4, 4),
                                        y: wy + Utils.randFloat(-4, 4),
                                        icon: def.icon,
                                        scale: def.scale * (0.8 + Math.random() * 0.4),
                                        animated: !!def.animated,
                                        animOffset: Math.random() * Math.PI * 2,
                                        layer: 'wall',
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        pickWeightedSetPiece(pool) {
            if (!Array.isArray(pool) || !pool.length) return null;
            const total = pool.reduce((sum, item) => sum + Math.max(0.01, Number(item.weight) || 1), 0);
            let roll = Math.random() * total;
            for (const item of pool) {
                roll -= Math.max(0.01, Number(item.weight) || 1);
                if (roll <= 0) return item;
            }
            return pool[pool.length - 1];
        }

        isSetPieceTileFree(gx, gy, occupied) {
            if (!this.grid[gy] || this.grid[gy][gx] !== TILE.FLOOR) return false;
            if (gx === this.stairsX && gy === this.stairsY) return false;
            if (this.lavaTiles.find((t) => t.x === gx && t.y === gy)) return false;
            if (this.waterTiles.find((t) => t.x === gx && t.y === gy)) return false;
            if (occupied.has(`${gx},${gy}`)) return false;

            // Keep room centers readable for combat.
            const room = this.rooms.find((r) => r.contains(gx, gy));
            if (room) {
                const centerDist = Math.hypot(gx - room.centerX, gy - room.centerY);
                if (centerDist < 1.8) return false;
            }
            return true;
        }

        tileKey(gx, gy) {
            return `${gx},${gy}`;
        }

        addWaterTile(gx, gy) {
            if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return;
            const key = this.tileKey(gx, gy);
            if (this.waterTileKeys.has(key)) return;
            this.waterTileKeys.add(key);
            this.waterTiles.push({ x: gx, y: gy });
        }

        addBridgeTile(gx, gy) {
            if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return;
            const key = this.tileKey(gx, gy);
            if (this.bridgeTileKeys.has(key)) return;
            this.bridgeTileKeys.add(key);
            this.bridgeTiles.push({ x: gx, y: gy });
        }

        isWaterAt(gx, gy) {
            return this.waterTileKeys.has(this.tileKey(gx, gy));
        }

        isBridgeAt(gx, gy) {
            return this.bridgeTileKeys.has(this.tileKey(gx, gy));
        }

        isBaseWalkableTile(tile) {
            return tile === TILE.FLOOR || tile === TILE.DOOR || tile === TILE.STAIRS || tile === TILE.CHEST;
        }

        isProtectedOverworldPoint(gx, gy) {
            const start = this.startRoom;
            if (start && Math.hypot(gx - start.centerX, gy - start.centerY) < 4) return true;
            if (Math.hypot(gx - this.stairsX, gy - this.stairsY) < 4) return true;
            return false;
        }

        addOverworldFeatures() {
            this.waterTiles = [];
            this.waterTileKeys = new Set();
            this.bridgeTiles = [];
            this.bridgeTileKeys = new Set();
            this.overworldProps = [];
            this.overworldPropsSorted = [];
            this.overworldTerrainChunks.clear();

            this.addOverworldRiver();
            this.addOverworldPonds();
            this.addOverworldProps();
        }

        addOverworldRiver() {
            const vertical = Math.random() < 0.58;
            const axisLength = vertical ? this.height : this.width;
            const crossLimit = vertical ? this.width : this.height;
            const base = Utils.randInt(Math.floor(crossLimit * 0.24), Math.floor(crossLimit * 0.76));
            const phaseA = Math.random() * Math.PI * 2;
            const phaseB = Math.random() * Math.PI * 2;

            for (let i = 0; i < axisLength; i++) {
                const center = Math.round(
                    base +
                    Math.sin(i * 0.13 + phaseA) * 4.6 +
                    Math.sin(i * 0.045 + phaseB) * 8.2
                );
                const halfWidth = 2 + Math.floor((Math.sin(i * 0.21 + phaseB) + 1) * 0.8) + (i % 17 === 0 ? 1 : 0);

                for (let offset = -halfWidth; offset <= halfWidth; offset++) {
                    const bankNoise = Math.sin((i + offset * 7) * 0.31 + phaseA) > 0.68 ? 1 : 0;
                    const cross = center + offset + bankNoise;
                    const gx = vertical ? cross : i;
                    const gy = vertical ? i : cross;
                    if (gx < 1 || gx >= this.width - 1 || gy < 1 || gy >= this.height - 1) continue;
                    if (this.isProtectedOverworldPoint(gx, gy)) continue;

                    this.addWaterTile(gx, gy);
                    const tile = this.grid[gy]?.[gx];
                    if (this.isBaseWalkableTile(tile)) {
                        this.addBridgeTile(gx, gy);
                    }
                }
            }
        }

        addOverworldPonds() {
            const pondCount = Math.random() < 0.55 ? 1 : 2;
            for (let p = 0; p < pondCount; p++) {
                let cx = 0;
                let cy = 0;
                let placed = false;

                for (let attempt = 0; attempt < 30 && !placed; attempt++) {
                    cx = Utils.randInt(10, this.width - 10);
                    cy = Utils.randInt(10, this.height - 10);
                    if (this.isProtectedOverworldPoint(cx, cy)) continue;
                    const room = this.rooms.find((r) => r.contains(cx, cy));
                    if (room && Math.random() < 0.75) continue;
                    placed = true;
                }

                if (!placed) continue;

                const rx = Utils.randFloat(3.6, 6.8);
                const ry = Utils.randFloat(2.8, 5.4);
                for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
                    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
                        if (x < 1 || x >= this.width - 1 || y < 1 || y >= this.height - 1) continue;
                        if (this.isProtectedOverworldPoint(x, y)) continue;
                        const nx = (x - cx) / rx;
                        const ny = (y - cy) / ry;
                        const wobble = Math.sin(x * 1.7 + y * 0.9) * 0.08;
                        if ((nx * nx + ny * ny) > 1 + wobble) continue;
                        if (this.isBaseWalkableTile(this.grid[y]?.[x]) && Math.random() < 0.7) continue;
                        this.addWaterTile(x, y);
                    }
                }
            }
        }

        addOverworldProps() {
            const occupied = new Set([...this.waterTileKeys, ...this.bridgeTileKeys]);
            for (let y = 1; y < this.height - 1; y++) {
                for (let x = 1; x < this.width - 1; x++) {
                    const key = this.tileKey(x, y);
                    if (occupied.has(key) || this.isProtectedOverworldPoint(x, y)) continue;

                    const tile = this.grid[y][x];
                    const isWalkable = this.isBaseWalkableTile(tile);
                    const roll = Math.random();
                    let type = null;

                    if (isWalkable) {
                        if (roll < 0.012) type = 'flowers';
                        else if (roll < 0.022) type = 'grassTuft';
                        else if (roll < 0.027 && tile === TILE.FLOOR) type = 'pebbles';
                    } else if (tile === TILE.WALL) {
                        if (roll < 0.18) type = 'bush';
                        else if (roll < 0.24) type = 'rock';
                        else if (roll < 0.29) type = 'stump';
                    } else {
                        if (roll < 0.095) type = Math.random() < 0.68 ? 'treeRound' : 'pine';
                        else if (roll < 0.15) type = 'bush';
                        else if (roll < 0.18) type = 'rock';
                        else if (roll < 0.205) type = 'flowers';
                    }

                    if (!type) continue;
                    occupied.add(key);
                    this.overworldProps.push({
                        type,
                        gx: x,
                        gy: y,
                        x: x * TILE_SIZE + TILE_SIZE / 2 + Utils.randFloat(-5, 5),
                        y: y * TILE_SIZE + TILE_SIZE / 2 + Utils.randFloat(-5, 5),
                        scale: Utils.randFloat(0.82, 1.22),
                        seed: Math.random() * Math.PI * 2,
                    });
                }
            }
            this.overworldPropsSorted = [...this.overworldProps].sort((a, b) => a.y - b.y);
            this.overworldTerrainChunks.clear();
        }

        addSetPieces() {
            const ts = TILE_SIZE;
            const pool = SETPIECE_LIBRARY[Math.min(this.levelNum, 5)] || SETPIECE_LIBRARY[5];
            const occupied = new Set();
            this.setPieces = [];

            for (const room of this.rooms) {
                if (room.type === ROOM_TYPE.BOSS && Math.random() < 0.45) continue;
                if (room.type === ROOM_TYPE.START && Math.random() < 0.8) continue;
                if (room.w < 7 || room.h < 7) continue;

                const roomArea = room.w * room.h;
                const baseBudget =
                    room.type === ROOM_TYPE.ELITE ? 4 :
                    room.type === ROOM_TYPE.TREASURE ? 3 :
                    room.type === ROOM_TYPE.REST ? 2 : 3;
                const budget = Math.min(8, baseBudget + Math.floor(roomArea / 55) + Utils.randInt(0, 1));

                let placed = 0;
                let tries = 0;
                while (placed < budget && tries < budget * 18) {
                    tries += 1;
                    const picked = this.pickWeightedSetPiece(pool);
                    if (!picked || !picked.type) continue;

                    const gx = Utils.randInt(room.x + 1, room.x + room.w - 2);
                    const gy = Utils.randInt(room.y + 1, room.y + room.h - 2);
                    if (!this.isSetPieceTileFree(gx, gy, occupied)) continue;

                    occupied.add(`${gx},${gy}`);
                    this.setPieces.push({
                        type: picked.type,
                        gx,
                        gy,
                        x: gx * ts + ts / 2 + Utils.randFloat(-2.5, 2.5),
                        y: gy * ts + ts / 2 + Utils.randFloat(-2.5, 2.5),
                        scale: 0.88 + Math.random() * 0.3,
                        seed: Math.random() * Math.PI * 2,
                    });
                    placed += 1;
                }
            }
        }

        addTorches() {
            // Place torches on room walls
            for (const room of this.rooms) {
                if (!room.discovered && room.type !== ROOM_TYPE.START) continue;
                // Torches on mid-points of walls
                const positions = [
                    { x: room.x + Math.floor(room.w / 2), y: room.y },
                    { x: room.x + Math.floor(room.w / 2), y: room.y + room.h - 1 },
                    { x: room.x, y: room.y + Math.floor(room.h / 2) },
                    { x: room.x + room.w - 1, y: room.y + Math.floor(room.h / 2) },
                ];
                for (const pos of positions) {
                    if (this.grid[pos.y]?.[pos.x] === TILE.WALL) {
                        this.torchPositions.push({ ...pos, flickerOffset: Math.random() * Math.PI * 2 });
                    }
                }
            }
        }

        connectRooms(a, b) {
            const horizontal_first = Math.random() > 0.5;
            if (horizontal_first) {
                this.carveHCorridor(a.centerX, b.centerX, a.centerY);
                this.carveVCorridor(a.centerY, b.centerY, b.centerX);
            } else {
                this.carveVCorridor(a.centerY, b.centerY, a.centerX);
                this.carveHCorridor(a.centerX, b.centerX, b.centerY);
            }
        }

        carveHCorridor(x1, x2, y) {
            const start = Math.min(x1, x2);
            const end = Math.max(x1, x2);
            for (let x = start; x <= end; x++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy;
                    if (ny >= 0 && ny < this.height && x >= 0 && x < this.width) {
                        if (dy !== 0) {
                            if (this.grid[ny][x] === TILE.VOID) this.grid[ny][x] = TILE.WALL;
                        } else {
                            if (this.grid[ny][x] !== TILE.STAIRS && this.grid[ny][x] !== TILE.CHEST)
                                this.grid[ny][x] = TILE.FLOOR;
                        }
                    }
                }
            }
        }

        carveVCorridor(y1, y2, x) {
            const start = Math.min(y1, y2);
            const end = Math.max(y1, y2);
            for (let y = start; y <= end; y++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (y >= 0 && y < this.height && nx >= 0 && nx < this.width) {
                        if (dx !== 0) {
                            if (this.grid[y][nx] === TILE.VOID) this.grid[y][nx] = TILE.WALL;
                        } else {
                            if (this.grid[y][nx] !== TILE.STAIRS && this.grid[y][nx] !== TILE.CHEST)
                                this.grid[y][nx] = TILE.FLOOR;
                        }
                    }
                }
            }
        }

        isWalkable(gridX, gridY) {
            if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) return false;
            const tile = this.grid[gridY][gridX];
            // Lava is not walkable
            if (this.lavaTiles.find(t => t.x === gridX && t.y === gridY)) return false;
            if (this.isWaterAt(gridX, gridY) && !this.isBridgeAt(gridX, gridY)) return false;
            return this.isBaseWalkableTile(tile);
        }

        isChestAt(gridX, gridY) {
            if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) return false;
            return this.grid[gridY][gridX] === TILE.CHEST;
        }

        openChest(gridX, gridY) {
            if (!this.isChestAt(gridX, gridY)) return false;
            this.grid[gridY][gridX] = TILE.FLOOR;
            this.invalidateOverworldChunk(gridX, gridY);
            return true;
        }

        getRoomAt(worldX, worldY) {
            const gx = Math.floor(worldX / TILE_SIZE);
            const gy = Math.floor(worldY / TILE_SIZE);
            for (const room of this.rooms) {
                if (room.contains(gx, gy)) return room;
            }
            return null;
        }

        update(dt) {
            this.torchTimer += dt;
        }

        isFloorLinkTile(tile) {
            return tile === TILE.FLOOR || tile === TILE.STAIRS || tile === TILE.CHEST;
        }

        getNeighborMask(gx, gy, predicate) {
            let mask = 0;
            if (predicate(this.grid[gy - 1]?.[gx])) mask |= AUTOTILE_BITS.N;
            if (predicate(this.grid[gy]?.[gx + 1])) mask |= AUTOTILE_BITS.E;
            if (predicate(this.grid[gy + 1]?.[gx])) mask |= AUTOTILE_BITS.S;
            if (predicate(this.grid[gy]?.[gx - 1])) mask |= AUTOTILE_BITS.W;
            return mask;
        }

        getAutotileSprite(baseKey, mask) {
            const lvl = Math.max(1, Math.min(5, this.levelNum || 1));
            return BattlefieldSpriteStore.get(`${baseKey}_${lvl}_m${mask}`)
                || BattlefieldSpriteStore.get(`${baseKey}_m${mask}`)
                || BattlefieldSpriteStore.get(`${baseKey}_${lvl}_${mask}`)
                || BattlefieldSpriteStore.get(`${baseKey}_${mask}`)
                || BattlefieldSpriteStore.getByLevel(baseKey, lvl);
        }

        drawFloorAutotileBlend(ctx, sx, sy, ts, mask, th) {
            const edge = Math.max(2, Math.floor(ts * 0.12));
            const edgeShade = th.floorColor || '#0f172a';
            ctx.fillStyle = edgeShade;
            ctx.globalAlpha = 0.14;

            if (!(mask & AUTOTILE_BITS.N)) ctx.fillRect(sx, sy, ts, edge);
            if (!(mask & AUTOTILE_BITS.S)) ctx.fillRect(sx, sy + ts - edge, ts, edge);
            if (!(mask & AUTOTILE_BITS.W)) ctx.fillRect(sx, sy, edge, ts);
            if (!(mask & AUTOTILE_BITS.E)) ctx.fillRect(sx + ts - edge, sy, edge, ts);

            // Corner blend to avoid sharp boxy transitions.
            ctx.globalAlpha = 0.2;
            if (!(mask & AUTOTILE_BITS.N) && !(mask & AUTOTILE_BITS.W)) ctx.fillRect(sx, sy, edge + 1, edge + 1);
            if (!(mask & AUTOTILE_BITS.N) && !(mask & AUTOTILE_BITS.E)) ctx.fillRect(sx + ts - edge - 1, sy, edge + 1, edge + 1);
            if (!(mask & AUTOTILE_BITS.S) && !(mask & AUTOTILE_BITS.W)) ctx.fillRect(sx, sy + ts - edge - 1, edge + 1, edge + 1);
            if (!(mask & AUTOTILE_BITS.S) && !(mask & AUTOTILE_BITS.E)) ctx.fillRect(sx + ts - edge - 1, sy + ts - edge - 1, edge + 1, edge + 1);
            ctx.globalAlpha = 1;
        }

        drawWallAutotileBlend(ctx, sx, sy, ts, mask, th) {
            const topEdge = Math.max(2, Math.floor(ts * 0.11));
            const sideEdge = Math.max(2, Math.floor(ts * 0.08));

            if (!(mask & AUTOTILE_BITS.N)) {
                ctx.fillStyle = th.wallTop;
                ctx.globalAlpha = 0.72;
                ctx.fillRect(sx, sy, ts, topEdge + 1);
            }

            if (!(mask & AUTOTILE_BITS.S)) {
                ctx.fillStyle = th.wallShadow;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(sx, sy + ts - topEdge, ts, topEdge);
            }

            if (!(mask & AUTOTILE_BITS.W)) {
                ctx.fillStyle = 'rgba(255,255,255,0.07)';
                ctx.globalAlpha = 0.85;
                ctx.fillRect(sx, sy, sideEdge, ts);
            }

            if (!(mask & AUTOTILE_BITS.E)) {
                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.globalAlpha = 0.85;
                ctx.fillRect(sx + ts - sideEdge, sy, sideEdge, ts);
            }

            // Isolated wall chunks get extra depth so they read as pillars.
            if ((mask & (AUTOTILE_BITS.N | AUTOTILE_BITS.E | AUTOTILE_BITS.S | AUTOTILE_BITS.W)) === 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.globalAlpha = 0.9;
                ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
            }
            ctx.globalAlpha = 1;
        }

        tileRand(gx, gy, salt = 0) {
            let h = Math.imul(gx + 374761393, 668265263) ^
                Math.imul(gy + 1442695041, 2246822519) ^
                Math.imul((salt | 0) + 3266489917, 1274126177);
            h ^= h >>> 13;
            h = Math.imul(h, 1274126177);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        }

        sampleBattlefieldForce(wx, wy, forces, baseRadius = 76) {
            if (!Array.isArray(forces) || forces.length === 0) return { x: 0, y: 0, strength: 0 };
            let fx = 0;
            let fy = 0;
            let strength = 0;

            for (const force of forces) {
                if (!force) continue;
                const radius = Math.max(18, Number(force.radius) || baseRadius);
                const dx = wx - (Number(force.x) || 0);
                const dy = wy - (Number(force.y) || 0);
                const dist = Math.hypot(dx, dy);
                if (dist <= 0.01 || dist > radius) continue;

                const falloff = 1 - dist / radius;
                const vx = Number(force.vx) || 0;
                const vy = Number(force.vy) || 0;
                const speed = Math.hypot(vx, vy);
                const motion = Utils.clamp(speed / 430, 0.12, 1.8);
                const push = falloff * motion * (Number(force.strength) || 1);
                const nx = dx / dist;
                const ny = dy / dist;
                const mvx = speed > 1 ? vx / speed : 0;
                const mvy = speed > 1 ? vy / speed : 0;

                fx += (nx * 0.62 + mvx * 0.38) * push;
                fy += (ny * 0.62 + mvy * 0.38) * push;
                strength += push;
            }

            return {
                x: fx,
                y: fy,
                strength: Math.min(2.6, strength),
            };
        }

        getWindAt(gx, gy, scale = 1) {
            const gust = Math.sin(this.torchTimer * 1.45 + gx * 0.37 + gy * 0.21);
            const cross = Math.sin(this.torchTimer * 0.72 + gx * 0.12 - gy * 0.18);
            return (gust * 2.6 + cross * 1.4) * scale;
        }

        getRoomForTile(gx, gy) {
            return this.rooms.find((room) => room.contains(gx, gy)) || null;
        }

        isRoomInteriorTile(gx, gy) {
            const room = this.getRoomForTile(gx, gy);
            if (!room) return false;
            return gx > room.x && gx < room.x + room.w - 1 &&
                   gy > room.y && gy < room.y + room.h - 1;
        }

        drawOverworldGrassTile(ctx, sx, sy, ts, gx, gy, kind = 'wild') {
            const th = this.theme;
            const r = this.tileRand(gx, gy, 3);
            const base =
                kind === 'meadow'
                    ? (r < 0.52 ? th.grassAlt : th.grassColor)
                    : (r < 0.44 ? th.grassColor : th.bgColor);

            ctx.fillStyle = base;
            ctx.fillRect(sx, sy, ts, ts);

            ctx.fillStyle = r < 0.5 ? 'rgba(31, 82, 27, 0.12)' : 'rgba(154, 213, 77, 0.1)';
            ctx.fillRect(sx + 4, sy + 4, 12, 8);
            ctx.fillRect(sx + 22, sy + 24, 10, 6);

            const bladeCount = kind === 'meadow' ? 7 : 5;
            for (let i = 0; i < bladeCount; i++) {
                const br = this.tileRand(gx, gy, 20 + i);
                if (br < 0.24 && kind !== 'meadow') continue;
                const bx = Math.floor(sx + 4 + this.tileRand(gx, gy, 30 + i) * (ts - 9));
                const by = Math.floor(sy + 6 + this.tileRand(gx, gy, 40 + i) * (ts - 12));
                ctx.fillStyle = br < 0.5 ? th.grassLight : th.grassDark;
                ctx.fillRect(bx, by, 2, 7);
                if (br > 0.55) ctx.fillRect(bx + 2, by + 2, 2, 2);
            }

            if (this.tileRand(gx, gy, 61) < (kind === 'meadow' ? 0.1 : 0.045)) {
                ctx.fillStyle = th.flowerColor;
                const fx = Math.floor(sx + 8 + this.tileRand(gx, gy, 62) * (ts - 16));
                const fy = Math.floor(sy + 8 + this.tileRand(gx, gy, 63) * (ts - 16));
                ctx.fillRect(fx, fy, 2, 2);
                ctx.fillRect(fx + 4, fy + 2, 2, 2);
                ctx.fillStyle = '#f7f3a6';
                ctx.fillRect(fx + 2, fy + 1, 1, 1);
            }
        }

        drawOverworldFringe(ctx, sx, sy, ts, gx, gy, mask) {
            const th = this.theme;
            ctx.save();
            ctx.fillStyle = th.grassDark;
            ctx.globalAlpha = 0.85;

            const jaggedEdge = (side) => {
                for (let i = 0; i < 8; i++) {
                    const jitter = Math.floor(this.tileRand(gx, gy, 90 + side.charCodeAt(0) + i) * 7);
                    if (side === 'N') ctx.fillRect(sx + i * 5, sy + jitter, 6, 3);
                    if (side === 'S') ctx.fillRect(sx + i * 5, sy + ts - 3 - jitter, 6, 3);
                    if (side === 'W') ctx.fillRect(sx + jitter, sy + i * 5, 3, 6);
                    if (side === 'E') ctx.fillRect(sx + ts - 3 - jitter, sy + i * 5, 3, 6);
                }
            };

            if (!(mask & AUTOTILE_BITS.N)) jaggedEdge('N');
            if (!(mask & AUTOTILE_BITS.S)) jaggedEdge('S');
            if (!(mask & AUTOTILE_BITS.W)) jaggedEdge('W');
            if (!(mask & AUTOTILE_BITS.E)) jaggedEdge('E');

            ctx.restore();
        }

        drawOverworldDirtTile(ctx, sx, sy, ts, gx, gy, mask) {
            const th = this.theme;
            const r = this.tileRand(gx, gy, 101);
            ctx.fillStyle = r < 0.55 ? th.dirtColor : th.dirtLight;
            ctx.fillRect(sx, sy, ts, ts);

            ctx.fillStyle = 'rgba(120, 83, 42, 0.22)';
            for (let i = 0; i < 8; i++) {
                const px = Math.floor(sx + 4 + this.tileRand(gx, gy, 112 + i) * (ts - 8));
                const py = Math.floor(sy + 4 + this.tileRand(gx, gy, 122 + i) * (ts - 8));
                const w = 2 + Math.floor(this.tileRand(gx, gy, 132 + i) * 5);
                ctx.fillRect(px, py, w, 2);
            }

            ctx.fillStyle = 'rgba(255, 242, 175, 0.12)';
            if ((gx + gy) % 4 === 0) {
                ctx.fillRect(sx + 4, sy + 5, ts - 10, 3);
                ctx.fillRect(sx + 8, sy + 12, ts - 18, 2);
            }
            this.drawOverworldFringe(ctx, sx, sy, ts, gx, gy, mask);
        }

        drawOverworldRoomGround(ctx, sx, sy, ts, gx, gy, room) {
            if (!room) return;
            const th = this.theme;
            const centerDist = Math.hypot(gx - room.centerX, gy - room.centerY);
            const patchRadius =
                room.type === ROOM_TYPE.TREASURE ? 3.2 :
                room.type === ROOM_TYPE.REST ? 2.8 :
                room.type === ROOM_TYPE.BOSS ? 4.2 :
                0;

            if (patchRadius > 0 && centerDist < patchRadius) {
                const alpha = Utils.clamp(1 - centerDist / patchRadius, 0, 1) * 0.55;
                ctx.fillStyle = `rgba(216, 187, 107, ${alpha})`;
                ctx.fillRect(sx, sy, ts, ts);
                ctx.fillStyle = `rgba(63, 121, 42, ${alpha * 0.8})`;
                ctx.fillRect(sx, sy + 4, ts, 3);
                ctx.fillRect(sx + 4, sy + 1, 6, 3);
                ctx.fillRect(sx + 22, sy + 2, 8, 3);
            }

            if (room.type === ROOM_TYPE.ELITE && this.tileRand(gx, gy, 166) < 0.16) {
                ctx.fillStyle = 'rgba(130, 80, 32, 0.24)';
                ctx.fillRect(sx + 8, sy + 10, 18, 3);
                ctx.fillRect(sx + 12, sy + 23, 20, 3);
            }

            if (room.type === ROOM_TYPE.BOSS && this.tileRand(gx, gy, 170) < 0.2) {
                ctx.fillStyle = th.flowerColor;
                ctx.fillRect(sx + ts * 0.5 - 2, sy + ts * 0.5 - 2, 4, 4);
            }
        }

        drawOverworldWaterTile(ctx, sx, sy, ts, gx, gy) {
            const th = this.theme;

            ctx.fillStyle = th.waterDeep;
            ctx.fillRect(sx, sy, ts, ts);
            ctx.fillStyle = th.waterColor;
            ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);

            ctx.fillStyle = 'rgba(19, 105, 152, 0.22)';
            ctx.fillRect(sx + 5, sy + 7, 12, 5);
            ctx.fillRect(sx + 22, sy + 24, 13, 4);
            ctx.fillStyle = 'rgba(185, 245, 255, 0.42)';
            for (let i = 0; i < 3; i++) {
                const px = Math.floor(sx + 4 + this.tileRand(gx, gy, 230 + i) * 26);
                const py = Math.floor(sy + 8 + this.tileRand(gx, gy, 240 + i) * 23);
                ctx.fillRect(px, py, 8, 2);
                if (this.tileRand(gx, gy, 250 + i) > 0.55) ctx.fillRect(px + 10, py + 1, 4, 1);
            }

            ctx.fillStyle = th.bankColor;
            if (!this.isWaterAt(gx, gy - 1)) ctx.fillRect(sx, sy, ts, 4);
            if (!this.isWaterAt(gx, gy + 1)) ctx.fillRect(sx, sy + ts - 4, ts, 4);
            if (!this.isWaterAt(gx - 1, gy)) ctx.fillRect(sx, sy, 4, ts);
            if (!this.isWaterAt(gx + 1, gy)) ctx.fillRect(sx + ts - 4, sy, 4, ts);

            ctx.fillStyle = 'rgba(143, 208, 74, 0.55)';
            if (!this.isWaterAt(gx, gy - 1)) ctx.fillRect(sx, sy, ts, 2);
            if (!this.isWaterAt(gx, gy + 1)) ctx.fillRect(sx, sy + ts - 2, ts, 2);
            if (!this.isWaterAt(gx - 1, gy)) ctx.fillRect(sx, sy, 2, ts);
            if (!this.isWaterAt(gx + 1, gy)) ctx.fillRect(sx + ts - 2, sy, 2, ts);
        }

        drawOverworldBridgeTile(ctx, sx, sy, ts, gx, gy) {
            const th = this.theme;
            const horizontal = this.isBaseWalkableTile(this.grid[gy]?.[gx - 1]) ||
                this.isBaseWalkableTile(this.grid[gy]?.[gx + 1]);
            ctx.save();
            ctx.fillStyle = th.woodColor;

            if (horizontal) {
                ctx.fillRect(sx - 1, sy + 9, ts + 2, 22);
                ctx.fillStyle = 'rgba(49, 30, 14, 0.28)';
                ctx.fillRect(sx - 1, sy + 28, ts + 2, 4);
                ctx.fillStyle = th.woodLight;
                for (let x = 0; x <= ts; x += 8) ctx.fillRect(sx + x, sy + 10, 2, 20);
                ctx.fillStyle = 'rgba(58, 35, 18, 0.5)';
                ctx.fillRect(sx, sy + 12, ts, 2);
                ctx.fillRect(sx, sy + 29, ts, 2);
            } else {
                ctx.fillRect(sx + 9, sy - 1, 22, ts + 2);
                ctx.fillStyle = 'rgba(49, 30, 14, 0.28)';
                ctx.fillRect(sx + 27, sy - 1, 4, ts + 2);
                ctx.fillStyle = th.woodLight;
                for (let y = 0; y <= ts; y += 8) ctx.fillRect(sx + 10, sy + y, 20, 2);
                ctx.fillStyle = 'rgba(58, 35, 18, 0.5)';
                ctx.fillRect(sx + 12, sy, 2, ts);
                ctx.fillRect(sx + 29, sy, 2, ts);
            }
            ctx.restore();
        }

        drawOverworldBarrierTile(ctx, sx, sy, ts, gx, gy) {
            const th = this.theme;
            const nearWalkable =
                this.isBaseWalkableTile(this.grid[gy - 1]?.[gx]) ||
                this.isBaseWalkableTile(this.grid[gy + 1]?.[gx]) ||
                this.isBaseWalkableTile(this.grid[gy]?.[gx - 1]) ||
                this.isBaseWalkableTile(this.grid[gy]?.[gx + 1]);

            ctx.save();
            ctx.fillStyle = nearWalkable ? 'rgba(35, 82, 28, 0.22)' : 'rgba(30, 70, 26, 0.12)';
            ctx.fillRect(sx, sy, ts, ts);

            ctx.fillStyle = th.hedgeDark;
            ctx.fillRect(sx + 2, sy + 14, ts - 4, 18);
            ctx.fillStyle = th.hedgeColor;
            const bumps = nearWalkable ? 4 : 3;
            for (let i = 0; i < bumps; i++) {
                const bx = Math.floor(sx + 4 + this.tileRand(gx, gy, 190 + i) * 26);
                const by = Math.floor(sy + 6 + this.tileRand(gx, gy, 200 + i) * 18);
                const bw = 9 + Math.floor(this.tileRand(gx, gy, 210 + i) * 9);
                ctx.fillRect(bx, by, bw, 12);
            }

            ctx.fillStyle = 'rgba(180, 238, 105, 0.24)';
            ctx.fillRect(sx + 9, sy + 9, 7, 5);
            ctx.restore();
        }

        drawOverworldExit(ctx, sx, sy, ts) {
            const th = this.theme;

            ctx.save();
            ctx.fillStyle = 'rgba(70, 55, 28, 0.26)';
            ctx.fillRect(sx + 9, sy + 10, 22, 22);
            ctx.fillStyle = th.stairsColor;
            ctx.fillRect(sx + 10, sy + 10, 20, 3);
            ctx.fillRect(sx + 10, sy + 27, 20, 3);
            ctx.fillRect(sx + 10, sy + 10, 3, 20);
            ctx.fillRect(sx + 27, sy + 10, 3, 20);
            ctx.fillStyle = 'rgba(255, 242, 166, 0.28)';
            ctx.fillRect(sx + 14, sy + 14, 12, 12);

            ctx.fillStyle = th.rockColor;
            ctx.fillRect(sx + 12, sy + 24, 6, 5);
            ctx.fillRect(sx + 20, sy + 22, 7, 6);
            ctx.fillRect(sx + 27, sy + 25, 5, 4);

            ctx.fillStyle = th.stairsColor;
            ctx.fillRect(sx + 19, sy + 12, 3, 15);
            ctx.fillRect(sx + 16, sy + 15, 9, 3);
            ctx.restore();
        }

        drawOverworldChest(ctx, sx, sy, ts) {
            const chestX = sx + 7;
            const chestY = sy + 11;
            const chestW = ts - 14;
            const chestH = ts - 19;

            ctx.save();
            ctx.shadowColor = 'rgba(65, 38, 18, 0.35)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#6b4323';
            ctx.fillRect(chestX, chestY + 5, chestW, chestH - 5);
            ctx.fillStyle = '#80532c';
            ctx.fillRect(chestX, chestY, chestW, 8);
            ctx.fillStyle = '#d9a441';
            ctx.fillRect(chestX + chestW * 0.46, chestY + 2, chestW * 0.08, chestH - 1);
            ctx.fillRect(chestX + 3, chestY + 10, chestW - 6, 2);
            ctx.fillStyle = '#f8d66a';
            ctx.fillRect(chestX + chestW * 0.43, chestY + chestH * 0.46, chestW * 0.14, 4);
            ctx.restore();
        }

        drawOverworldAnimatedGrass(ctx, cam, canvasW, canvasH, forces) {
            const ts = TILE_SIZE;
            const startCol = Math.max(0, Math.floor(cam.x / ts) - 1);
            const endCol = Math.min(this.width, Math.ceil((cam.x + canvasW) / ts) + 1);
            const startRow = Math.max(0, Math.floor(cam.y / ts) - 1);
            const endRow = Math.min(this.height, Math.ceil((cam.y + canvasH) / ts) + 1);

            for (let row = startRow; row < endRow; row++) {
                for (let col = startCol; col < endCol; col++) {
                    const tile = this.grid[row]?.[col];
                    if (tile === TILE.WALL || this.isWaterAt(col, row)) continue;
                    if (this.tileRand(col, row, 320) < 0.28) continue;

                    const room = this.getRoomForTile(col, row);
                    const isRoomInterior = tile === TILE.FLOOR && room && this.isRoomInteriorTile(col, row);
                    const blades = isRoomInterior ? 3 : 2;
                    const wxBase = col * ts;
                    const wyBase = row * ts;
                    const wind = this.getWindAt(col, row, isRoomInterior ? 0.95 : 0.7);

                    for (let i = 0; i < blades; i++) {
                        const bx = Math.floor(wxBase + 6 + this.tileRand(col, row, 330 + i) * (ts - 12));
                        const by = Math.floor(wyBase + 12 + this.tileRand(col, row, 340 + i) * (ts - 17));
                        const force = this.sampleBattlefieldForce(bx, by, forces, 62);
                        const bend = Utils.clamp(wind + force.x * 9, -8, 8);
                        const h = 6 + Math.floor(this.tileRand(col, row, 350 + i) * 7);
                        const sx = bx - cam.x;
                        const sy = by - cam.y;

                        ctx.fillStyle = force.strength > 0.25 ? 'rgba(178, 229, 85, 0.9)' : 'rgba(129, 187, 64, 0.78)';
                        ctx.fillRect(Math.round(sx), Math.round(sy - h), 2, h);
                        ctx.fillRect(Math.round(sx + bend), Math.round(sy - h - 1), 3, 2);
                    }
                }
            }
        }

        drawOverworldProps(ctx, cam, forces = []) {
            if (!Array.isArray(this.overworldProps) || !this.overworldProps.length) return;
            const ordered = this.overworldPropsSorted.length ? this.overworldPropsSorted : this.overworldProps;

            for (const prop of ordered) {
                const sx = prop.x - cam.x;
                const sy = prop.y - cam.y;
                if (sx < -80 || sx > ctx.canvas.width + 80) continue;
                if (sy < -100 || sy > ctx.canvas.height + 100) continue;
                const sway = this.updateOverworldPropPhysics(prop, forces);
                this.drawOverworldProp(ctx, prop, sx, sy, sway);
            }
        }

        updateOverworldPropPhysics(prop, forces) {
            if (!prop) return 0;
            const dynamic =
                prop.type === 'treeRound' ||
                prop.type === 'pine' ||
                prop.type === 'bush' ||
                prop.type === 'grassTuft' ||
                prop.type === 'flowers';
            if (!dynamic) return 0;

            const wind = this.getWindAt(prop.gx || 0, prop.gy || 0, prop.type === 'pine' ? 1.25 : 1);
            const force = this.sampleBattlefieldForce(prop.x, prop.y, forces, prop.type === 'bush' ? 74 : 96);
            const mass =
                prop.type === 'treeRound' ? 1.45 :
                prop.type === 'pine' ? 1.25 :
                prop.type === 'bush' ? 0.9 : 0.55;
            const target = Utils.clamp(wind + force.x * 13, -13, 13) / mass;

            prop.sway = Number(prop.sway) || 0;
            prop.swayVelocity = Number(prop.swayVelocity) || 0;
            prop.swayVelocity += (target - prop.sway) * 0.11;
            prop.swayVelocity *= 0.78;
            prop.sway += prop.swayVelocity;
            prop.sway = Utils.clamp(prop.sway, -14, 14);
            return prop.sway;
        }

        drawOverworldProp(ctx, prop, sx, sy, sway = 0) {
            const th = this.theme;
            const s = prop.scale || 1;

            ctx.save();
            const px = Math.round(sx);
            const py = Math.round(sy);
            const sc = (value) => Math.max(1, Math.round(value * s));
            const swayPx = Math.round(sway);
            const halfSwayPx = Math.round(sway * 0.5);
            ctx.globalAlpha = 0.98;
            ctx.fillStyle = 'rgba(28, 45, 20, 0.28)';
            ctx.fillRect(px - sc(12), py + sc(8), sc(24), sc(5));

            switch (prop.type) {
                case 'treeRound': {
                    ctx.fillStyle = th.trunkColor;
                    ctx.fillRect(px - sc(4), py - sc(4), sc(8), sc(20));
                    ctx.fillStyle = th.hedgeDark;
                    ctx.fillRect(px + halfSwayPx - sc(17), py - sc(25), sc(34), sc(24));
                    ctx.fillRect(px + halfSwayPx - sc(22), py - sc(14), sc(44), sc(18));
                    ctx.fillStyle = th.hedgeColor;
                    ctx.fillRect(px + swayPx - sc(12), py - sc(29), sc(24), sc(12));
                    ctx.fillRect(px + halfSwayPx - sc(21), py - sc(19), sc(17), sc(14));
                    ctx.fillRect(px + halfSwayPx + sc(4), py - sc(20), sc(18), sc(15));
                    ctx.fillStyle = 'rgba(190, 245, 105, 0.28)';
                    ctx.fillRect(px + swayPx - sc(9), py - sc(25), sc(7), sc(5));
                    break;
                }
                case 'pine': {
                    ctx.fillStyle = th.trunkColor;
                    ctx.fillRect(px - sc(3), py - sc(2), sc(6), sc(18));
                    ctx.fillStyle = th.hedgeDark;
                    ctx.fillRect(px + halfSwayPx - sc(18), py - sc(20), sc(36), sc(13));
                    ctx.fillRect(px + halfSwayPx - sc(14), py - sc(31), sc(28), sc(13));
                    ctx.fillRect(px + swayPx - sc(9), py - sc(40), sc(18), sc(12));
                    ctx.fillStyle = th.hedgeColor;
                    ctx.fillRect(px + halfSwayPx - sc(11), py - sc(26), sc(22), sc(8));
                    ctx.fillRect(px + swayPx - sc(7), py - sc(35), sc(14), sc(8));
                    break;
                }
                case 'bush': {
                    ctx.fillStyle = th.hedgeDark;
                    ctx.fillRect(px - sc(14), py - sc(1), sc(28), sc(13));
                    ctx.fillStyle = th.hedgeColor;
                    ctx.fillRect(px + halfSwayPx - sc(12), py - sc(6), sc(10), sc(10));
                    ctx.fillRect(px + swayPx - sc(4), py - sc(9), sc(13), sc(12));
                    ctx.fillRect(px + halfSwayPx + sc(7), py - sc(5), sc(10), sc(10));
                    break;
                }
                case 'stump': {
                    ctx.fillStyle = th.trunkColor;
                    ctx.fillRect(px - sc(7), py - sc(4), sc(14), sc(14));
                    ctx.fillStyle = th.woodLight;
                    ctx.fillRect(px - sc(7), py - sc(6), sc(14), sc(5));
                    ctx.fillStyle = 'rgba(67, 42, 21, 0.45)';
                    ctx.fillRect(px - sc(3), py - sc(5), sc(6), sc(2));
                    break;
                }
                case 'rock': {
                    ctx.fillStyle = th.rockColor;
                    ctx.fillRect(px - sc(9), py - sc(4), sc(19), sc(12));
                    ctx.fillStyle = 'rgba(72, 68, 55, 0.34)';
                    ctx.fillRect(px - sc(11), py + sc(2), sc(23), sc(7));
                    ctx.fillStyle = 'rgba(255,255,255,0.16)';
                    ctx.fillRect(px - sc(4), py - sc(3), sc(7), sc(2));
                    break;
                }
                case 'flowers': {
                    ctx.fillStyle = th.flowerColor;
                    for (let i = 0; i < 4; i++) {
                        const ox = sc((i - 1.5) * 4);
                        const oy = sc((i % 2) * 4);
                        ctx.fillStyle = th.grassDark;
                        ctx.fillRect(px + ox, py + oy, 1, sc(8));
                        ctx.fillStyle = th.flowerColor;
                        ctx.fillRect(px + ox - 1 + halfSwayPx, py + oy, sc(3), sc(3));
                    }
                    break;
                }
                case 'grassTuft': {
                    ctx.fillStyle = th.grassLight;
                    for (let i = -2; i <= 2; i++) {
                        ctx.fillRect(px + sc(i * 3) + halfSwayPx, py - sc(3), 2, sc(11));
                    }
                    break;
                }
                case 'pebbles':
                default: {
                    ctx.fillStyle = 'rgba(92, 82, 58, 0.42)';
                    ctx.fillRect(px - sc(5), py + sc(3), sc(4), sc(3));
                    ctx.fillRect(px + sc(3), py - sc(1), sc(5), sc(4));
                    ctx.fillRect(px + sc(9), py + sc(5), sc(3), sc(2));
                    break;
                }
            }
            ctx.restore();
        }

        makeOverworldCanvas(width, height) {
            const w = Math.max(1, Math.ceil(width));
            const h = Math.max(1, Math.ceil(height));
            if (typeof OffscreenCanvas !== 'undefined') {
                return new OffscreenCanvas(w, h);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            return canvas;
        }

        invalidateOverworldChunk(gx, gy) {
            if (!this.overworldTerrainChunks) return;
            const cs = this.overworldChunkSize || 8;
            this.overworldTerrainChunks.delete(`${Math.floor(gx / cs)},${Math.floor(gy / cs)}`);
        }

        drawOverworldTile(ctx, col, row, sx, sy) {
            const ts = TILE_SIZE;
            const tile = this.grid[row][col];
            const room = this.getRoomForTile(col, row);
            const isRoomInterior = tile === TILE.FLOOR && room && this.isRoomInteriorTile(col, row);
            const grassKind = isRoomInterior ? 'meadow' : 'wild';

            this.drawOverworldGrassTile(ctx, sx, sy, ts, col, row, grassKind);

            if (this.isWaterAt(col, row)) {
                this.drawOverworldWaterTile(ctx, sx, sy, ts, col, row);
                if (this.isBridgeAt(col, row)) {
                    this.drawOverworldBridgeTile(ctx, sx, sy, ts, col, row);
                }
                return;
            }

            if (tile === TILE.WALL) {
                this.drawOverworldBarrierTile(ctx, sx, sy, ts, col, row);
                return;
            }

            if (tile === TILE.FLOOR) {
                if (isRoomInterior) {
                    this.drawOverworldRoomGround(ctx, sx, sy, ts, col, row, room);
                } else {
                    const pathMask = this.getNeighborMask(col, row, (t) => this.isFloorLinkTile(t));
                    this.drawOverworldDirtTile(ctx, sx, sy, ts, col, row, pathMask);
                }
                return;
            }

            if (tile === TILE.STAIRS) {
                const pathMask = this.getNeighborMask(col, row, (t) => this.isFloorLinkTile(t));
                this.drawOverworldDirtTile(ctx, sx, sy, ts, col, row, pathMask);
                this.drawOverworldExit(ctx, sx, sy, ts);
                return;
            }

            if (tile === TILE.CHEST) {
                const pathMask = this.getNeighborMask(col, row, (t) => this.isFloorLinkTile(t));
                this.drawOverworldDirtTile(ctx, sx, sy, ts, col, row, pathMask);
                this.drawOverworldChest(ctx, sx, sy, ts);
            }
        }

        renderOverworldChunk(chunkX, chunkY) {
            const cs = this.overworldChunkSize || 8;
            const ts = TILE_SIZE;
            const startCol = chunkX * cs;
            const startRow = chunkY * cs;
            const endCol = Math.min(this.width, startCol + cs);
            const endRow = Math.min(this.height, startRow + cs);
            const canvas = this.makeOverworldCanvas((endCol - startCol) * ts, (endRow - startRow) * ts);
            const cctx = canvas.getContext('2d');
            cctx.imageSmoothingEnabled = false;

            for (let row = startRow; row < endRow; row++) {
                for (let col = startCol; col < endCol; col++) {
                    this.drawOverworldTile(cctx, col, row, (col - startCol) * ts, (row - startRow) * ts);
                }
            }

            return canvas;
        }

        drawOverworldTerrainChunks(ctx, cam, canvasW, canvasH) {
            const ts = TILE_SIZE;
            const cs = this.overworldChunkSize || 8;
            const startCol = Math.max(0, Math.floor(cam.x / ts) - 1);
            const endCol = Math.min(this.width, Math.ceil((cam.x + canvasW) / ts) + 1);
            const startRow = Math.max(0, Math.floor(cam.y / ts) - 1);
            const endRow = Math.min(this.height, Math.ceil((cam.y + canvasH) / ts) + 1);
            const startChunkX = Math.floor(startCol / cs);
            const endChunkX = Math.floor((Math.max(startCol, endCol - 1)) / cs);
            const startChunkY = Math.floor(startRow / cs);
            const endChunkY = Math.floor((Math.max(startRow, endRow - 1)) / cs);

            for (let cy = startChunkY; cy <= endChunkY; cy++) {
                for (let cx = startChunkX; cx <= endChunkX; cx++) {
                    const key = `${cx},${cy}`;
                    let chunk = this.overworldTerrainChunks.get(key);
                    if (!chunk) {
                        chunk = this.renderOverworldChunk(cx, cy);
                        this.overworldTerrainChunks.set(key, chunk);
                    }
                    ctx.drawImage(chunk, cx * cs * ts - cam.x, cy * cs * ts - cam.y);
                }
            }
        }

        drawOverworld(ctx, cam, canvasW, canvasH, forces = []) {
            const prevSmoothing = ctx.imageSmoothingEnabled;
            const pixelCam = { x: Math.floor(cam.x), y: Math.floor(cam.y) };
            ctx.imageSmoothingEnabled = false;
            this.drawOverworldTerrainChunks(ctx, pixelCam, canvasW, canvasH);
            this.drawOverworldAnimatedGrass(ctx, pixelCam, canvasW, canvasH, forces);
            this.drawOverworldProps(ctx, pixelCam, forces);
            ctx.imageSmoothingEnabled = prevSmoothing;
        }

        draw(ctx, cam, canvasW, canvasH, forces = []) {
            if (this.theme.isOverworld) {
                this.drawOverworld(ctx, cam, canvasW, canvasH, forces);
                return;
            }

            const th = this.theme;
            const ts = TILE_SIZE;

            const startCol = Math.max(0, Math.floor(cam.x / ts) - 1);
            const endCol   = Math.min(this.width,  Math.ceil((cam.x + canvasW) / ts) + 1);
            const startRow = Math.max(0, Math.floor(cam.y / ts) - 1);
            const endRow   = Math.min(this.height, Math.ceil((cam.y + canvasH) / ts) + 1);

            // Build lava/water sets for O(1) lookup
            const lavaSet = new Set(this.lavaTiles.map(t => `${t.x},${t.y}`));
            const waterSet = new Set(this.waterTiles.map(t => `${t.x},${t.y}`));
            const spriteFloor = BattlefieldSpriteStore.getByLevel(SETPIECE_SPRITE_KEY.floor, this.levelNum);
            const spriteWall = BattlefieldSpriteStore.getByLevel(SETPIECE_SPRITE_KEY.wall, this.levelNum);
            const spriteStairs = BattlefieldSpriteStore.getByLevel(SETPIECE_SPRITE_KEY.stairs, this.levelNum);
            const spriteChest = BattlefieldSpriteStore.getByLevel(SETPIECE_SPRITE_KEY.chest, this.levelNum);

            for (let row = startRow; row < endRow; row++) {
                for (let col = startCol; col < endCol; col++) {
                    const tile = this.grid[row][col];
                    if (tile === TILE.VOID) continue;

                    const sx = col * ts - cam.x;
                    const sy = row * ts - cam.y;
                    const key = `${col},${row}`;

                    // === FLOOR ===
                    if (tile === TILE.FLOOR) {
                        const floorMask = this.getNeighborMask(col, row, (t) => this.isFloorLinkTile(t));
                        const autoFloorSprite = this.getAutotileSprite(SETPIECE_SPRITE_KEY.floor, floorMask) || spriteFloor;

                        // Base floor (prefer sprite tile when provided by asset manifest).
                        if (autoFloorSprite) {
                            ctx.drawImage(autoFloorSprite, sx, sy, ts, ts);
                            ctx.fillStyle = 'rgba(10, 20, 35, 0.22)';
                            ctx.fillRect(sx, sy, ts, ts);
                        } else {
                            ctx.fillStyle = th.floorColor;
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        this.drawFloorAutotileBlend(ctx, sx, sy, ts, floorMask, th);

                        // Tile grout lines
                        ctx.fillStyle = th.floorAccent;
                        ctx.fillRect(sx, sy, ts, 1);
                        ctx.fillRect(sx, sy, 1, ts);

                        // Subtle pattern / detail
                        if ((row + col) % 5 === 0) {
                            ctx.fillStyle = th.floorHighlight;
                            ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
                        }

                        // Ambient glow spots
                        if ((row * 7 + col * 13) % 17 === 0) {
                            ctx.fillStyle = th.ambientColor;
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        // Cracks on floor
                        if (th.hasCracks && (row * col + row + col) % 23 === 0) {
                            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(sx + 5, sy + 10);
                            ctx.lineTo(sx + 18, sy + 20);
                            ctx.lineTo(sx + 28, sy + 15);
                            ctx.stroke();
                        }

                        // Moss on sewer level
                        if (th.hasMoss && (row * 3 + col * 5) % 19 === 0) {
                            ctx.fillStyle = 'rgba(22,163,74,0.12)';
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        // Lava tiles
                        if (lavaSet.has(key)) {
                            const pulse = (Math.sin(this.torchTimer * 2 + col + row) + 1) / 2;
                            ctx.fillStyle = `rgba(255, ${60 + pulse * 40 | 0}, 0, 0.85)`;
                            ctx.fillRect(sx, sy, ts, ts);
                            ctx.fillStyle = `rgba(255, ${180 + pulse * 30 | 0}, 0, 0.4)`;
                            ctx.fillRect(sx + 6, sy + 6, ts - 12, ts - 12);
                            // Lava glow
                            ctx.save();
                            ctx.shadowColor = '#ff4500';
                            ctx.shadowBlur = 12 + pulse * 6;
                            ctx.fillStyle = 'rgba(255,100,0,0.15)';
                            ctx.fillRect(sx, sy, ts, ts);
                            ctx.restore();
                        }

                        // Water tiles
                        if (waterSet.has(key)) {
                            const wave = (Math.sin(this.torchTimer * 1.5 + col * 0.5 + row * 0.3) + 1) / 2;
                            ctx.fillStyle = `rgba(30, ${80 + wave * 30 | 0}, ${150 + wave * 20 | 0}, 0.75)`;
                            ctx.fillRect(sx, sy, ts, ts);
                            // Ripple
                            ctx.strokeStyle = `rgba(100,200,255,${0.2 + wave * 0.15})`;
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(sx + 4, sy + ts / 2 + wave * 6 - 3);
                            ctx.bezierCurveTo(sx + 12, sy + ts / 2 - 4, sx + 28, sy + ts / 2 + 4, sx + 36, sy + ts / 2 + wave * 6 - 3);
                            ctx.stroke();
                        }
                    }

                    // === WALL ===
                    if (tile === TILE.WALL) {
                        const wallMask = this.getNeighborMask(col, row, (t) => t === TILE.WALL);
                        const autoWallSprite = this.getAutotileSprite(SETPIECE_SPRITE_KEY.wall, wallMask) || spriteWall;
                        if (autoWallSprite) {
                            ctx.drawImage(autoWallSprite, sx, sy, ts, ts);
                            ctx.fillStyle = 'rgba(3, 7, 15, 0.26)';
                            ctx.fillRect(sx, sy, ts, ts);
                        } else {
                            // Wall face
                            ctx.fillStyle = th.wallColor;
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        // Stone block pattern
                        const blockRow = row % 2;
                        const blockShift = blockRow === 0 ? 0 : ts / 2;
                        if ((col * ts + (blockShift | 0)) % (ts * 2) < ts) {
                            ctx.fillStyle = 'rgba(0,0,0,0.12)';
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        // Top highlight
                        ctx.fillStyle = th.wallTop;
                        ctx.fillRect(sx, sy, ts, 3);

                        // Left edge light
                        ctx.fillStyle = 'rgba(255,255,255,0.04)';
                        ctx.fillRect(sx, sy, 2, ts);

                        // Bottom shadow
                        ctx.fillStyle = th.wallShadow;
                        ctx.fillRect(sx, sy + ts - 3, ts, 3);

                        // Mortar lines
                        ctx.fillStyle = 'rgba(0,0,0,0.18)';
                        ctx.fillRect(sx, sy + ts / 2, ts, 1);
                        ctx.fillRect(sx + ts / 2, sy, 1, ts);

                        // Glow bleed from adjacent floor
                        if (row > 0 && this.grid[row-1]?.[col] === TILE.FLOOR) {
                            ctx.fillStyle = th.glowColor;
                            ctx.fillRect(sx, sy, ts, 6);
                        }

                        this.drawWallAutotileBlend(ctx, sx, sy, ts, wallMask, th);
                    }

                    // === STAIRS ===
                    if (tile === TILE.STAIRS) {
                        if (spriteStairs) {
                            ctx.drawImage(spriteStairs, sx, sy, ts, ts);
                            ctx.fillStyle = 'rgba(8, 14, 26, 0.25)';
                            ctx.fillRect(sx, sy, ts, ts);
                        } else {
                            // Base floor
                            ctx.fillStyle = th.floorColor;
                            ctx.fillRect(sx, sy, ts, ts);
                        }

                        // Glowing portal ring
                        const pulse = (Math.sin(this.torchTimer * 2) + 1) / 2;
                        ctx.save();
                        ctx.shadowColor = th.stairsColor;
                        ctx.shadowBlur = 16 + pulse * 12;

                        // Outer ring
                        ctx.strokeStyle = th.stairsColor;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(sx + ts / 2, sy + ts / 2, 14 + pulse * 2, 0, Math.PI * 2);
                        ctx.stroke();

                        // Inner fill
                        ctx.fillStyle = th.stairsBg;
                        ctx.beginPath();
                        ctx.arc(sx + ts / 2, sy + ts / 2, 12, 0, Math.PI * 2);
                        ctx.fill();

                        // Arrow icon
                        ctx.fillStyle = th.stairsColor;
                        ctx.font = 'bold 16px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('â–¼', sx + ts / 2, sy + ts / 2 + 1);
                        ctx.restore();
                    }

                    // === CHEST ===
                    if (tile === TILE.CHEST) {
                        if (spriteChest) {
                            ctx.drawImage(spriteChest, sx, sy, ts, ts);
                            continue;
                        }
                        ctx.fillStyle = th.floorColor;
                        ctx.fillRect(sx, sy, ts, ts);

                        const chestX = sx + 7;
                        const chestY = sy + 10;
                        const chestW = ts - 14;
                        const chestH = ts - 18;

                        ctx.fillStyle = '#5b3a1e';
                        ctx.fillRect(chestX, chestY + 5, chestW, chestH - 5);
                        ctx.fillStyle = '#6b4221';
                        ctx.fillRect(chestX, chestY, chestW, 8);

                        ctx.fillStyle = '#d4a017';
                        ctx.fillRect(chestX + chestW * 0.46, chestY + 3, chestW * 0.08, chestH - 2);
                        ctx.fillRect(chestX + 3, chestY + 9, chestW - 6, 2);

                        ctx.fillStyle = '#facc15';
                        ctx.fillRect(chestX + chestW * 0.44, chestY + chestH * 0.45, chestW * 0.12, 4);

                        ctx.save();
                        ctx.shadowColor = '#f59e0b';
                        ctx.shadowBlur = 12;
                        ctx.strokeStyle = 'rgba(245,158,11,0.45)';
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(chestX - 1, chestY - 1, chestW + 2, chestH + 2);
                        ctx.restore();
                    }
                }
            }

            // === TORCH GLOW OVERLAYS ===
            this.drawTorches(ctx, cam, startCol, endCol, startRow, endRow);

            // === ENVIRONMENT DECORATIONS ===
            this.drawDecorations(ctx, cam);
            this.drawSetPieces(ctx, cam);

            // === ROOM TYPE INDICATORS ===
            this.drawRoomOverlays(ctx, cam);
        }

        drawDecorations(ctx, cam) {
            // â”€â”€ Shape decorations (canvas drawn, no emoji) â”€â”€
            for (const d of this.shapeDecorations) {
                const sx = d.x - cam.x;
                const sy = d.y - cam.y;
                // Rough culling
                if (sx < -60 || sx > ctx.canvas.width + 60) continue;
                if (sy < -60 || sy > ctx.canvas.height + 60) continue;

                ctx.save();
                switch (d.type) {
                    case 'stain':
                    case 'blood': {
                        // Irregular splat
                        ctx.fillStyle = d.color;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, d.r, d.r2, d.angle, 0, Math.PI * 2);
                        ctx.fill();
                        // Small satellite drops
                        ctx.beginPath();
                        ctx.arc(sx + d.r * 0.6, sy - d.r2 * 0.4, d.r2 * 0.4, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                    case 'wisp':
                    case 'ash':
                    case 'starfield': {
                        ctx.fillStyle = d.color;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, d.r * 1.4, d.r2, d.angle, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                    case 'puddle':
                    case 'slime': {
                        ctx.fillStyle = d.color;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, d.r, d.r2 * 0.6, d.angle, 0, Math.PI * 2);
                        ctx.fill();
                        // Ripple ring
                        ctx.strokeStyle = d.color.replace('0.', '0.5');
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, d.r * 1.2, d.r2 * 0.8, d.angle, 0, Math.PI * 2);
                        ctx.stroke();
                        break;
                    }
                    case 'ember': {
                        // Small glowing dot clusters
                        const pulse = (Math.sin(this.torchTimer * 3 + d.seed * 10) + 1) / 2;
                        ctx.shadowColor = '#ff6600';
                        ctx.shadowBlur = 6 + pulse * 4;
                        ctx.fillStyle = `rgba(255, ${80 + pulse * 80 | 0}, 0, ${0.5 + pulse * 0.4})`;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 2 + pulse * 1.5, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                    case 'voidpool': {
                        const pulse = (Math.sin(this.torchTimer * 1.5 + d.seed * 8) + 1) / 2;
                        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, d.r);
                        grad.addColorStop(0, `rgba(80,0,180,${0.5 + pulse * 0.2})`);
                        grad.addColorStop(1, 'rgba(20,0,50,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, d.r, d.r2, d.angle, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                    case 'ritual': {
                        // Glowing ritual circle
                        const pulse = (Math.sin(this.torchTimer * 2 + d.seed * 6) + 1) / 2;
                        ctx.shadowColor = '#8b0018';
                        ctx.shadowBlur = 8 + pulse * 6;
                        ctx.strokeStyle = `rgba(200,0,50,${0.3 + pulse * 0.2})`;
                        ctx.lineWidth = 1.5;
                        // Outer circle
                        ctx.beginPath();
                        ctx.arc(sx, sy, d.r, 0, Math.PI * 2);
                        ctx.stroke();
                        // Inner star
                        ctx.beginPath();
                        for (let p = 0; p < 5; p++) {
                            const a1 = (p * 4 * Math.PI / 5) - Math.PI / 2;
                            const a2 = ((p + 0.5) * 4 * Math.PI / 5) - Math.PI / 2;
                            if (p === 0) ctx.moveTo(sx + Math.cos(a1) * d.r, sy + Math.sin(a1) * d.r);
                            else ctx.lineTo(sx + Math.cos(a1) * d.r, sy + Math.sin(a1) * d.r);
                            ctx.lineTo(sx + Math.cos(a2) * d.r2, sy + Math.sin(a2) * d.r2);
                        }
                        ctx.closePath();
                        ctx.stroke();
                        break;
                    }
                    case 'debris': {
                        ctx.fillStyle = d.color;
                        ctx.beginPath();
                        ctx.moveTo(sx - d.r * 0.4, sy - d.r2 * 0.25);
                        ctx.lineTo(sx + d.r * 0.45, sy - d.r2 * 0.1);
                        ctx.lineTo(sx + d.r * 0.3, sy + d.r2 * 0.4);
                        ctx.lineTo(sx - d.r * 0.35, sy + d.r2 * 0.25);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'battlemark': {
                        ctx.strokeStyle = 'rgba(30, 25, 20, 0.5)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(sx - d.r * 0.5, sy - d.r2 * 0.3);
                        ctx.lineTo(sx + d.r * 0.5, sy + d.r2 * 0.3);
                        ctx.moveTo(sx - d.r * 0.45, sy + d.r2 * 0.25);
                        ctx.lineTo(sx + d.r * 0.35, sy - d.r2 * 0.25);
                        ctx.stroke();
                        break;
                    }
                }
                ctx.restore();
            }

            // â”€â”€ Emoji/icon decorations â”€â”€
            if (USE_ICON_DECORATIONS) {
                for (const d of this.decorations) {
                    const sx = d.x - cam.x;
                    const sy = d.y - cam.y;
                    if (sx < -60 || sx > ctx.canvas.width + 60) continue;
                    if (sy < -60 || sy > ctx.canvas.height + 60) continue;

                    let drawY = sy;
                    let extraScale = 1;

                    if (d.animated) {
                        // Gentle float / pulse
                        drawY += Math.sin(this.torchTimer * 2 + d.animOffset) * 3;
                        extraScale = 0.92 + Math.sin(this.torchTimer * 1.5 + d.animOffset) * 0.08;
                    }

                    const fontSize = Math.round(20 * d.scale * extraScale);

                    ctx.save();
                    ctx.globalAlpha = d.layer === 'wall' ? 0.65 : 0.82;
                    if (d.animated) {
                        ctx.shadowColor = this.theme.torchColor;
                        ctx.shadowBlur = 6 + Math.sin(this.torchTimer * 2 + d.animOffset) * 3;
                    }
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(d.icon, sx, drawY);
                    ctx.restore();
                }
            }
        }

        drawSetPieces(ctx, cam) {
            if (!Array.isArray(this.setPieces) || this.setPieces.length === 0) return;
            const ordered = [...this.setPieces].sort((a, b) => a.y - b.y);
            const ts = TILE_SIZE;

            for (const piece of ordered) {
                const sx = piece.x - cam.x;
                const sy = piece.y - cam.y;
                if (sx < -60 || sx > ctx.canvas.width + 60) continue;
                if (sy < -60 || sy > ctx.canvas.height + 60) continue;

                const spriteKey = SETPIECE_SPRITE_KEY[piece.type];
                const sprite = spriteKey ? BattlefieldSpriteStore.getByLevel(spriteKey, this.levelNum) : null;
                const size = ts * (0.58 + (piece.scale - 0.88) * 0.45);
                if (sprite) {
                    ctx.save();
                    ctx.globalAlpha = 0.96;
                    ctx.drawImage(sprite, sx - size / 2, sy - size + 5, size, size);
                    ctx.restore();
                    continue;
                }

                this.drawSetPiecePrimitive(ctx, piece, sx, sy, size);
            }
        }

        drawSetPiecePrimitive(ctx, piece, sx, sy, size) {
            const t = this.torchTimer;
            const half = size * 0.5;
            const baseY = sy + 6;

            ctx.save();
            ctx.globalAlpha = 0.93;

            switch (piece.type) {
                case 'crate':
                    ctx.fillStyle = '#6a4a2a';
                    ctx.fillRect(sx - half, baseY - size * 0.55, size, size * 0.55);
                    ctx.strokeStyle = '#b68a4b';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(sx - half + 1, baseY - size * 0.55 + 1, size - 2, size * 0.55 - 2);
                    ctx.strokeStyle = 'rgba(235, 198, 133, 0.5)';
                    ctx.beginPath();
                    ctx.moveTo(sx - half + 3, baseY - size * 0.5);
                    ctx.lineTo(sx + half - 3, baseY - size * 0.08);
                    ctx.moveTo(sx + half - 3, baseY - size * 0.5);
                    ctx.lineTo(sx - half + 3, baseY - size * 0.08);
                    ctx.stroke();
                    break;

                case 'barrel':
                    ctx.fillStyle = '#5a3d24';
                    ctx.beginPath();
                    ctx.ellipse(sx, baseY - size * 0.3, size * 0.42, size * 0.36, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#cc8f43';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(sx, baseY - size * 0.3, size * 0.42, size * 0.36, 0, 0, Math.PI * 2);
                    ctx.moveTo(sx - size * 0.35, baseY - size * 0.42);
                    ctx.lineTo(sx + size * 0.35, baseY - size * 0.42);
                    ctx.moveTo(sx - size * 0.35, baseY - size * 0.2);
                    ctx.lineTo(sx + size * 0.35, baseY - size * 0.2);
                    ctx.stroke();
                    break;

                case 'brazier': {
                    const flicker = (Math.sin(t * 7 + piece.seed * 4) + 1) * 0.5;
                    ctx.fillStyle = '#374151';
                    ctx.fillRect(sx - size * 0.1, baseY - size * 0.45, size * 0.2, size * 0.4);
                    ctx.fillStyle = '#4b5563';
                    ctx.fillRect(sx - size * 0.22, baseY - size * 0.55, size * 0.44, size * 0.12);
                    ctx.shadowColor = '#fb923c';
                    ctx.shadowBlur = 8 + flicker * 8;
                    ctx.fillStyle = `rgba(251, 146, 60, ${0.5 + flicker * 0.35})`;
                    ctx.beginPath();
                    ctx.ellipse(sx, baseY - size * 0.56, size * 0.16, size * (0.16 + flicker * 0.1), 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }

                case 'crystalCluster':
                    ctx.fillStyle = '#93c5fd';
                    ctx.beginPath();
                    ctx.moveTo(sx - size * 0.28, baseY - size * 0.08);
                    ctx.lineTo(sx - size * 0.12, baseY - size * 0.58);
                    ctx.lineTo(sx + size * 0.02, baseY - size * 0.08);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#c4b5fd';
                    ctx.beginPath();
                    ctx.moveTo(sx + size * 0.02, baseY - size * 0.06);
                    ctx.lineTo(sx + size * 0.22, baseY - size * 0.5);
                    ctx.lineTo(sx + size * 0.34, baseY - size * 0.08);
                    ctx.closePath();
                    ctx.fill();
                    break;

                case 'altar':
                    ctx.fillStyle = '#374151';
                    ctx.fillRect(sx - size * 0.42, baseY - size * 0.32, size * 0.84, size * 0.26);
                    ctx.fillStyle = '#6b7280';
                    ctx.fillRect(sx - size * 0.5, baseY - size * 0.48, size, size * 0.18);
                    ctx.strokeStyle = 'rgba(196, 181, 253, 0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(sx - size * 0.3, baseY - size * 0.39);
                    ctx.lineTo(sx + size * 0.3, baseY - size * 0.39);
                    ctx.stroke();
                    break;

                case 'cursedStatue':
                    ctx.fillStyle = '#4b5563';
                    ctx.fillRect(sx - size * 0.18, baseY - size * 0.62, size * 0.36, size * 0.5);
                    ctx.fillRect(sx - size * 0.32, baseY - size * 0.18, size * 0.64, size * 0.12);
                    ctx.fillStyle = '#9ca3af';
                    ctx.beginPath();
                    ctx.arc(sx, baseY - size * 0.66, size * 0.12, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'voidObelisk':
                    ctx.fillStyle = '#312e81';
                    ctx.beginPath();
                    ctx.moveTo(sx, baseY - size * 0.78);
                    ctx.lineTo(sx + size * 0.22, baseY - size * 0.16);
                    ctx.lineTo(sx - size * 0.22, baseY - size * 0.16);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(129, 140, 248, 0.45)';
                    ctx.fillRect(sx - size * 0.04, baseY - size * 0.58, size * 0.08, size * 0.34);
                    break;

                case 'runeTotem':
                case 'arcNode':
                case 'slimePod':
                case 'pipeScrap':
                case 'mushroomPatch':
                case 'charPile':
                case 'spikeBarricade':
                case 'bloodSpikes':
                case 'pillarBroken':
                case 'urn':
                case 'bones':
                case 'rubble':
                default:
                    // Generic fallback for optional piece types.
                    ctx.fillStyle = 'rgba(90, 90, 95, 0.8)';
                    ctx.beginPath();
                    ctx.arc(sx - size * 0.16, baseY - size * 0.12, size * 0.13, 0, Math.PI * 2);
                    ctx.arc(sx + size * 0.12, baseY - size * 0.2, size * 0.11, 0, Math.PI * 2);
                    ctx.arc(sx + size * 0.02, baseY - size * 0.05, size * 0.1, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
            ctx.restore();
        }

        drawTorches(ctx, cam, startCol, endCol, startRow, endRow) {
            const ts = TILE_SIZE;
            const th = this.theme;

            for (const torch of this.torchPositions) {
                if (torch.x < startCol || torch.x > endCol) continue;
                if (torch.y < startRow || torch.y > endRow) continue;

                const sx = torch.x * ts - cam.x + ts / 2;
                const sy = torch.y * ts - cam.y + ts / 2;
                const flicker = Math.sin(this.torchTimer * 8 + torch.flickerOffset) * 0.3 + 0.7;

                // Torch light spread
                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60 * flicker);
                grad.addColorStop(0, `rgba(${this.hexToRg(th.torchColor)}, ${0.18 * flicker})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(sx - 60, sy - 60, 120, 120);

                // Torch flame
                ctx.save();
                ctx.shadowColor = th.torchColor;
                ctx.shadowBlur = 8 * flicker;
                ctx.fillStyle = th.torchColor;
                ctx.font = `${12 * flicker | 0}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('ðŸ”¥', sx, sy);
                ctx.restore();
            }
        }

        drawRoomOverlays(ctx, cam) {
            const ts = TILE_SIZE;

            for (const room of this.rooms) {
                if (!room.discovered) continue;

                const rx = room.x * ts - cam.x;
                const ry = room.y * ts - cam.y;
                const rw = room.w * ts;
                const rh = room.h * ts;

                // Boss room â€” glowing red border
                if (room.type === ROOM_TYPE.BOSS) {
                    const pulse = (Math.sin(this.torchTimer * 2) + 1) / 2;
                    ctx.save();
                    ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + pulse * 0.3})`;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 10 + pulse * 8;
                    ctx.strokeRect(rx + ts, ry + ts, rw - ts * 2, rh - ts * 2);
                    ctx.restore();
                }

                // Rest room â€” soft green glow
                if (room.type === ROOM_TYPE.REST) {
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
                    ctx.fillRect(rx + ts, ry + ts, rw - ts * 2, rh - ts * 2);
                }

                // Elite room â€” orange border
                if (room.type === ROOM_TYPE.ELITE) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(rx + ts, ry + ts, rw - ts * 2, rh - ts * 2);
                    ctx.restore();
                }
            }
        }

        hexToRg(hex) {
            // Safe hex-to-rgb, returns '255,255,255' on any parse error
            try {
                const h = hex.replace('#', '');
                if (h.length < 6) return '255, 255, 255';
                const r = parseInt(h.slice(0, 2), 16);
                const g = parseInt(h.slice(2, 4), 16);
                const b = parseInt(h.slice(4, 6), 16);
                return `${r}, ${g}, ${b}`;
            } catch (e) {
                return '255, 255, 255';
            }
        }

        // Called at runtime when a new room is discovered
        addTorchesForRoom(room) {
            const positions = [
                { x: room.x + Math.floor(room.w / 2), y: room.y },
                { x: room.x + Math.floor(room.w / 2), y: room.y + room.h - 1 },
                { x: room.x,                          y: room.y + Math.floor(room.h / 2) },
                { x: room.x + room.w - 1,             y: room.y + Math.floor(room.h / 2) },
            ];
            for (const pos of positions) {
                // Avoid duplicates
                const already = this.torchPositions.some(t => t.x === pos.x && t.y === pos.y);
                if (!already && this.grid[pos.y]?.[pos.x] === TILE.WALL) {
                    this.torchPositions.push({ ...pos, flickerOffset: Math.random() * Math.PI * 2 });
                }
            }
        }
    }

    // Module-level hex â†’ 'R, G, B' helper
    function hexToRg(hex) {
        try {
            const h = (hex || '').replace('#', '');
            if (h.length < 6) return '124, 58, 237';
            return `${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}`;
        } catch(e) { return '124, 58, 237'; }
    }

    return {
        TILE_SIZE,
        TILE,
        ROOM_TYPE,
        THEMES,
        getTheme,
        hexToRg,
        DungeonLevel,
    };
})();
