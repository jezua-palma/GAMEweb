/* ============================================
   STORY - Story mode chapters, dialogue, quests
   ============================================ */

const Story = (() => {
    const CHAPTERS = [
        {
            id: 'chapter_1',
            title: 'Chapter I - The Forest Breach',
            intro: [
                { speaker: 'Commander Vale', text: 'You wake beneath the old canopy. Follow the trail markers and seal the breach.' },
                { speaker: 'Commander Vale', text: 'Do not rush. Gather relics, clear the paths, and thin the hostiles before you advance.' },
            ],
            bossWarn: [
                { speaker: 'Commander Vale', text: 'Commander-class signal ahead. Hold your ground and break their line.' },
            ],
            complete: [
                { speaker: 'Commander Vale', text: 'Good. The first trail is clear. Press onward.' },
            ],
        },
        {
            id: 'chapter_2',
            title: 'Chapter II - Riverfen Conspiracy',
            intro: [
                { speaker: 'Scout Ilya', text: 'These crossings are occupied. You need relic evidence before command can sanction a purge.' },
            ],
            bossWarn: [
                { speaker: 'Scout Ilya', text: 'Bio-signature spike detected. Rat King class target beyond the next bridge.' },
            ],
            complete: [
                { speaker: 'Scout Ilya', text: 'Evidence confirmed. We can now escalate the operation.' },
            ],
        },
        {
            id: 'chapter_3',
            title: 'Chapter III - Emberwood Front',
            intro: [
                { speaker: 'Archivist Nera', text: 'The emberwood is active. Preserve relic fragments and deny the enemy control.' },
            ],
            bossWarn: [
                { speaker: 'Archivist Nera', text: 'Thermal reading is unstable. Expect continuous pressure.' },
            ],
            complete: [
                { speaker: 'Archivist Nera', text: 'The ashline is broken. Proceed while the trail is still clear.' },
            ],
        },
        {
            id: 'chapter_4',
            title: 'Chapter IV - Starfall Protocol',
            intro: [
                { speaker: 'Commander Vale', text: 'No retreat now. You must sustain pressure and secure enough relic mass to continue.' },
            ],
            bossWarn: [
                { speaker: 'Commander Vale', text: 'Wraith contact in the glade. Keep moving and do not let it dictate range.' },
            ],
            complete: [
                { speaker: 'Commander Vale', text: 'Starfall route stabilized. Final sector is in reach.' },
            ],
        },
        {
            id: 'chapter_5',
            title: 'Chapter V - Nightbloom Stand',
            intro: [
                { speaker: 'Commander Vale', text: 'Final grove. Complete every objective and finish this war.' },
            ],
            bossWarn: [
                { speaker: 'Commander Vale', text: 'Overlord signature confirmed. This is the end of the line.' },
            ],
            complete: [
                { speaker: 'Commander Vale', text: 'Target neutralized. Exfil route unlocked. You did it.' },
            ],
        },
    ];

    const MAX_DIALOGUE_QUEUE = 14;
    const LOCK_HINT_SECONDS = 2.8;

    let questState = null;
    let chapterIndex = 0;
    let chapterIntroShown = new Set();
    let chapterCompleteShown = new Set();

    let dialogueQueue = [];
    let currentLine = null;
    let blockingDialogue = false;
    let dialogueEnabled = true;

    let ui = {
        storyPanel: null,
        chapter: null,
        objective: null,
        progress: null,
        lockHint: null,
        dialogueOverlay: null,
        dialogueSpeaker: null,
        dialogueText: null,
        dialogueNextBtn: null,
        dialogueSkipBtn: null,
    };

    let lockHintTimer = 0;

    function init() {
        ui.storyPanel = document.getElementById('story-panel');
        ui.chapter = document.getElementById('story-chapter');
        ui.objective = document.getElementById('story-objective');
        ui.progress = document.getElementById('story-progress');
        ui.lockHint = document.getElementById('story-lockhint');
        ui.dialogueOverlay = document.getElementById('dialogue-overlay');
        ui.dialogueSpeaker = document.getElementById('dialogue-speaker');
        ui.dialogueText = document.getElementById('dialogue-text');
        ui.dialogueNextBtn = document.getElementById('dialogue-next-btn');
        ui.dialogueSkipBtn = document.getElementById('dialogue-skip-btn');

        if (ui.dialogueNextBtn) {
            ui.dialogueNextBtn.addEventListener('click', nextDialogueLine);
        }
        if (ui.dialogueSkipBtn) {
            ui.dialogueSkipBtn.addEventListener('click', skipDialogue);
        }
        if (ui.dialogueOverlay) {
            ui.dialogueOverlay.addEventListener('click', (event) => {
                if (event.target === ui.dialogueOverlay) nextDialogueLine();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (!currentLine) return;
            if (event.code === 'Enter' || event.code === 'Space') {
                nextDialogueLine();
                event.preventDefault();
            } else if (event.code === 'Escape') {
                skipDialogue();
                event.preventDefault();
            }
        });

        hideDialogue();
        updateQuestUi();
    }

    function setDialogueEnabled(enabled) {
        dialogueEnabled = !!enabled;
        if (!dialogueEnabled) {
            dialogueQueue = [];
            currentLine = null;
            blockingDialogue = false;
            hideDialogue();
        }
    }

    function resetRun(heroName, className) {
        chapterIndex = 0;
        chapterIntroShown = new Set();
        chapterCompleteShown = new Set();
        dialogueQueue = [];
        currentLine = null;
        blockingDialogue = false;
        lockHintTimer = 0;

        questState = {
            level: 1,
            stage: 1,
            totalFloor: 1,
            chapterTitle: CHAPTERS[0].title,
            objective: {
                killTarget: 0,
                eliteTarget: 0,
                treasureTarget: 0,
                bossTarget: 0,
                kills: 0,
                elites: 0,
                treasures: 0,
                bosses: 0,
                complete: false,
            },
        };

        queueDialogue([
            { speaker: 'System', text: `${heroName || 'Operative'} linked to channel.` },
            { speaker: 'System', text: `Class profile loaded: ${className || 'Unknown'}.` },
        ], { blocking: false });
        updateQuestUi();
    }

    function startStage({ level, stage, totalFloor, dungeon }) {
        chapterIndex = Utils.clamp((level || 1) - 1, 0, CHAPTERS.length - 1);
        const chapter = CHAPTERS[chapterIndex];
        const objective = buildObjective(level, stage, totalFloor, dungeon);

        questState = {
            level,
            stage,
            totalFloor,
            chapterTitle: chapter.title,
            objective,
        };

        const chapterKey = `${level}`;
        if (stage === 1 && !chapterIntroShown.has(chapterKey)) {
            chapterIntroShown.add(chapterKey);
            queueDialogue(chapter.intro, { blocking: true });
        }
        if (stage === 5) {
            queueDialogue(chapter.bossWarn, { blocking: true });
        }
        if (objective.treasureTarget > 0 && stage !== 5) {
            queueDialogue([
                { speaker: 'Scout Ilya', text: 'Treasure signatures nearby. Open marked chests and secure relic shards.' },
            ], { blocking: false });
        }

        updateQuestUi();
    }

    function buildObjective(level, stage, totalFloor, dungeon) {
        const rooms = dungeon?.rooms || [];
        const aliveInStage = rooms.reduce((sum, room) => sum + ((room.enemies && room.enemies.length) || 0), 0);
        const hasEliteRoom = rooms.some((room) => room.type === Dungeon.ROOM_TYPE.ELITE);
        const hasTreasureRoom = rooms.some((room) => room.type === Dungeon.ROOM_TYPE.TREASURE);

        const isBossStage = stage === 5;
        const killTarget = isBossStage
            ? 0
            : Math.max(5 + Math.floor(totalFloor * 0.35), Math.floor(aliveInStage * 0.75));
        const eliteTarget = isBossStage ? 0 : (hasEliteRoom ? 1 : 0);
        const treasureTarget = isBossStage ? 1 : (hasTreasureRoom ? 1 : 0);
        const bossTarget = isBossStage ? 1 : 0;

        return {
            killTarget,
            eliteTarget,
            treasureTarget,
            bossTarget,
            kills: 0,
            elites: 0,
            treasures: 0,
            bosses: 0,
            complete: false,
        };
    }

    function registerEnemyDefeat(enemy) {
        if (!questState || !questState.objective || questState.objective.complete) return;
        const o = questState.objective;
        o.kills += 1;
        if (enemy && enemy.isElite) o.elites += 1;
        evaluateObjective();
    }

    function registerTreasureCollected(itemType) {
        if (!questState || !questState.objective || questState.objective.complete) return;
        if (typeof itemType !== 'string' || !itemType.startsWith('treasure_')) return;
        questState.objective.treasures += 1;
        evaluateObjective();
    }

    function registerBossDefeat() {
        if (!questState || !questState.objective || questState.objective.complete) return;
        questState.objective.bosses = Math.max(questState.objective.bosses, 1);
        evaluateObjective();
    }

    function evaluateObjective() {
        const o = questState.objective;
        const complete =
            o.kills >= o.killTarget &&
            o.elites >= o.eliteTarget &&
            o.treasures >= o.treasureTarget &&
            o.bosses >= o.bossTarget;

        if (complete && !o.complete) {
            o.complete = true;
            showLockHint('Objective complete. Stairwell unlocked.');

            const chapterKey = `${questState.level}`;
            if (questState.stage === 5 && !chapterCompleteShown.has(chapterKey)) {
                chapterCompleteShown.add(chapterKey);
                const chapter = CHAPTERS[chapterIndex];
                queueDialogue(chapter.complete, { blocking: false });
            } else {
                queueDialogue([
                    { speaker: 'System', text: 'Quest complete. Proceed to the next stage.' },
                ], { blocking: false });
            }
        }

        updateQuestUi();
    }

    function getObjectiveLines() {
        if (!questState || !questState.objective) return ['Awaiting objective...'];
        const o = questState.objective;
        const lines = [];
        if (o.killTarget > 0) lines.push(`Neutralize hostiles: ${o.kills}/${o.killTarget}`);
        if (o.eliteTarget > 0) lines.push(`Elites down: ${o.elites}/${o.eliteTarget}`);
        if (o.treasureTarget > 0) lines.push(`Relics secured: ${o.treasures}/${o.treasureTarget}`);
        if (o.bossTarget > 0) lines.push(`Commander eliminated: ${o.bosses}/${o.bossTarget}`);
        if (!lines.length) lines.push('Reach the stairwell');
        return lines;
    }

    function getFirstMissingRequirement() {
        if (!questState || !questState.objective) return 'No active quest.';
        const o = questState.objective;
        if (o.kills < o.killTarget) return `Clear hostiles (${o.kills}/${o.killTarget})`;
        if (o.elites < o.eliteTarget) return `Eliminate elite guard (${o.elites}/${o.eliteTarget})`;
        if (o.treasures < o.treasureTarget) return `Collect relics (${o.treasures}/${o.treasureTarget})`;
        if (o.bosses < o.bossTarget) return 'Defeat the chapter commander';
        return 'Objective complete';
    }

    function canUseStairs() {
        if (!questState || !questState.objective) return true;
        return !!questState.objective.complete;
    }

    function onExitBlocked() {
        showLockHint(`Stairs locked: ${getFirstMissingRequirement()}`);
        queueDialogue([
            { speaker: 'System', text: `Route denied. ${getFirstMissingRequirement()}.` },
        ], { blocking: false });
    }

    function showLockHint(text) {
        if (!ui.lockHint) return;
        ui.lockHint.textContent = text;
        ui.lockHint.classList.remove('hidden');
        lockHintTimer = LOCK_HINT_SECONDS;
    }

    function queueDialogue(lines, options = {}) {
        if (!Array.isArray(lines) || lines.length === 0) return;
        const blocking = !!options.blocking;
        if (!dialogueEnabled && !blocking) return;

        for (const line of lines) {
            if (!line || !line.text) continue;
            dialogueQueue.push({
                speaker: line.speaker || 'Unknown',
                text: line.text,
                blocking,
            });
        }

        if (dialogueQueue.length > MAX_DIALOGUE_QUEUE) {
            dialogueQueue = dialogueQueue.slice(dialogueQueue.length - MAX_DIALOGUE_QUEUE);
        }
        if (!currentLine) nextDialogueLine();
    }

    function nextDialogueLine() {
        if (!dialogueQueue.length) {
            currentLine = null;
            blockingDialogue = false;
            hideDialogue();
            return;
        }
        currentLine = dialogueQueue.shift();
        blockingDialogue = !!currentLine.blocking;
        drawDialogue(currentLine);
    }

    function skipDialogue() {
        if (!currentLine && !dialogueQueue.length) return;
        currentLine = null;
        dialogueQueue = [];
        blockingDialogue = false;
        hideDialogue();
    }

    function drawDialogue(line) {
        if (!ui.dialogueOverlay || !ui.dialogueSpeaker || !ui.dialogueText) return;
        ui.dialogueSpeaker.textContent = line.speaker;
        ui.dialogueText.textContent = line.text;
        ui.dialogueOverlay.classList.remove('hidden');
    }

    function hideDialogue() {
        if (ui.dialogueOverlay) ui.dialogueOverlay.classList.add('hidden');
    }

    function updateQuestUi() {
        if (!ui.storyPanel || !ui.chapter || !ui.objective || !ui.progress) return;
        if (!questState) {
            ui.storyPanel.classList.add('hidden');
            return;
        }

        ui.storyPanel.classList.remove('hidden');
        ui.chapter.textContent = questState.chapterTitle || 'Story Mode';
        const lines = getObjectiveLines();
        ui.objective.textContent = lines[0] || 'Awaiting objective...';
        ui.progress.textContent = lines.slice(1).join(' | ') || (questState.objective?.complete ? 'Objective complete' : 'In progress');

        if (questState.objective?.complete) {
            ui.storyPanel.classList.add('quest-done');
        } else {
            ui.storyPanel.classList.remove('quest-done');
        }
    }

    function update(dt) {
        if (lockHintTimer > 0) {
            lockHintTimer = Math.max(0, lockHintTimer - dt);
            if (lockHintTimer <= 0 && ui.lockHint) {
                ui.lockHint.classList.add('hidden');
            }
        }
    }

    function isBlocking() {
        return !!currentLine && !!blockingDialogue;
    }

    function getQuestComplete() {
        return !!(questState && questState.objective && questState.objective.complete);
    }

    return {
        init,
        setDialogueEnabled,
        resetRun,
        startStage,
        registerEnemyDefeat,
        registerTreasureCollected,
        registerBossDefeat,
        canUseStairs,
        onExitBlocked,
        queueDialogue,
        update,
        isBlocking,
        getQuestComplete,
    };
})();
