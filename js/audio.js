/* ============================================
   AUDIO — Sound effects using Web Audio API
   ============================================ */

const Audio = (() => {
    let ctx = null;
    let sfxEnabled = true;
    let musicEnabled = true;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return ctx;
    }

    // Generate a simple oscillator-based sound effect
    function playSFX(type) {
        if (!sfxEnabled) return;
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);

        switch(type) {
            case 'hit':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.15);
                gain.gain.setValueAtTime(0.15, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.15);
                break;
            case 'slash':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.1);
                gain.gain.setValueAtTime(0.12, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.1);
                break;
            case 'pickup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.15);
                gain.gain.setValueAtTime(0.1, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.2);
                break;
            case 'dash':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.08);
                gain.gain.setValueAtTime(0.08, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.1);
                break;
            case 'death':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.5);
                gain.gain.setValueAtTime(0.2, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.5);
                break;
            case 'levelup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, c.currentTime);
                osc.frequency.setValueAtTime(500, c.currentTime + 0.1);
                osc.frequency.setValueAtTime(700, c.currentTime + 0.2);
                osc.frequency.setValueAtTime(900, c.currentTime + 0.3);
                gain.gain.setValueAtTime(0.1, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.5);
                break;
            case 'coin':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.08);
                gain.gain.setValueAtTime(0.08, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.12);
                break;
            case 'enemydeath':
                osc.type = 'square';
                osc.frequency.setValueAtTime(250, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.2);
                gain.gain.setValueAtTime(0.1, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.2);
                break;
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, c.currentTime);
                gain.gain.setValueAtTime(0.05, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.05);
                break;
        }
    }

    let musicInterval = null;
    let musicIndex = 0;
    const musicNotes = [
        110.00, 110.00, 130.81, 110.00, // A2, A2, C3, A2
        87.31, 87.31, 98.00, 98.00     // F2, F2, G2, G2
    ];

    function startMusic() {
        if (!musicEnabled) return;
        stopMusic();
        
        const c = getCtx();
        musicIndex = 0;
        musicInterval = setInterval(() => {
            if (!musicEnabled) return;
            try {
                if (c.state === 'suspended') {
                    c.resume();
                }
                
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.connect(gain);
                gain.connect(c.destination);
                
                const note = musicNotes[musicIndex % musicNotes.length];
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(note, c.currentTime);
                
                // Subtle volume
                gain.gain.setValueAtTime(0.018, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.36);
                
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.38);
                
                musicIndex++;
            } catch(e) {
                // Ignore audio context errors
            }
        }, 400);
    }

    function stopMusic() {
        if (musicInterval) {
            clearInterval(musicInterval);
            musicInterval = null;
        }
    }

    return {
        playSFX,
        startMusic,
        stopMusic,
        setSFXEnabled(v) { sfxEnabled = v; },
        setMusicEnabled(v) { 
            musicEnabled = v; 
            if (!musicEnabled) {
                stopMusic();
            } else {
                if (typeof Game !== 'undefined' && Game.running && !Game.paused) {
                    startMusic();
                }
            }
        },
        get sfxEnabled() { return sfxEnabled; },
        get musicEnabled() { return musicEnabled; }
    };
})();
