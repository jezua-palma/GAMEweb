# Shadow Depths

A fully responsive, browser-based 2D roguelike dungeon crawler built with vanilla JavaScript, HTML5 Canvas, and CSS3.

## Project Structure

The project code is organized logically by architectural domains:

```text
GAMEweb/
|-- index.html            # Main entry point and UI markup
|-- css/
|   `-- styles.css        # Comprehensive design system and responsive media queries
|-- assets/
|   |-- kenney/           # Battlefield sprite manifest + fallback SVG art
|   |-- images/           # Image assets (sprites, icons)
|   `-- sounds/           # Audio assets (SFX, BGM)
`-- js/
    |-- core/             # Engine foundation
    |   |-- main.js       # Game loop initialization
    |   |-- game.js       # Core orchestration and state
    |   |-- utils.js      # Math, formatting, and helper tools
    |   |-- sprites.js    # Shared sprite + sprite-sheet asset loader
    |   |-- audio.js      # Sound manager
    |   `-- particles.js  # VFX and combat text engine
    |
    |-- entities/         # Actors and definitions
    |   |-- player.js     # Player class logic, movement, and abilities
    |   |-- characters.js # Hero definitions, upgrade pool, and XP scaling
    |   |-- enemy.js      # Basic enemy AI and spawner
    |   `-- boss.js       # Multi-stage boss AI and specific boss logic
    |
    |-- world/            # Environment generation
    |   |-- dungeon.js    # Procedural BSP dungeon generator
    |   `-- items.js      # Loot, chests, and drops
    |
    |-- systems/          # Game rules
    |   `-- combat.js     # Damage resolution and collision checks
    |
    `-- ui/               # Interface layers
        |-- hud.js        # In-game overlays, minimap, and resource bars
        |-- auth.js       # LocalStorage account auth + Google login/recovery flow
        `-- leaderboard.js# LocalStorage scoring system
```

## How to Run
1. Double-click `start_server.bat` to launch the local multiplayer Python server.
2. Open your browser and navigate to `http://localhost:8080`.
3. For LAN testing, use the printed `LAN URL` on another device connected to the same Wi-Fi/network.
4. If LAN access is blocked, allow `python.exe` through Windows Firewall.

## Public Testing URL
Google OAuth does not accept private LAN origins such as `http://192.168.x.x:8080`.

To test Google login from phones or outside your PC:
1. Double-click `start_public_tunnel.bat`.
2. Wait for the generated Cloudflare URL, for example `https://example.trycloudflare.com`.
3. In Google Cloud Console, add that exact origin under **Authorized JavaScript origins**.
4. Open the same public HTTPS URL on your test device.

Notes:
- Do not include `/index.html` or any path in Google Cloud, only the origin.
- Temporary tunnel URLs change when restarted, so Google Cloud must be updated with the new URL each time.
- For a permanent public setup, deploy to a stable domain and add that exact `https://your-domain.com` origin.

## Notes
- The app supports both JS layouts automatically:
  - modular: `js/core`, `js/ui`, `js/entities`, `js/world`, `js/systems`
  - flat: `js/*.js`
- `organize_project.bat` is optional and can still be used if you want the modular folder structure.
- Backend server file: `shadow_server.py`
- SQLite database file (auto-created): `shadow_depths.db`

## Local Save Database
- A built-in browser save database is now enabled using `localStorage`.
- Save keys:
  - `shadow_depths_accounts` (accounts + leaderboard stats)
  - `shadow_depths_settings` (game settings)
  - `shadow_depths_run_saves` (per-account checkpoint for Continue Run)
- The game autosaves every ~12 seconds while playing, and also on pause/quit.
- On death (game over), the checkpoint is cleared.

## Authentication (Google + Forgot Password)
- Login now supports `username` or `email`.
- Registration now requires email (used for recovery verification).
- Forgot password requires Google verification and only works when the verified Google email matches the account email.
- Google login is configured globally with the project's OAuth Web Client ID in `index.html`.

### Google Setup
1. Keep this Client ID in `index.html`:
   - `818804477360-rlcboqf98fuiecvelshrg194n4a0tq53.apps.googleusercontent.com`
2. In Google Cloud Console, make sure every valid testing origin is added to **Authorized JavaScript origins**:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`
   - a public HTTPS origin, for example `https://example.trycloudflare.com`
3. Reload the page.

Do not add `http://192.168.x.x:8080` for Google login. Google Cloud rejects private LAN IP origins because they are not public top-level domains. LAN can still be used for non-Google testing.

If a browser has an older saved Client ID, the global ID in `index.html` now takes priority.

## Multiplayer Features (LAN)
- Real database-backed account session for online play.
- Friend system:
  - Send/accept friend requests
  - Friend presence (online / in run / stage)
- Direct messages:
  - Chat with accepted friends
- Party system:
  - Create party
  - Invite friends
  - Accept/decline party invites
  - View member live status
- In-game live presence sync:
  - While running a dungeon, friends and party can see your current level/stage/floor state.
  - Party members now appear in a live in-game panel (sync status and floor match).
  - Same-floor party members are shown as cyan ghost markers on the battlefield.
- True co-op combat sync (new pass):
  - Party leader publishes shared combat state for each stage.
  - Teammate hits are replicated through the server and merged into shared enemy HP.
  - Co-op loot ownership uses first-claim locking so one drop cannot be taken by multiple players.
  - Stage generation uses deterministic party-based seeding to keep enemy IDs/state aligned across clients.

## Soul Knight-Inspired Pass
- Added room event flow with modal interactions:
  - Blessing Statue (rest room buffs)
  - Black-Market Dealer (buy upgrades)
  - Pressure Beacon challenge (optional ambush + rewards)
- Combat pacing has been tuned up with faster pressure scaling and quicker player attack cadence.
- Third pass polish added:
  - Threat + combo + skill-ready HUD indicators
  - Combat toast callouts (elite room, vault, boss signal, room clear)
  - Low-HP HUD pulse feedback for clearer danger state

## Next Phase Combat Pass
- Tactical enemy AI upgrades:
  - Ranged enemies now kite and strafe instead of only walking straight.
  - Mages and bosses use predictive shots and pressure-based bursts.
  - Enemy line-of-sight checks reduce unfair shooting through walls.
  - Anti-clump steering gives enemies more natural spacing in fights.
- Encounter pacing upgrades:
  - Spawn composition has higher enemy variety (less repeated same-type packs).
  - Adaptive reinforcement limits prevent sudden overstacking in small rooms.
  - Elite and higher-floor waves scale with pressure while keeping fair caps.

## Battlefield Asset Pipeline (Option 1)
- Added a sprite-manifest pipeline in `assets/kenney/pack_manifest.json`.
- Dungeon rendering now supports:
  - Sprite-based floor/wall/stairs/chest tiles
  - Thematic set-piece props with weighted generation per level
  - Primitive fallback rendering when a sprite key is missing
- Character, enemy, and boss rendering now support sprite sheets through `js/sprites.js`:
  - Class-based player sheets
  - Enemy-type sheets (slime/bat/humanoid variants)
  - Boss sheet fallback support
- Biome autotiling now applies neighbor-mask blending and optional mask-specific sprite keys:
  - `tile_floor_<level>_m<mask>`
  - `tile_wall_<level>_m<mask>`
- Built-in starter art is included in `assets/kenney/base/*.svg`.
- To swap to external free assets:
  1. Put your downloaded files under `assets/kenney/imported/`
  2. Copy `assets/kenney/pack_manifest.example.json` to `assets/kenney/pack_manifest.json`
  3. Update paths in the active manifest to your real files
