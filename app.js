// ==========================================
// 1. FIREBASE ARCHITECTURE ENGINE CONNECTION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDqPW29KXThcbSTfXPS-waSJu4QG7xPgXQ",
    authDomain: "newsmashers.firebaseapp.com",
    databaseURL: "https://newsmashers-default-rtdb.firebaseio.com/", 
    projectId: "newsmashers",
    storageBucket: "newsmashers.appspot.com",
    messagingSenderId: "997853309944",
    appId: "1:997853309944:web:9f9f29d130915f25a1c40d"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let isAdmin = false;

function checkUserRolePermissions() {
    const urlParams = new URLSearchParams(window.location.search);
    let role = urlParams.get('role');
    
    if (!role && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        role = 'admin';
        window.history.replaceState(null, '', window.location.pathname + '?role=admin');
    }
    
    if (role === 'admin') {
        isAdmin = true;
        document.getElementById("appTitleHeader").innerText = "NewSmashers [ADMIN]";
    } else {
        isAdmin = false;
        document.getElementById("appTitleHeader").innerText = "NewSmashers Live View";
        document.getElementById("appTaglineBanner").innerText = "🔴 Live Match Update Stream";
        stripAdminControlsFromDOM();
    }
}

function stripAdminControlsFromDOM() {
    const adminMenuBtn = document.querySelector("#mainMenu .primary-btn");
    if (adminMenuBtn) adminMenuBtn.remove();
    
    const adminSettingsBtn = document.querySelectorAll("#mainMenu .menu-btn")[1];
    if (adminSettingsBtn) adminSettingsBtn.remove();

    const clearHist = document.getElementById("adminClearHistoryBtnElement");
    if (clearHist) clearHist.remove();

    const activeFaceoffPanel = document.getElementById("activeMatchupCardPanel");
    if (activeFaceoffPanel) activeFaceoffPanel.remove();

    const undoBtn = document.getElementById("adminUndoBtnElement");
    if (undoBtn) undoBtn.remove();
}

// ==========================================
// 2. MASTER SQUAD DATABASE & SNAPSHOT MODELS
// ==========================================
const MASTER_ROSTER = [
    "Abbas", "David", "Gaja", "Karthi Anna", "Karthi S G", 
    "Karthik Bro", "Logan", "Madhan", "Praveen", "Raj", 
    "Rajesh", "Ramesh", "Ram", "Senthil", "Sun", 
    "Suresh", "Thamizh", "Thiyagu", "Vicky", "XYZ1", "XYZ2", "XYZ3"
];

let teamAPlayers = [];
let teamBPlayers = [];
let currentStrikerName = ""; 
let currentBowlerName = "";  

let totalRuns = 0;
let totalWickets = 0;
let totalBalls = 0;
let currentTeamA = "";
let currentTeamB = "";
let currentInnings = 1;
let firstInningsScore = 0;
let firstInningsWickets = 0;
let firstInningsFours = 0;
let totalTeamFours = 0; 
let ballHistory = [];
let matchEnded = false;

let matchHistory = JSON.parse(localStorage.getItem("ns_match_history")) || [];
let appSettings = JSON.parse(localStorage.getItem("ns_settings")) || {
    vibrateOnBall: false,
    confirmUndo: false
};

// ==========================================
// 3. NAVIGATION CONTROLLERS
// ==========================================
function showMainMenu() { hideAllViews(); document.getElementById("mainMenu").classList.remove("hidden"); }
function showMatchForm() { hideAllViews(); document.getElementById("matchForm").classList.remove("hidden"); }

function showMatchHistory() { 
    hideAllViews(); 
    document.getElementById("matchHistoryView").classList.remove("hidden"); 
    const filterDropdown = document.getElementById("leaderboardFilterScope");
    if (filterDropdown) { filterDropdown.value = "overall"; }
    document.getElementById("dateFilterGroup").classList.add("hidden");
    document.getElementById("monthFilterGroup").classList.add("hidden");
    renderMatchHistory(); 
}

function showSettings() { hideAllViews(); document.getElementById("settingsView").classList.remove("hidden"); loadSettingsUI(); }

function hideAllViews() {
    const views = ["mainMenu", "matchForm", "scoreboard", "matchHistoryView", "settingsView"];
    views.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });
}

