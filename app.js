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
// 2. MASTER SQUAD DATABASE
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
let inningsTransitionPending = false; 
let matchEndPending = false; 
let finalMatchResultText = "";

let matchHistory = [];
try { matchHistory = JSON.parse(localStorage.getItem("ns_match_history")) || []; } catch(e) { matchHistory = []; }
let appSettings = { vibrateOnBall: false, confirmUndo: false };
try { appSettings = JSON.parse(localStorage.getItem("ns_settings")) || { vibrateOnBall: false, confirmUndo: false }; } catch(e) { appSettings = { vibrateOnBall: false, confirmUndo: false }; }

let dynamicBowlerSpells = [];

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

function broadcastLiveStateToFirebase() {
    if (!isAdmin) return; 
    const dataPayload = {
        currentTeamA, currentTeamB, totalRuns, totalWickets, totalBalls,
        currentInnings, firstInningsScore, firstInningsWickets, firstInningsFours,
        totalTeamFours, matchEnded, currentStrikerName, currentBowlerName,
        teamAPlayers, teamBPlayers, dynamicBowlerSpells, inningsTransitionPending, matchEndPending
    };
    database.ref("live_match_stream").set(dataPayload);
}

// ==========================================
// 4. MATCH INITIALIZATION ENGINE
// ==========================================
function createMatch() {
    let teamAInput = document.getElementById("teamA");
    let teamBInput = document.getElementById("teamB");
    if (!teamAInput || !teamBInput) return;
    
    let teamA = teamAInput.value.trim();
    let teamB = teamBInput.value.trim();

    if (teamA === "" || teamB === "") {
        alert("Please fill all fields correctly"); return;
    }

    currentTeamA = teamA; currentTeamB = teamB;
    totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0;
    ballHistory = []; currentInnings = 1;
    firstInningsScore = 0; firstInningsWickets = 0; firstInningsFours = 0;
    currentStrikerName = ""; currentBowlerName = ""; matchEnded = false;
    inningsTransitionPending = false; matchEndPending = false;
    dynamicBowlerSpells = [];

    teamAPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));
    teamBPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));

    document.getElementById("teamAHeaderBanner").firstChild.textContent = teamA + " SQUAD SHEET ";
    document.getElementById("teamBHeaderBanner").firstChild.textContent = teamB + " SQUAD SHEET ";
    document.getElementById("nextMatchCyclePanel").classList.add("hidden");
    document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");

    updateScoreboardDisplay();
    renderDualMatrixUI();
    rebuildActiveDropdownOptions();

    hideAllViews();
    document.getElementById("scoreboard").classList.remove("hidden");
    broadcastLiveStateToFirebase();
}

function createPlayerObject(id, name) {
    return { 
        id, name, enabled: false, 
        ballsFaced: 0, currentOverBalls: 0, foursHit: 0, isOut: false, 
        ballsBowled: 0, wicketsTaken: 0, fieldingPoints: 0,
        widesBowled: 0, noBallsBowled: 0 
    };
}

function toggleMatrixPlayerRow(teamSide, id, isChecked) {
    let isMatchStarted = (totalBalls > 0 || totalRuns > 0 || totalWickets > 0 || currentInnings === 2);
    if (isMatchStarted) {
        alert("Match has already started! Cannot edit squads mid-match.");
        renderDualMatrixUI(); return;
    }
    let targetList = teamSide === 'A' ? teamAPlayers : teamBPlayers;
    let player = targetList.find(p => p.id === id);
    if (player) {
        player.enabled = isChecked;
        renderDualMatrixUI();
        rebuildActiveDropdownOptions();
        broadcastLiveStateToFirebase();
    }
}

function resetForNextMatchCycle() {
    totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0;
    ballHistory = []; currentInnings = 1;
    firstInningsScore = 0; firstInningsWickets = 0; firstInningsFours = 0;
    currentStrikerName = ""; currentBowlerName = ""; matchEnded = false;
    inningsTransitionPending = false; matchEndPending = false;
    dynamicBowlerSpells = [];

    teamAPlayers.forEach(p => resetPlayerMatchMetrics(p));
    teamBPlayers.forEach(p => resetPlayerMatchMetrics(p));

    document.getElementById("nextMatchCyclePanel").classList.add("hidden");
    document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");
    
    updateScoreboardDisplay();
    renderDualMatrixUI();
    rebuildActiveDropdownOptions();
    broadcastLiveStateToFirebase();
    alert("Scoreboard reset! Adjust selections if needed before starting Match 2.");
}

