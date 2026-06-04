# Art Pack Integration

This folder drives sprite overrides used by `js/dungeon.js`, `js/player.js`, `js/enemy.js`, and `js/boss.js`.

## Files
- `pack_manifest.json`: Active mapping file loaded at runtime.
- `pack_manifest.example.json`: Template with the full key list.
- `base/`: Built-in SVG fallback set (ships with this project).

## How It Works
1. The game tries to load `assets/kenney/pack_manifest.json`.
2. If a key exists and the file path is valid, that sprite is used.
3. Missing keys automatically fall back to built-in rendering:
- Dungeon tiles and props: procedural + bundled SVGs in `base/`
- Character/enemy/boss sheets: generated fallback sprite sheets from `js/sprites.js`

## Quick Swap To External Free Packs
1. Download free assets (examples):
   - Tiny Dungeon (Kenney, CC0, includes characters + monsters + props): https://kenney-assets.itch.io/tiny-dungeon
   - Top Down Dungeon Pack (OpenGameArt, CC0 tiles): https://opengameart.org/content/top-down-dungeon-pack
   - Pixel Crawler free pack (tiles + heroes + enemies): https://anokolisa.itch.io/free-pixel-art-asset-pack-topdown-tileset-rpg-16x16-sprites
   - More CC0 sprite packs: https://itch.io/game-assets/assets-cc0/tag-sprites
2. Extract to `assets/kenney/imported/`.
3. Copy `pack_manifest.example.json` to `pack_manifest.json`.
4. Update sprite paths to match your extracted filenames.
5. Refresh browser with cache disabled once (`Ctrl+F5`).

## Required Key Names
- Core tiles:
  - `tile_floor` or `tile_floor_1..tile_floor_5`
  - `tile_wall` or `tile_wall_1..tile_wall_5`
  - Optional autotile mask overrides:
    - `tile_floor_<level>_m<mask>`
    - `tile_wall_<level>_m<mask>`
    - where `<mask>` uses cardinal bits `N=1, E=2, S=4, W=8` (0 to 15)
  - `tile_stairs`
  - `tile_chest`
- Optional props:
  - `setpiece_crate`, `setpiece_barrel`, `setpiece_brazier`, `setpiece_crystal_cluster`
  - plus any additional keys already listed in `pack_manifest.example.json`

## Sprite Sheet Keys
- Add character/enemy sheets under `spriteSheets` in the manifest:
  - `player_warrior`, `player_rogue`, `player_mage`, `player_paladin`
  - `enemy_skeleton`, `enemy_archer`, `enemy_mage`, `enemy_slime`, `enemy_bat`
  - `boss_titan` (or specific boss keys like `boss_<id>`)
- Expected default layout:
  - `4 columns x 4 rows`
  - row mapping: `down`, `side`, `up`, `attack`
  - left-facing uses horizontal flip of side row