// ==========================================
// 4. BROADCASTING LIVE DATA PACKAGES TO CLOUD
// ==========================================
function broadcastLiveStateToFirebase() {
    if (!isAdmin) return; 
    
    const dataPayload = {
        currentTeamA, currentTeamB, totalRuns, totalWickets, totalBalls,
        currentInnings, firstInningsScore, firstInningsWickets, firstInningsFours,
        totalTeamFours, matchEnded, currentStrikerName, currentBowlerName,
        teamAPlayers, teamBPlayers
    };
    database.ref("live_match_stream").set(dataPayload);
}

// ==========================================
// 5. MATCH INITIALIZATION ENGINE
// ==========================================
function createMatch() {
    let teamA = document.getElementById("teamA").value.trim();
    let teamB = document.getElementById("teamB").value.trim();

    if (teamA === "" || teamB === "") {
        alert("Please fill all fields correctly");
        return;
    }

    currentTeamA = teamA; currentTeamB = teamB;
    totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0;
    ballHistory = []; currentInnings = 1;
    firstInningsScore = 0; firstInningsWickets = 0; firstInningsFours = 0;
    currentStrikerName = ""; currentBowlerName = ""; matchEnded = false;

    teamAPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));
    teamBPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));

    document.getElementById("teamAHeaderBanner").innerText = `${currentTeamA} SQUAD SHEET`;
    document.getElementById("teamBHeaderBanner").innerText = `${currentTeamB} SQUAD SHEET`;

    updateScoreboardDisplay();
    renderDualMatrixUI();
    rebuildActiveDropdownOptions();

    hideAllViews();
    document.getElementById("scoreboard").classList.remove("hidden");
    
    broadcastLiveStateToFirebase();
}

function createPlayerObject(id, name) {
    return { id, name, enabled: false, ballsFaced: 0, currentOverBalls: 0, foursHit: 0, isOut: false, ballsBowled: 0, wicketsTaken: 0, fieldingPoints: 0 };
}

function toggleMatrixPlayerRow(teamSide, id, isChecked) {
    if (matchEnded) return;
    let targetList = teamSide === 'A' ? teamAPlayers : teamBPlayers;
    let player = targetList.find(p => p.id === id);
    if (player) {
        player.enabled = isChecked;
        renderDualMatrixUI();
        rebuildActiveDropdownOptions();
        broadcastLiveStateToFirebase();
    }
}

// ==========================================
// 6. MATRIX SCOREBOARD WORKBOARD COMPONENT
// ==========================================
function renderDualMatrixUI() {
    renderSideContainer("teamAMatrixContainer", teamAPlayers, 'A');
    renderSideContainer("teamBMatrixContainer", teamBPlayers, 'B');
}

