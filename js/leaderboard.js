/* ============================================
   LEADERBOARD — Score tracking & display
   ============================================ */

const Leaderboard = (() => {
    let currentSort = 'score';

    function getEntries(sortBy = 'score') {
        const accounts = Auth.getAccounts();
        const entries = [];

        for (const key in accounts) {
            const acc = accounts[key];
            if (!acc || typeof acc !== 'object') continue;

            const stats = acc.stats || {};
            const totalRuns = Number(stats.totalRuns) || 0;
            if (totalRuns <= 0) continue;

            entries.push({
                username: acc.username || key,
                score: Number(stats.bestScore) || 0,
                floors: Number(stats.bestFloor) || 0,
                kills: Number(stats.totalKills) || 0,
                runs: totalRuns,
            });
        }

        // Sort
        entries.sort((a, b) => {
            switch (sortBy) {
                case 'score': return b.score - a.score;
                case 'floors': return b.floors - a.floors;
                case 'kills': return b.kills - a.kills;
                default: return b.score - a.score;
            }
        });

        return entries;
    }

    function render(sortBy = 'score') {
        currentSort = sortBy;
        const container = document.getElementById('leaderboard-table');
        const entries = getEntries(sortBy);
        const currentUser = Auth.getCurrentUser();
        const currentUsername = currentUser ? currentUser.username : '';

        if (entries.length === 0) {
            container.innerHTML = '<div class="lb-empty">No scores yet. Be the first to enter the depths!</div>';
            return;
        }

        let html = '';
        const top = Math.min(entries.length, 10);

        for (let i = 0; i < top; i++) {
            const e = entries[i];
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const rankLabel = i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1);
            const isSelf = e.username === currentUsername ? ' self' : '';

            let valueDisplay;
            switch (sortBy) {
                case 'score': valueDisplay = Utils.formatNumber(e.score); break;
                case 'floors': valueDisplay = `Floor ${e.floors}`; break;
                case 'kills': valueDisplay = `${Utils.formatNumber(e.kills)} kills`; break;
                default: valueDisplay = Utils.formatNumber(e.score);
            }

            html += `
                <div class="lb-entry${isSelf}">
                    <div class="lb-rank ${rankClass}">${rankLabel}</div>
                    <div class="lb-name">${e.username}${isSelf ? ' (You)' : ''}</div>
                    <div class="lb-value">${valueDisplay}</div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function init() {
        // Tab switching
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                render(tab.dataset.sort);
            });
        });
    }

    return { render, init, getEntries };
})();