function resetPlayerMatchMetrics(p) {
    p.ballsFaced = 0; p.currentOverBalls = 0; p.foursHit = 0; p.isOut = false;
    p.ballsBowled = 0; p.wicketsTaken = 0; p.fieldingPoints = 0;
    p.widesBowled = 0; p.noBallsBowled = 0;
}

// ==========================================
// 5. MATRIX SCOREBOARD WORKBOARD COMPONENT
// ==========================================
function renderDualMatrixUI() {
    renderSideContainer("teamAMatrixContainer", teamAPlayers, 'A');
    renderSideContainer("teamBMatrixContainer", teamBPlayers, 'B');
    
    let teamAFours = teamAPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0);
    let teamBFours = teamBPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0);
    document.getElementById("teamAFoursBadge").innerText = teamAFours + " Fours";
    document.getElementById("teamBFoursBadge").innerText = teamBFours + " Fours";
}

function renderSideContainer(containerId, playersList, sideCode) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let sortedPlayers = [...playersList].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));

    let html = "";
    sortedPlayers.forEach(p => {
        const bgStyle = p.enabled ? "background: #1e293b;" : "background: #1e293b; opacity: 0.35;";
        const checkedAttr = p.enabled ? "checked" : "";
        const outStyle = p.isOut ? "text-decoration: line-through; color: #ef4444;" : "";

        let isMatchStarted = (totalBalls > 0 || totalRuns > 0 || totalWickets > 0 || currentInnings === 2);
        const checkboxDisabledAttr = isMatchStarted ? "disabled" : "";

        let foursBadgeHTML = "";
        if (p.foursHit > 0 || p.isOut) {
            const badgeColor = p.isOut ? "#dc2626" : "#2563eb";
            const prefixSymbol = p.isOut ? "❌" : "★";
            foursBadgeHTML = `<span style="background:${badgeColor}; color:#fff; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold;">${prefixSymbol} ${p.foursHit} 4s</span>`;
        }

        // VALIDATION CHECK: Buttons strictly disable unless names match chosen options
        const isFaceoffActive = (currentStrikerName !== "" && currentBowlerName !== "");
        const isActionDisabled = (!p.enabled || !isFaceoffActive || p.name !== currentStrikerName) ? "disabled" : "";
        const isExtraDisabled = (!p.enabled || !isFaceoffActive) ? "disabled" : "";

        const controlButtonsHTML = isAdmin ? `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                    <div style="display: flex; gap: 4px;">
                        <button class="action-trigger" ${isActionDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'dot')" style="background:#475569; color:#fff;">Dot</button>
                        <button class="action-trigger" ${isActionDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'four')" style="background:#2563eb; color:#fff; width: 50px;">+4</button>
                        <button class="action-trigger" ${isActionDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'out-btn')" style="background:#dc2626; color:#fff;">OUT</button>
                    </div>
                    <!-- CHANGED: Buttons turned into clean display text lables -->
                    <div style="display: flex; gap: 4px;">
                        <span class="stat-label-box">B: ${p.ballsBowled}</span>
                        <span class="stat-label-box" style="border-color: #dc2626; color: #fca5a5;">W: ${p.wicketsTaken}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; border-top: 1px dashed #334155; padding-top: 6px;">
                    <div style="display: flex; gap: 4px;">
                        <button class="action-trigger" ${isExtraDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'bowl-wide')" style="background:#f59e0b; color:#0f172a;">WD (${p.widesBowled || 0})</button>
                        <button class="action-trigger" ${isExtraDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'bowl-noball')" style="background:#f59e0b; color:#0f172a;">NB (${p.noBallsBowled || 0})</button>
                    </div>
                    <button class="action-trigger" ${isExtraDisabled} onclick="executeDirectAction('${sideCode}', ${p.id}, 'field-point')" style="background:#10b981; color:#fff;">Field Pts (${p.fieldingPoints})</button>
                </div>
            </div>
        ` : `
            <div style="font-size:11px; color:#94a3b8; width: 100%;">
                Bowling: <b>B: ${p.ballsBowled} | W: ${p.wicketsTaken}</b> | Extras: <b>WD:${p.widesBowled || 0} NB:${p.noBallsBowled || 0}</b> | Fielding: <b style="color:#10b981;">${p.fieldingPoints} Pts</b>
            </div>
        `;

        html += `
            <div class="player-matrix-row" style="${bgStyle} padding: 12px; margin-bottom: 8px; border-radius: 10px; border: 1px solid #334155;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${isAdmin ? `<input type="checkbox" ${checkedAttr} ${checkboxDisabledAttr} onclick="toggleMatrixPlayerRow('${sideCode}', ${p.id}, this.checked)" style="transform: scale(1.2); cursor: pointer; margin-right:4px;">` : '🏃'}
                        <span style="font-weight: bold; font-size: 14px; color: #fff; ${outStyle}">${p.name}</span>
                        ${p.ballsFaced > 0 && !p.isOut ? `<span style="font-size:11px; color:#94a3b8;">(${p.ballsFaced}b / Ov: ${p.currentOverBalls}b)</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        ${foursBadgeHTML}
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

function changeActiveStriker(name) { 
    currentStrikerName = name; 
    renderDualMatrixUI(); // Refresh state immediately to enable buttons
    broadcastLiveStateToFirebase(); 
}

function changeActiveBowler(name) { 
    if (name && name !== currentBowlerName) {
        if (currentBowlerName) {
            let activePool = currentInnings === 1 ? teamBPlayers : teamAPlayers;
            let lastBowlerObj = activePool.find(p => p.name === currentBowlerName);
            if (lastBowlerObj && (lastBowlerObj.ballsBowled > 0 || (lastBowlerObj.widesBowled || 0) > 0 || (lastBowlerObj.noBallsBowled || 0) > 0)) {
                dynamicBowlerSpells.push({
                    name: lastBowlerObj.name,
                    balls: lastBowlerObj.ballsBowled,
                    wickets: lastBowlerObj.wicketsTaken,
                    wides: lastBowlerObj.widesBowled || 0,
                    noballs: lastBowlerObj.noBallsBowled || 0,
                    matchId: "match_" + Date.now()
                });
                lastBowlerObj.ballsBowled = 0; lastBowlerObj.wicketsTaken = 0;
                lastBowlerObj.widesBowled = 0; lastBowlerObj.noBallsBowled = 0;
            }
        }
    }
    currentBowlerName = name; 
    renderDualMatrixUI(); // Refresh state immediately to enable buttons
    broadcastLiveStateToFirebase(); 
}

// ==========================================
// 6. AUTOMATED DELIVERIES SCORING WORKFLOWS
// ==========================================
function executeDirectAction(sideCode, playerId, type) {
    if (matchEnded && type && !['field-point', 'bowl-wide', 'bowl-noball'].includes(type)) {
        alert("Match has finished!"); return;
    }

    let activePool = sideCode === 'A' ? teamAPlayers : teamBPlayers;
    let targetPlayer = activePool.find(p => p.id === playerId);
    if (!targetPlayer || !targetPlayer.enabled) return;

    let bowlingPool = currentInnings === 1 ? teamBPlayers : teamAPlayers;
    let selectedBowlerObj = bowlingPool.find(p => p.name === currentBowlerName);

    if (appSettings.vibrateOnBall && navigator.vibrate) { navigator.vibrate(40); }

    ballHistory.push({
        type, side: sideCode, playerId, currentStrikerName, currentBowlerName,
        totalRuns, totalWickets, totalBalls, currentInnings, totalTeamFours, matchEnded, inningsTransitionPending, matchEndPending,
        teamASnapshot: JSON.stringify(teamAPlayers), teamBSnapshot: JSON.stringify(teamBPlayers),
        spellsSnapshot: JSON.stringify(dynamicBowlerSpells)
    });

    if (type === 'dot') {
        targetPlayer.ballsFaced += 1; targetPlayer.currentOverBalls += 1; totalBalls += 1;
        if (selectedBowlerObj) { selectedBowlerObj.ballsBowled += 1; }
        if (targetPlayer.currentOverBalls >= 6) {
            targetPlayer.isOut = true; totalWickets += 1;
            if (selectedBowlerObj) { selectedBowlerObj.wicketsTaken += 1; }
            alert(`Wicket! ${targetPlayer.name} faced 6 balls without hitting a 4 boundary!`);
            currentStrikerName = ""; 
        }
    } 
    else if (type === 'four') {
        targetPlayer.ballsFaced += 1; targetPlayer.foursHit += 1; totalRuns += 4; totalTeamFours += 1; totalBalls += 1;
        targetPlayer.currentOverBalls = 0; 
        if (selectedBowlerObj) { selectedBowlerObj.ballsBowled += 1; }
        alert(`🎉 Face-off complete! ${targetPlayer.name} hit a 4!`);
        currentBowlerName = ""; 
    } 
    else if (type === 'out-btn') {
        targetPlayer.isOut = true; totalWickets += 1;
        if (selectedBowlerObj) { selectedBowlerObj.ballsBowled += 1; selectedBowlerObj.wicketsTaken += 1; }
        alert(`❌ Wicket logged: ${targetPlayer.name} marked OUT.`);
        currentStrikerName = ""; 
    }
    else if (type === 'bowl-wide') { if (selectedBowlerObj) selectedBowlerObj.widesBowled = (selectedBowlerObj.widesBowled || 0) + 1; }
    else if (type === 'bowl-noball') { if (selectedBowlerObj) selectedBowlerObj.noBallsBowled = (selectedBowlerObj.noBallsBowled || 0) + 1; }
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
    inningsTransitionPending = lastEvent.inningsTransitionPending || false;
    matchEndPending = lastEvent.matchEndPending || false;

    if (matchEnded) { document.getElementById("nextMatchCyclePanel").classList.remove("hidden"); } 
    else { document.getElementById("nextMatchCyclePanel").classList.add("hidden"); }

    if (inningsTransitionPending) { document.getElementById("manualInningsClosurePanel").classList.remove("hidden"); }
    else { document.getElementById("manualInningsClosurePanel").classList.add("hidden"); }

    if (matchEndPending) { document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); }
    else { document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden"); }

    teamAPlayers = JSON.parse(lastEvent.teamASnapshot); teamBPlayers = JSON.parse(lastEvent.teamBSnapshot);
    dynamicBowlerSpells = JSON.parse(lastEvent.spellsSnapshot || "[]");

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
        ? currentTeamA + " (Score: " + totalRuns + " / " + totalWickets + ") - 1st Innings"
        : currentTeamB + " (Score: " + totalRuns + " / " + totalWickets + ") - 2nd Innings [Target: " + (firstInningsScore + 1) + "]";

    document.getElementById("liveFoursCounter").innerText = "Total Match Boundaries: " + totalTeamFours + " Fours";
    let series = calculateDailySeriesWins();
    document.getElementById("liveSeriesTracker").innerText = "Wins Tally Today: " + currentTeamA + " (" + series.winA + ") - (" + series.winB + ") " + currentTeamB;

    if (currentInnings === 1 && totalWickets >= checkedActiveCount && checkedActiveCount > 0 && !inningsTransitionPending) {
        inningsTransitionPending = true;
        document.getElementById("manualInningsClosurePanel").classList.remove("hidden");
        alert("Notice: 1st Innings completed! Verify table stats and tap Close & Transition Innings.");
    } else if (currentInnings === 2 && !matchEnded && !matchEndPending) {
        if (totalRuns > firstInningsScore) {
            matchEndPending = true; finalMatchResultText = currentTeamB + " won";
            document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden");
            alert("Notice: Target chased down successfully! Verify score entries and tap Close Match.");
        } else if (totalWickets >= checkedActiveCount && checkedActiveCount > 0) {
            matchEndPending = true;
            if (totalRuns === firstInningsScore) { finalMatchResultText = "Match Tied"; }
            else { finalMatchResultText = currentTeamA + " won"; }
            document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden");
            alert("Notice: All batsmen out! Verify score entries and tap Close Match.");
        }
    }
}

function commitInningsTransitionBreak() {
    if (!isAdmin || !inningsTransitionPending) return;
    firstInningsScore = totalRuns; firstInningsWickets = totalWickets; firstInningsFours = totalTeamFours;
    currentInnings = 2; totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0; currentStrikerName = ""; currentBowlerName = "";
    inningsTransitionPending = false;
    document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    renderDualMatrixUI(); rebuildActiveDropdownOptions(); updateScoreboardDisplay(); broadcastLiveStateToFirebase();
}

function commitFinalMatchClosureHistory() {
    if (!isAdmin || !matchEndPending) return;
    matchEnded = true; matchEndPending = false;
    document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");
    document.getElementById("nextMatchCyclePanel").classList.remove("hidden");
    saveMatchToHistory(finalMatchResultText);
    alert(`Match officially verified and stored! Results logged.`);
}

// ==========================================
// 7. DATA LEADERBOARD FILTERS & RECORD KEEPING
// ==========================================
function saveMatchToHistory(resultText = "Match Completed") {
    if (currentBowlerName) {
        let activePool = currentInnings === 1 ? teamBPlayers : teamAPlayers;
        let finalBowlerObj = activePool.find(p => p.name === currentBowlerName);
        if (finalBowlerObj && (finalBowlerObj.ballsBowled > 0 || (finalBowlerObj.widesBowled || 0) > 0 || (finalBowlerObj.noBallsBowled || 0) > 0)) {
            dynamicBowlerSpells.push({
                name: finalBowlerObj.name,
                balls: finalBowlerObj.ballsBowled,
                wickets: finalBowlerObj.wicketsTaken,
                wides: finalBowlerObj.widesBowled || 0,
                noballs: finalBowlerObj.noBallsBowled || 0,
                matchId: "match_" + Date.now()
            });
        }
    }

    let matchPlayers = [];
    teamAPlayers.concat(teamBPlayers).filter(p => p.enabled).forEach(p => {
        let cumulativeBalls = p.ballsBowled;
        let cumulativeWickets = p.wicketsTaken;
        let cumulativeWides = p.widesBowled || 0;
        let cumulativeNoBalls = p.noBallsBowled || 0;
        let cumulativeSpellCount = (p.ballsBowled > 0 || (p.widesBowled || 0) > 0 || (p.noBallsBowled || 0) > 0) ? 1 : 0;

        dynamicBowlerSpells.forEach(s => {
            if (s.name === p.name) {
                cumulativeBalls += s.balls; cumulativeWickets += s.wickets;
                cumulativeWides += (s.wides || 0); cumulativeNoBalls += (s.noballs || 0);
                cumulativeSpellCount += 1;
            }
        });

        matchPlayers.push({ 
            name: p.name, 
            fours: p.foursHit, 
            isNotOut: !p.isOut && (p.ballsFaced > 0 || p.foursHit > 0), 
            ballsFaced: p.ballsFaced,
            points: p.fieldingPoints,
            ballsBowled: cumulativeBalls,
            wickets: cumulativeWickets,
            wides: cumulativeWides,
            noBalls: cumulativeNoBalls,
            bowlingInningsCount: cumulativeSpellCount
        });
    });

    const completedMatch = {
        id: "match_" + Date.now(), 
        timestamp: new Date().toISOString(), 
        teams: currentTeamA + " vs " + currentTeamB, 
        result: resultText,
        totals: currentTeamA + ": " + firstInningsScore + "/" + firstInningsWickets + " [" + firstInningsFours + "x4] | " + currentTeamB + ": " + totalRuns + "/" + totalWickets + " [" + totalTeamFours + "x4]",
        players: matchPlayers,
        bowlerSpells: dynamicBowlerSpells 
    };
    
    matchHistory.unshift(completedMatch);
    localStorage.setItem("ns_match_history", JSON.stringify(matchHistory));
    database.ref("tournament_match_history").set(matchHistory);
    broadcastLiveStateToFirebase();
}

function shareAccumulatedStatsToWhatsApp() {
    let filterScope = document.getElementById("leaderboardFilterScope").value;
    let headingTitle = "OVERALL STATUS SUMMARY";
    if (filterScope === "date") headingTitle = "SUMMARY REPORT FOR [" + (document.getElementById("filterSpecificDate").value || 'SELECTED DATE') + "]";
    if (filterScope === "month") headingTitle = "SUMMARY REPORT FOR MONTH CODE: " + document.getElementById("filterSpecificMonth").value;

    let textReport = "📊 *NewSmashers Leaderboard Report* 📊\n";
    textReport += "📅 Scope: *" + headingTitle + "*\n";
    textReport += "═══════════════════════\n\n";

    const tables = document.querySelectorAll("#historyListContainer table");
    const titles = document.querySelectorAll("#historyListContainer .report-title");

    if (tables.length === 0) {
        alert("No tournament stats found for this filter scope to share!"); return;
    }

    titles.forEach((titleEl, idx) => {
        textReport += "*" + titleEl.innerText + "*\n";
        const rows = tables[idx].querySelectorAll("tbody tr");
        rows.forEach(row => {
            const cols = row.querySelectorAll("td");
            if (cols.length >= 4) {
                const rank = cols[0].innerText;
                const pName = cols[1].innerText;
                const inn = cols[2].innerText;
                const statVal = cols[3].innerText;
                textReport += " " + rank + ". *" + pName + "* (Inn:" + inn + ") ➜ *" + statVal + "*\n";
            }
        });
        textReport += "\n";
    });

    const encodedText = encodeURIComponent(textReport);
    window.open("https://api.whatsapp.com/send?text=" + encodedText, '_blank');
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

    let batsmanMetrics = {};
    let bowlerMetrics = {};
    let fielderMetrics = {};

    filteredMatches.forEach(match => {
        let matchDateKey = new Date(match.timestamp).toLocaleDateString();

        if (match.players) {
            match.players.forEach(p => {
                if (!batsmanMetrics[p.name]) batsmanMetrics[p.name] = { name: p.name, innings: 0, fours: 0, ballsFaced: 0, bestFours: 0, tenPlusMatches: 0, totalNotOuts: 0 };
                if (!bowlerMetrics[p.name]) bowlerMetrics[p.name] = { name: p.name, innings: 0, wickets: 0, totalBalls: 0, bestWicketsDay: {}, fiveWicketsMatches: 0 };
                if (!fielderMetrics[p.name]) fielderMetrics[p.name] = { name: p.name, matches: 0, totalPoints: 0, bestPoints: 0 };

                if (p.ballsFaced > 0 || p.fours > 0) {
                    batsmanMetrics[p.name].innings += 1;
                    batsmanMetrics[p.name].fours += (p.fours || 0);
                    batsmanMetrics[p.name].ballsFaced += (p.ballsFaced || 0);
                    if (p.isNotOut) batsmanMetrics[p.name].totalNotOuts += 1; 
                    if ((p.fours || 0) > batsmanMetrics[p.name].bestFours) batsmanMetrics[p.name].bestFours = p.fours;
                    if ((p.fours || 0) >= 10) batsmanMetrics[p.name].tenPlusMatches += 1;
                }

                let bInnings = p.bowlingInningsCount || (p.ballsBowled > 0 ? 1 : 0);
                if (bInnings > 0 || (p.wickets || 0) > 0 || (p.ballsBowled || 0) > 0) {
                    bowlerMetrics[p.name].innings += (bInnings || 1);
                    bowlerMetrics[p.name].wickets += (p.wickets || 0);
                    bowlerMetrics[p.name].totalBalls += (p.ballsBowled || 0);
                    
                    bowlerMetrics[p.name].bestWicketsDay[matchDateKey] = (bowlerMetrics[p.name].bestWicketsDay[matchDateKey] || 0) + (p.wickets || 0);
                    if ((p.wickets || 0) >= 5) bowlerMetrics[p.name].fiveWicketsMatches += 1;
                }

                fielderMetrics[p.name].matches += 1;
                fielderMetrics[p.name].totalPoints += (p.points || 0);
                if ((p.points || 0) > fielderMetrics[p.name].bestPoints) fielderMetrics[p.name].bestPoints = p.points;
            });
        }
    });

    let foursLB = Object.values(batsmanMetrics).filter(p => p.innings > 0).sort((a,b) => b.fours - a.fours);
    let wicketsLB = Object.values(bowlerMetrics).filter(p => p.innings > 0 || p.wickets > 0).sort((a,b) => b.wickets - a.wickets);
    let pointsLB = Object.values(fielderMetrics).filter(p => p.matches > 0).sort((a,b) => b.totalPoints - a.totalPoints);

    let html = `<div class="accumulated-leaderboards-card" style="background: #0f172a; padding: 10px; border-radius: 12px; margin-bottom: 25px; border: 2px solid #f59e0b;">
        <h3 style="color:#f59e0b; text-align:center; text-transform:uppercase; font-size:14px; margin-bottom:10px;">🏆 ACCUMULATED STANDINGS HUB 🏆</h3>
        
        <div class="report-title">🏏 OVERALL MOST FOURS RANKING</div>
        <table class="report-table">
            <thead>
                <tr>
                    <th style="width:10%;">RK</th>
                    <th style="width:34%;">PLAYERS</th>
                    <th style="width:12%;">INN</th>
                    <th style="width:12%;">4'S</th>
                    <th style="width:12%;">NO</th>
                    <th style="width:20%;">S.RATE</th>
                </tr>
            </thead>
            <tbody>
                ${foursLB.map((p, idx) => {
                    let strikeRate = p.ballsFaced > 0 ? ((p.fours / p.ballsFaced) * 100).toFixed(2) : "0.00";
                    return `<tr><td>${idx+1}</td><td><b>${p.name}</b></td><td>${p.innings}</td><td style="color:#3b82f6; font-weight:bold;">${p.fours}</td><td style="color:#10b981; font-weight:bold;">${p.totalNotOuts}</td><td>${strikeRate}</td></tr>`;
                }).join('')}
            </tbody>
        </table>

        <div class="report-title">🏃 OVERALL MOST WICKETS RANKING</div>
        <table class="report-table">
            <thead>
                <tr>
                    <th style="width:12%;">RK</th>
                    <th style="width:36%;">PLAYERS</th>
                    <th style="width:13%;">INN</th>
                    <th style="width:13%;">W'S</th>
                    <th style="width:16%;">AVG</th>
                    <th style="width:13%;">B'S</th>
                </tr>
            </thead>
            <tbody>
                ${wicketsLB.map((p, idx) => {
                    let avg = p.wickets > 0 ? (p.totalBalls / p.wickets).toFixed(2) : "0.00";
                    let bestDayVal = Object.values(p.bestWicketsDay).length > 0 ? Math.max(...Object.values(p.bestWicketsDay)) : 0;
                    return `<tr><td>${idx+1}</td><td><b>${p.name}</b></td><td>${p.innings}</td><td style="color:#ef4444; font-weight:bold;">${p.wickets}</td><td>${avg}</td><td>${bestDayVal}</td></tr>`;
                }).join('')}
            </tbody>
        </table>

        <div class="report-title">🧤 OVERALL MOST F'POINTS RANKING</div>
        <table class="report-table">
            <thead>
                <tr>
                    <th style="width:12%;">RK</th>
                    <th style="width:38%;">PLAYERS</th>
                    <th style="width:14%;">MAT</th>
                    <th style="width:14%;">P'S</th>
                    <th style="width:32%;">EFFICIENCY</th>
                </tr>
            </thead>
            <tbody>
                ${pointsLB.map((p, idx) => {
                    let efficiency = p.matches > 0 ? (p.totalPoints / p.matches).toFixed(2) + "%" : "0.00%";
                    return `<tr><td>${idx+1}</td><td><b>${p.name}</b></td><td>${p.matches}</td><td style="color:#34d399; font-weight:bold;">${p.totalPoints}</td><td>${efficiency}</td></tr>`;
                }).join('')}
            </tbody>
        </table>
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

function startGlobalCloudSyncListener() {
    checkUserRolePermissions();

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
                teamAPlayers = data.teamAPlayers; teamBPlayers = data.teamBPlayers; dynamicBowlerSpells = data.dynamicBowlerSpells || [];
                inningsTransitionPending = data.inningsTransitionPending || false; matchEndPending = data.matchEndPending || false;

                if (matchEnded) { document.getElementById("nextMatchCyclePanel").classList.remove("hidden"); } 
                else { document.getElementById("nextMatchCyclePanel").classList.add("hidden"); }

                if (inningsTransitionPending) { document.getElementById("manualInningsClosurePanel").classList.remove("hidden"); }
                else { document.getElementById("manualInningsClosurePanel").classList.add("hidden"); }

                if (matchEndPending) { document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); }
                else { document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden"); }

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

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('data:text/javascript,self.addEventListener("fetch",e=>e.respondWith(fetch(e.request)));', {scope: './'})
        .then(reg => console.log('PWA active:', reg.scope))
        .catch(err => console.log('PWA error:', err));
    });
}

window.addEventListener('error', function(e) { window.errorsLogged = (window.errorsLogged || "") + "\n" + e.message; });

startGlobalCloudSyncListener();