function renderSideContainer(containerId, playersList, sideCode) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let sortedPlayers = [...playersList].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));

    let html = "";
    sortedPlayers.forEach(p => {
        const bgStyle = p.enabled ? "background: #1e293b;" : "background: #1e293b; opacity: 0.35;";
        const disabledAttr = p.enabled ? "" : "disabled";
        const checkedAttr = p.enabled ? "checked" : "";
        const outStyle = p.isOut ? "text-decoration: line-through; color: #ef4444;" : "";

        const controlButtonsHTML = isAdmin ? `
            <div style="display: flex; align-items: center; gap: 3px;">
                <span style="font-size: 14px;">🏏</span>
                <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'dot')" style="padding: 4px 8px; background:#475569; color:#fff; border:none; border-radius:4px; font-size:11px;">Dot</button>
                <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'four')" style="padding: 4px 8px; background:#2563eb; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold;">+4</button>
                <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'out-btn')" style="padding: 4px 8px; background:#dc2626; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold;">OUT</button>
            </div>
            <div style="display: flex; align-items: center; gap: 3px;">
                <span style="font-size: 14px;">🏃</span>
                <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'bowl-ball')" style="padding: 4px 6px; background:#334155; color:#94a3b8; border:none; border-radius:4px; font-size:11px;">Ball (${p.ballsBowled})</button>
                <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'bowl-wicket')" style="padding: 4px 6px; background:#dc2626; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold;">W (${p.wicketsTaken})</button>
            </div>
            <button class="action-trigger" ${disabledAttr} onclick="executeDirectAction('${sideCode}', ${p.id}, 'field-point')" style="padding: 4px 8px; background:#10b981; color:#fff; border:none; border-radius:4px; font-size:11px;">Pts (${p.fieldingPoints})</button>
        ` : `
            <div style="font-size:12px; color:#94a3b8;">
                Bowling: <b>${p.ballsBowled} b (${p.wicketsTaken} W)</b> | Fielding Pts: <b style="color:#10b981;">${p.fieldingPoints}</b>
            </div>
        `;

        html += `
            <div class="player-matrix-row" style="${bgStyle} padding: 10px; margin-bottom: 6px; border-radius: 8px; border: 1px solid #334155;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${isAdmin ? `<input type="checkbox" ${checkedAttr} onclick="toggleMatrixPlayerRow('${sideCode}', ${p.id}, this.checked)" style="transform: scale(1.2); cursor: pointer;">` : '🏃'}
                        <span style="font-weight: bold; font-size: 14px; color: #fff; ${outStyle}">${p.name}</span>
                        ${p.ballsFaced > 0 && !p.isOut ? `<span style="font-size:11px; color:#94a3b8;">(${p.ballsFaced}b faced / Over: ${p.currentOverBalls}b)</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        ${p.isOut ? '<span style="background:#ef4444; color:#fff; padding:1px 4px; font-size:10px; border-radius:4px; font-weight:bold;">OUT</span>' : ''}
                        ${p.foursHit > 0 && !p.isOut ? `<span style="background:#2563eb; color:#fff; padding:1px 4px; font-size:10px; border-radius:4px; font-weight:bold;">★ ${p.foursHit} FOURS</span>` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 4px; justify-content: space-between; align-items: center;">
                    ${controlButtonsHTML}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function rebuildActiveDropdownOptions() {
    if (!isAdmin) return;
    const batSelect = document.getElementById("activeBatsmanSelect");
    const bowlSelect = document.getElementById("activeBowlerSelect");
    if (!batSelect || !bowlSelect) return;

    let currentBattingPool = currentInnings === 1 ? teamAPlayers : teamBPlayers;
    let currentBowlingPool = currentInnings === 1 ? teamBPlayers : teamAPlayers;

    let batHtml = `<option value="">-- Choose Batsman --</option>`;
    currentBattingPool.filter(p => p.enabled && !p.isOut).forEach(p => {
        batHtml += `<option value="${p.name}" ${p.name === currentStrikerName ? "selected" : ""}>${p.name}</option>`;
    });
    batSelect.innerHTML = batHtml;

    let bowlHtml = `<option value="">-- Choose Bowler --</option>`;
    currentBowlingPool.filter(p => p.enabled).forEach(p => {
        bowlHtml += `<option value="${p.name}" ${p.name === currentBowlerName ? "selected" : ""}>${p.name} (${p.ballsBowled}b)</option>`;
    });
    bowlSelect.innerHTML = bowlHtml;
}

function changeActiveStriker(name) { currentStrikerName = name; broadcastLiveStateToFirebase(); }
function changeActiveBowler(name) { currentBowlerName = name; broadcastLiveStateToFirebase(); }

// ==========================================
// 7. REALTIME LIVE MATCH SCORING CONTROL
// ==========================================
function executeDirectAction(sideCode, playerId, type) {
    if (matchEnded && type !== 'field-point' && type !== 'bowl-ball' && type !== 'bowl-wicket') {
        alert("Match has finished!"); return;
    }

    let activePool = sideCode === 'A' ? teamAPlayers : teamBPlayers;
    let targetPlayer = activePool.find(p => p.id === playerId);
    if (!targetPlayer || !targetPlayer.enabled) return;

    if (appSettings.vibrateOnBall && navigator.vibrate) { navigator.vibrate(40); }

    ballHistory.push({
        type, side: sideCode, playerId, currentStrikerName, currentBowlerName,
        totalRuns, totalWickets, totalBalls, currentInnings, totalTeamFours, matchEnded,
        teamASnapshot: JSON.stringify(teamAPlayers), teamBSnapshot: JSON.stringify(teamBPlayers)
    });

    if (type === 'dot') {
        targetPlayer.ballsFaced += 1; targetPlayer.currentOverBalls += 1; totalBalls += 1;
        if (targetPlayer.currentOverBalls >= 6) {
            targetPlayer.isOut = true; totalWickets += 1;
            alert(` Wicket! ${targetPlayer.name} faced 6 balls without hitting a 4 boundary!`);
            currentStrikerName = ""; 
        }
    } 
    else if (type === 'four') {
        targetPlayer.ballsFaced += 1; targetPlayer.foursHit += 1; totalRuns += 4; totalTeamFours += 1; totalBalls += 1;
        targetPlayer.currentOverBalls = 0; 
        alert(`🎉 Face-off complete! ${targetPlayer.name} hit a 4!`);
        currentBowlerName = ""; 
    } 
    else if (type === 'out-btn') {
        targetPlayer.isOut = true; totalWickets += 1;
        alert(`❌ Wicket logged: ${targetPlayer.name} marked OUT.`);
        if (targetPlayer.name === currentStrikerName) currentStrikerName = "";
    }
    else if (type === 'bowl-ball') targetPlayer.ballsBowled += 1;
    else if (type === 'bowl-wicket') { targetPlayer.ballsBowled += 1; targetPlayer.wicketsTaken += 1; }
    else if (type === 'field-point') targetPlayer.fieldingPoints += 1;

    updateScoreboardDisplay();
    renderDualMatrixUI();
    rebuildActiveDropdownOptions();
    broadcastLiveStateToFirebase();
}

function undoLastBall() {
    if (ballHistory.length === 0) return;
    let lastEvent = ballHistory.pop();

    totalRuns = lastEvent.totalRuns; totalWickets = lastEvent.totalWickets; totalBalls = lastEvent.totalBalls;
    currentInnings = lastEvent.currentInnings; totalTeamFours = lastEvent.totalTeamFours;
    currentStrikerName = lastEvent.currentStrikerName; currentBowlerName = lastEvent.currentBowlerName;
    matchEnded = lastEvent.matchEnded || false;

    teamAPlayers = JSON.parse(lastEvent.teamASnapshot); teamBPlayers = JSON.parse(lastEvent.teamBSnapshot);

    updateScoreboardDisplay(); renderDualMatrixUI(); rebuildActiveDropdownOptions();
    broadcastLiveStateToFirebase();
}

function calculateDailySeriesWins() {
    let today = new Date();
    let currentY = today.getFullYear(); let currentM = today.getMonth() + 1; let currentD = today.getDate();
    let winA = 0, winB = 0;

    matchHistory.forEach(match => {
        let d = match.timestamp ? new Date(match.timestamp) : new Date(parseInt(match.id.replace("match_", "")));
        if (d && !isNaN(d.getTime()) && d.getFullYear() === currentY && (d.getMonth() + 1) === currentM && d.getDate() === currentD) {
            if (match.result && match.result.includes(currentTeamA)) winA++;
            if (match.result && match.result.includes(currentTeamB)) winB++;
        }
    });
    return { winA, winB };
}

function updateScoreboardDisplay() {
    let currentBattingPool = currentInnings === 1 ? teamAPlayers : teamBPlayers;
    let checkedActiveCount = currentBattingPool.filter(p => p.enabled).length || 10;

    document.getElementById("liveTeams").innerText = currentInnings === 1 
        ? `${currentTeamA} (Score: ${totalRuns} / ${totalWickets}) - 1st Innings`
        : `${currentTeamB} (Score: ${totalRuns} / ${totalWickets}) - 2nd Innings [Target: ${firstInningsScore + 1}]`;

    document.getElementById("liveFoursCounter").innerText = ` Total Team 4s: ${totalTeamFours}`;
    let series = calculateDailySeriesWins();
    document.getElementById("liveSeriesTracker").innerText = `Wins Tally Today: ${currentTeamA} (${series.winA}) - (${series.winB}) ${currentTeamB}`;

    // FIX 1: Cleared out recursive updates to fix infinite execution crashes
    if (currentInnings === 1 && totalWickets >= checkedActiveCount && checkedActiveCount > 0) {
        firstInningsScore = totalRuns; firstInningsWickets = totalWickets; firstInningsFours = totalTeamFours;
        alert(`1st Innings Complete! All batsmen out. ${currentTeamA} scored ${firstInningsScore} runs.`);
        currentInnings = 2; totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0; currentStrikerName = ""; currentBowlerName = "";
        
        renderDualMatrixUI(); 
        rebuildActiveDropdownOptions();
        broadcastLiveStateToFirebase();
    } else if (currentInnings === 2 && !matchEnded) {
        if (totalRuns > firstInningsScore) {
            matchEnded = true; alert(`Match Finished! ${currentTeamB} chased down the total!`);
            saveMatchToHistory(`${currentTeamB} won`);
        } else if (totalWickets >= checkedActiveCount && checkedActiveCount > 0) {
            matchEnded = true;
            if (totalRuns === firstInningsScore) { alert("Match Tied!"); saveMatchToHistory("Match Tied"); }
            else { alert(`${currentTeamA} won by defending their total!`); saveMatchToHistory(`${currentTeamA} won`); }
        }
    }
}

// ==========================================
// 8. DATA LEADERBOARD FILTERS & RECORD KEEPING
// ==========================================
function saveMatchToHistory(resultText = "Match Completed") {
    let matchPlayers = [];
    teamAPlayers.filter(p => p.enabled).concat(teamBPlayers.filter(p => p.enabled)).forEach(p => {
        matchPlayers.push({ name: p.name, fours: p.foursHit, isNotOut: !p.isOut && (p.ballsFaced > 0 || p.foursHit > 0), wickets: p.wicketsTaken, points: p.fieldingPoints });
    });

    const completedMatch = {
        id: "match_" + Date.now(), timestamp: new Date().toISOString(), teams: `${currentTeamA} vs ${currentTeamB}`, result: resultText,
        totals: `${currentTeamA}: ${firstInningsScore}/${firstInningsWickets} [${firstInningsFours}x4] | ${currentTeamB}: ${totalRuns}/${totalWickets} [${totalTeamFours}x4]`,
        players: matchPlayers
    };
    
    matchHistory.unshift(completedMatch);
    localStorage.setItem("ns_match_history", JSON.stringify(matchHistory));
    
    database.ref("tournament_match_history").set(matchHistory);
    broadcastLiveStateToFirebase();
}

function renderMatchHistory() {
    const historyContainer = document.getElementById("historyListContainer");
    if (!historyContainer) return;
    
    if (matchHistory.length === 0) {
        historyContainer.innerHTML = `<p style="text-align:center; opacity:0.6; padding: 20px;">No matches stored yet.</p>`; return;
    }

    let filterScope = document.getElementById("leaderboardFilterScope").value;
    let filteredMatches = [...matchHistory];

    if (filterScope === "date") {
        let dateInput = document.getElementById("filterSpecificDate").value;
        if (dateInput) {
            filteredMatches = filteredMatches.filter(m => {
                let mD = new Date(m.timestamp), tD = new Date(dateInput);
                return mD.getFullYear() === tD.getFullYear() && mD.getMonth() === tD.getMonth() && mD.getDate() === tD.getDate();
            });
        }
    } else if (filterScope === "month") {
        let monthInput = document.getElementById("filterSpecificMonth").value;
        if (monthInput) {
            filteredMatches = filteredMatches.filter(m => String(new Date(m.timestamp).getMonth() + 1).padStart(2, '0') === monthInput);
        }
    }

    let accumulatedRoster = {};
    MASTER_ROSTER.forEach(name => { accumulatedRoster[name] = { name, fours: 0, wickets: 0, points: 0, matchesPlayed: 0 }; });

    filteredMatches.forEach(match => {
        let seen = new Set();
        match.players.forEach(p => {
            if (accumulatedRoster[p.name]) {
                accumulatedRoster[p.name].fours += p.fours; accumulatedRoster[p.name].wickets += p.wickets; accumulatedRoster[p.name].points += p.points;
                if (!seen.has(p.name)) { accumulatedRoster[p.name].matchesPlayed += 1; seen.add(p.name); }
            }
        });
    });

    let leaderboardList = Object.values(accumulatedRoster).filter(p => p.matchesPlayed > 0);
    if (leaderboardList.length === 0) {
        historyContainer.innerHTML = `<p style="text-align:center; opacity:0.6; padding: 20px;">No metrics logged for this selection range.</p>`; return;
    }

    let foursLB = [...leaderboardList].sort((a,b) => b.fours - a.fours);
    let wicketsLB = [...leaderboardList].sort((a,b) => b.wickets - a.wickets);
    let pointsLB = [...leaderboardList].sort((a,b) => b.points - a.points);

    let html = `<div class="accumulated-leaderboards-card" style="background: #0f172a; padding: 15px; border-radius: 12px; margin-bottom: 25px; border: 2px solid #f59e0b;">
        <h3 style="color:#f59e0b; text-align:center; text-transform:uppercase; font-size:15px; margin-bottom:10px;">🏆 ACCUMULATED STANDINGS HUB 🏆</h3>
        <p style="text-align:center; font-size:11px; color:#94a3b8; margin-bottom:15px;">Aggregated from ${filteredMatches.length} match records</p>
        <div class="report-title">🏏 OVERALL MOST FOURS RANKING</div>
        <table class="report-table"><thead><tr><th>Players</th><th>MAT</th><th style="text-align:right;">4's</th></tr></thead><tbody>
            ${foursLB.map(p => `<tr><td>${p.name}</td><td>${p.matchesPlayed}</td><td style="text-align:right; font-weight:bold; color:#2563eb;">${p.fours}</td></tr>`).join('')}
        </tbody></table>
        <div class="report-title"> OVERALL MOST WICKETS RANKING</div>
        <table class="report-table"><thead><tr><th>Players</th><th>MAT</th><th style="text-align:right;">W's</th></tr></thead><tbody>
            ${wicketsLB.map(p => `<tr><td>${p.name}</td><td>${p.matchesPlayed}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${p.wickets}</td></tr>`).join('')}
        </tbody></table>
        <div class="report-title">🧤 OVERALL MOST F'POINTS RANKING</div>
        <table class="report-table"><thead><tr><th>Players</th><th>MAT</th><th style="text-align:right;">P's</th></tr></thead><tbody>
            ${pointsLB.map(p => `<tr><td>${p.name}</td><td>${p.matchesPlayed}</td><td style="text-align:right; font-weight:bold; color:#34d399;">${p.points}</td></tr>`).join('')}
        </tbody></table>
    </div><h4 style="color:#94a3b8; font-size:12px; text-transform:uppercase; margin-bottom:10px;">📋 Individual Match Log Breakdown</h4>`;

    filteredMatches.forEach(match => {
        html += `<div class="match-history-card" style="background:#223047; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #334155; font-size:13px;">
            <div style="font-size:11px; color:#94a3b8; font-weight:bold; margin-bottom:2px;">${new Date(match.timestamp).toLocaleDateString('en-US')}</div>
            <h4 style="color:#fff;">${match.teams}</h4><div>${match.totals}</div><div style="color:#34d399; font-weight:bold; font-size:12px; margin-top:2px;">${match.result}</div>
        </div>`;
    });
    historyContainer.innerHTML = html;
}

function toggleFilterInputs(scope) {
    document.getElementById("dateFilterGroup").classList.add("hidden");
    document.getElementById("monthFilterGroup").classList.add("hidden");
    if (scope === "date") document.getElementById("dateFilterGroup").classList.remove("hidden");
    else if (scope === "month") document.getElementById("monthFilterGroup").classList.remove("hidden");
    renderMatchHistory();
}

function clearAllHistory() {
    if (confirm("Are you sure?")) { matchHistory = []; localStorage.removeItem("ns_match_history"); database.ref("tournament_match_history").set([]); renderMatchHistory(); broadcastLiveStateToFirebase(); }
}
function loadSettingsUI() { document.getElementById("settingVibrate").checked = appSettings.vibrateOnBall; document.getElementById("settingConfirmUndo").checked = appSettings.confirmUndo; }
function saveSettingsFromUI() { appSettings.vibrateOnBall = document.getElementById("settingVibrate").checked; appSettings.confirmUndo = document.getElementById("settingConfirmUndo").checked; localStorage.setItem("ns_settings", JSON.stringify(appSettings)); alert("Preferences Saved!"); showMainMenu(); }

// ==========================================
// 9. AUTOMATIC READ-ONLY SYNC LISTENER
// ==========================================
function startGlobalCloudSyncListener() {
    checkUserRolePermissions();

    // FIX 2: Added conditional filter execution to prevent incoming loop overwrites for Admin
    database.ref("tournament_match_history").on("value", (snapshot) => {
        const storedHistory = snapshot.val();
        if (storedHistory) {
            matchHistory = storedHistory;
            localStorage.setItem("ns_match_history", JSON.stringify(matchHistory));
            if (!document.getElementById("matchHistoryView").classList.contains("hidden")) {
                renderMatchHistory();
            }
        }
    });

    if (!isAdmin) {
        database.ref("live_match_stream").on("value", (snapshot) => {
            const data = snapshot.val();
            if (data) {
                currentTeamA = data.currentTeamA; currentTeamB = data.currentTeamB; totalRuns = data.totalRuns; totalWickets = data.totalWickets;
                totalBalls = data.totalBalls; currentInnings = data.currentInnings; firstInningsScore = data.firstInningsScore;
                firstInningsWickets = data.firstInningsWickets; firstInningsFours = data.firstInningsFours; totalTeamFours = data.totalTeamFours;
                matchEnded = data.matchEnded; currentStrikerName = data.currentStrikerName; currentBowlerName = data.currentBowlerName;
                teamAPlayers = data.teamAPlayers; teamBPlayers = data.teamBPlayers;

                hideAllViews();
                document.getElementById("scoreboard").classList.remove("hidden");
                updateScoreboardDisplay();
                renderDualMatrixUI();
            }
        });
    } else {
        showMainMenu();
    }
}

startGlobalCloudSyncListener();

