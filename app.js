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
let isMatchActiveShieldEnabled = false; 

window.addEventListener("beforeunload", function (e) {
    if (isMatchActiveShieldEnabled) {
        let confirmationMessage = "⚠️ Warning: Active Match in Progress! Reloading will wipe the live data.";
        (e || window.event).returnValue = confirmationMessage; 
        return confirmationMessage; 
    }
});

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
        document.getElementById("adminLedgerManualOverrideCard").classList.remove("hidden");
    } else {
        isAdmin = false;
        document.getElementById("appTitleHeader").innerText = "NewSmashers Live View";
        document.getElementById("appTaglineBanner").innerText = "🔴 Live Match Update Stream";
        document.getElementById("adminLedgerManualOverrideCard").classList.add("hidden");
        stripAdminControlsFromDOM();
    }
}

function stripAdminControlsFromDOM() {
    const adminMenuBtn = document.querySelector("#mainMenu .primary-btn"); if (adminMenuBtn) adminMenuBtn.remove();
    const adminSettingsBtn = document.querySelectorAll("#mainMenu .menu-btn")[1]; if (adminSettingsBtn) adminSettingsBtn.remove();
    const clearHist = document.getElementById("adminClearHistoryBtnElement"); if (clearHist) clearHist.remove();
    const activeFaceoffPanel = document.getElementById("activeMatchupCardPanel"); if (activeFaceoffPanel) activeFaceoffPanel.remove();
    const undoBtn = document.getElementById("adminUndoBtnElement"); if (undoBtn) undoBtn.remove();
}

// ==========================================
// 2. MASTER SQUAD DATABASE
// ==========================================
const MASTER_ROSTER = [
    "Abbas", "David", "Gaja", "Karthi anna", "Karthi S G", 
    "Karthik Bro", "Logan", "Madhan", "Praveen", "Raj", 
    "Rajesh", "Ramesh", "Ram", "Senthil", "Sun", 
    "Suresh", "Thamizh", "Thiyagu", "Vicky", "Sasi", 
    "XYZ1", "XYZ2", "XYZ3"
];

let teamAPlayers = [];
let teamBPlayers = [];
let currentStrikerName = ""; 
let currentBowlerName = "";  

let totalRuns = 0, totalWickets = 0, totalBalls = 0, totalTeamFours = 0;
let currentTeamA = "", currentTeamB = "", currentInnings = 1, firstInningsScore = 0, firstInningsWickets = 0, firstInningsFours = 0;
let ballHistory = [], matchEnded = false, inningsTransitionPending = false, matchEndPending = false, finalMatchResultText = "", lastWinningTeamName = "";

let activeWeeklySeriesLabel = "Week 1 - July 14";
let activeMatchIndexLabel = "Match 1";

let matchHistory = []; try { matchHistory = JSON.parse(localStorage.getItem("ns_match_history")) || []; } catch(e) {}
// UPDATED: Holds multi-dimensional database context blocks safely
let manualLedgerStorage = {}; try { manualLedgerStorage = JSON.parse(localStorage.getItem("ns_manual_ledger")) || {}; } catch(e) {}
let appSettings = { vibrateOnBall: false, confirmUndo: false }; try { appSettings = JSON.parse(localStorage.getItem("ns_settings")) || { vibrateOnBall: false, confirmUndo: false }; } catch(e) {}
let dynamicBowlerSpells = [];

// ==========================================
// 3. NAVIGATION CONTROLLERS
// ==========================================
function showMainMenu() { hideAllViews(); document.getElementById("mainMenu").classList.remove("hidden"); }
function showMatchForm() { 
    hideAllViews(); 
    document.getElementById("matchForm").classList.remove("hidden"); 
    document.getElementById("seriesIdentityInput").value = activeWeeklySeriesLabel;
}

function showMatchHistory() { 
    hideAllViews(); 
    document.getElementById("matchHistoryView").classList.remove("hidden"); 
    document.getElementById("leaderboardFilterScope").value = "overall";
    toggleFilterInputs("overall");
    populateWeeklyFilterDropdownOptions();
    rebuildLedgerPlayerOptionsDropdown();
    onFilterViewScopeContextChanged(); 
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
        teamAPlayers, teamBPlayers, dynamicBowlerSpells, inningsTransitionPending, matchEndPending, lastWinningTeamName, activeWeeklySeriesLabel, activeMatchIndexLabel
    };
    database.ref("live_match_stream").set(dataPayload);
}

// ==========================================
// 4. MATCH INITIALIZATION ENGINE
// ==========================================
function createMatch() {
    let sInput = document.getElementById("seriesIdentityInput");
    let mIdxSelect = document.getElementById("matchNumberSelectorIndex");
    let teamAInput = document.getElementById("teamA");
    let teamBInput = document.getElementById("teamB");
    
    if (!sInput || !teamAInput || !teamBInput) return;
    
    let seriesText = sInput.value.trim();
    let matchIdx = mIdxSelect.value;
    let teamA = teamAInput.value.trim().toUpperCase();
    let teamB = teamBInput.value.trim().toUpperCase();

    if (seriesText === "" || teamA === "" || teamB === "") { alert("Please fill all fields correctly"); return; }

    isMatchActiveShieldEnabled = true;
    activeWeeklySeriesLabel = seriesText;
    activeMatchIndexLabel = matchIdx;

    currentTeamA = teamA; currentTeamB = teamB;
    totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0; ballHistory = []; currentInnings = 1;
    firstInningsScore = 0; firstInningsWickets = 0; firstInningsFours = 0; currentStrikerName = ""; currentBowlerName = ""; matchEnded = false;
    inningsTransitionPending = false; matchEndPending = false; lastWinningTeamName = ""; dynamicBowlerSpells = [];

    teamAPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));
    teamBPlayers = MASTER_ROSTER.map((name, index) => createPlayerObject(index, name));

    document.getElementById("teamAHeaderText").innerText = teamA + " SQUAD SHEET";
    document.getElementById("teamBHeaderText").innerText = teamB + " SQUAD SHEET";
    
    document.getElementById("nextMatchCyclePanel").classList.add("hidden");
    document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");

    updateScoreboardDisplay(); renderDualMatrixUI(); rebuildActiveDropdownOptions();
    hideAllViews(); document.getElementById("scoreboard").classList.remove("hidden");
    broadcastLiveStateToFirebase();
}

function createPlayerObject(id, name) { return { id, name, enabled: false, ballsFaced: 0, currentOverBalls: 0, foursHit: 0, isOut: false, ballsBowled: 0, wicketsTaken: 0, fieldingPoints: 0, widesBowled: 0, noBallsBowled: 0 }; }

function toggleMatrixPlayerRow(teamSide, id, isChecked) {
    if (totalBalls > 0 || totalRuns > 0 || totalWickets > 0 || currentInnings === 2) { alert("Match has already started!"); renderDualMatrixUI(); return; }
    let targetList = teamSide === 'A' ? teamAPlayers : teamBPlayers;
    let player = targetList.find(p => p.id === id);
    if (player) { player.enabled = isChecked; renderDualMatrixUI(); rebuildActiveDropdownOptions(); broadcastLiveStateToFirebase(); }
}

function resetForNextMatchCycle() {
    isMatchActiveShieldEnabled = true;

    let currNum = parseInt(activeMatchIndexLabel.replace("Match ", ""));
    if (currNum < 15) { activeMatchIndexLabel = "Match " + (currNum + 1); }

    if (lastWinningTeamName === currentTeamB) {
        let tempTeamName = currentTeamA; currentTeamA = currentTeamB; currentTeamB = tempTeamName;
        let tempSquad = teamAPlayers; teamAPlayers = teamBPlayers; teamBPlayers = tempSquad;
    } 

    totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0; ballHistory = []; currentInnings = 1;
    firstInningsScore = 0; firstInningsWickets = 0; firstInningsFours = 0; currentStrikerName = ""; currentBowlerName = ""; matchEnded = false;
    inningsTransitionPending = false; matchEndPending = false; dynamicBowlerSpells = [];

    teamAPlayers.forEach(p => resetPlayerMatchMetrics(p));
    teamBPlayers.forEach(p => resetPlayerMatchMetrics(p));

    document.getElementById("teamAHeaderText").innerText = currentTeamA + " SQUAD SHEET";
    document.getElementById("teamBHeaderText").innerText = currentTeamB + " SQUAD SHEET";
    document.getElementById("nextMatchCyclePanel").classList.add("hidden");
    document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");
    
    updateScoreboardDisplay(); renderDualMatrixUI(); rebuildActiveDropdownOptions(); broadcastLiveStateToFirebase();
}

function resetPlayerMatchMetrics(p) { p.ballsFaced = 0; p.currentOverBalls = 0; p.foursHit = 0; p.isOut = false; p.ballsBowled = 0; p.wicketsTaken = 0; p.fieldingPoints = 0; p.widesBowled = 0; p.noBallsBowled = 0; }

// ==========================================
// 5. MATRIX SCOREBOARD WORKBOARD COMPONENT
// ==========================================
function renderDualMatrixUI() {
    renderSideContainer("teamAMatrixContainer", teamAPlayers, 'A'); renderSideContainer("teamBMatrixContainer", teamBPlayers, 'B');
    document.getElementById("teamAFoursBadge").innerText = teamAPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0) + " Fours";
    document.getElementById("teamBFoursBadge").innerText = teamBPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0) + " Fours";
}

function renderSideContainer(containerId, list, code) {
    const c = document.getElementById(containerId); if (!c) return;
    let s = [...list].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)), html = "";
    
    s.forEach(p => {
        const bg = p.enabled ? "background: #1e293b;" : "background: #1e293b; opacity: 0.35;";
        const active = currentStrikerName !== "" && currentBowlerName !== "";
        const disAct = (!p.enabled || !active || p.name !== currentStrikerName) ? "disabled" : "";
        const disEx = (!p.enabled || !active) ? "disabled" : "";
        const outSt = p.isOut ? "text-decoration: line-through; color: #ef4444;" : "";
        let badge = p.foursHit > 0 || p.isOut ? `<span style="background:${p.isOut ? '#dc2626':'#2563eb'}; color:#fff; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold;">${p.isOut ? '❌':'★'} ${p.foursHit} 4s</span>` : "";

        const btn = isAdmin ? `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                    <div style="display: flex; gap: 6px;">
                        <button class="action-trigger" ${disAct} onclick="executeDirectAction('${code}', ${p.id}, 'dot')" style="background:#475569; color:#fff;">Dot</button>
                        <button class="action-trigger" ${disAct} onclick="executeDirectAction('${code}', ${p.id}, 'four')" style="background:#2563eb; color:#fff; width: 55px;">+4</button>
                        <button class="action-trigger" ${disAct} onclick="executeDirectAction('${code}', ${p.id}, 'out-btn')" style="background:#dc2626; color:#fff;">OUT</button>
                    </div>
                    <div style="display: flex; gap: 4px;"><span class="stat-label-box">B: ${p.ballsBowled}</span><span class="stat-label-box" style="border-color: #dc2626; color: #fca5a5;">W: ${p.wicketsTaken}</span></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; border-top: 1px dashed #334155; padding-top: 6px;">
                    <div style="display: flex; gap: 6px;">
                        <button class="action-trigger" ${disEx} onclick="executeDirectAction('${code}', ${p.id}, 'bowl-wide')" style="background:#f59e0b; color:#0f172a;">WD (${p.widesBowled || 0})</button>
                        <button class="action-trigger" ${disEx} onclick="executeDirectAction('${code}', ${p.id}, 'bowl-noball')" style="background:#f59e0b; color:#0f172a;">NB (${p.noBallsBowled || 0})</button>
                    </div>
                    <button class="action-trigger" ${disEx} onclick="executeDirectAction('${code}', ${p.id}, 'field-point')" style="background:#a855f7; color:#fff;">Field Pts (${p.fieldingPoints})</button>
                </div>
            </div>` : `<div style="font-size:11px; color:#94a3b8;">Bowling: <b>B: ${p.ballsBowled} | W: ${p.wicketsTaken}</b> | Extras: WD:${p.widesBowled||0} NB:${p.noBallsBowled||0} | Fielding: <b style="color:#a855f7;">${p.fieldingPoints} Pts</b></div>`;

        html += `<div style="${bg} padding: 12px; margin-bottom: 8px; border-radius: 10px; border: 1px solid #334155;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div>
                    ${isAdmin ? `<input type="checkbox" ${p.enabled?'checked':''} ${totalBalls>0||totalRuns>0||totalWickets>0||currentInnings===2?'disabled':''} onclick="toggleMatrixPlayerRow('${code}', ${p.id}, this.checked)" style="transform: scale(1.2); cursor: pointer; margin-right:4px;">` : '🏃'}
                    <span style="font-weight: bold; font-size: 14px; color: #fff; ${outSt}">${p.name}</span>
                </div>
                <div>${badge}</div>
            </div>${btn}
        </div>`;
    }); c.innerHTML = html;
}

function rebuildActiveDropdownOptions() {
    if (!isAdmin) return; const batSelect = document.getElementById("activeBatsmanSelect"), bowlSelect = document.getElementById("activeBowlerSelect"); if (!batSelect || !bowlSelect) return;
    let bPool = currentInnings === 1 ? teamAPlayers : teamBPlayers, boPool = currentInnings === 1 ? teamBPlayers : teamAPlayers;
    let bHtml = `<option value="">-- Choose Batsman --</option>`, boHtml = `<option value="">-- Choose Bowler --</option>`;
    bPool.filter(p => p.enabled && !p.isOut).forEach(p => bHtml += `<option value="${p.name}" ${p.name===currentStrikerName?"selected":""}>${p.name}</option>`);
    boPool.filter(p => p.enabled).forEach(p => boHtml += `<option value="${p.name}" ${p.name===currentBowlerName?"selected":""}>${p.name} (${p.ballsBowled}b)</option>`);
    batSelect.innerHTML = bHtml; bowlSelect.innerHTML = boHtml;
}

function changeActiveStriker(name) { currentStrikerName = name; renderDualMatrixUI(); broadcastLiveStateToFirebase(); }
function changeActiveBowler(name) { currentBowlerName = name; renderDualMatrixUI(); broadcastLiveStateToFirebase(); }

function executeDirectAction(sideCode, playerId, type) {
    if (matchEnded && type && !['field-point', 'bowl-wide', 'bowl-noball'].includes(type)) { alert("Match has finished!"); return; }
    let activePool = sideCode === 'A' ? teamAPlayers : teamBPlayers; let targetPlayer = activePool.find(p => p.id === playerId); if (!targetPlayer || !targetPlayer.enabled) return;
    let bowlingPool = currentInnings === 1 ? teamBPlayers : teamAPlayers; let selectedBowlerObj = bowlingPool.find(p => p.name === currentBowlerName);

    if (appSettings.vibrateOnBall && navigator.vibrate) { navigator.vibrate(40); }
    ballHistory.push({ type, side: sideCode, playerId, currentStrikerName, currentBowlerName, totalRuns, totalWickets, totalBalls, currentInnings, totalTeamFours, matchEnded, inningsTransitionPending, matchEndPending, lastWinningTeamName, teamASnapshot: JSON.stringify(teamAPlayers), teamBSnapshot: JSON.stringify(teamBPlayers), spellsSnapshot: JSON.stringify(dynamicBowlerSpells) });

    if (type === 'dot') {
        targetPlayer.ballsFaced++; targetPlayer.currentOverBalls++; totalBalls++; if (selectedBowlerObj) selectedBowlerObj.ballsBowled++;
        if (targetPlayer.currentOverBalls >= 6) { targetPlayer.isOut = true; totalWickets++; if (selectedBowlerObj) selectedBowlerObj.wicketsTaken++; alert(`Wicket! 6 dots out!`); currentStrikerName = ""; }
    } 
    else if (type === 'four') {
        targetPlayer.ballsFaced++; targetPlayer.foursHit++; totalRuns += 4; totalTeamFours++; totalBalls++; targetPlayer.currentOverBalls = 0; if (selectedBowlerObj) selectedBowlerObj.ballsBowled++; alert(`🎉 4 Hit!`); currentBowlerName = ""; 
    } 
    else if (type === 'out-btn') { targetPlayer.isOut = true; totalWickets++; if (selectedBowlerObj) { selectedBowlerObj.ballsBowled++; selectedBowlerObj.wicketsTaken++; } alert(`❌ OUT!`); currentStrikerName = ""; }
    else if (type === 'bowl-wide' && selectedBowlerObj) { selectedBowlerObj.widesBowled = (selectedBowlerObj.widesBowled || 0) + 1; }
    else if (type === 'bowl-noball' && selectedBowlerObj) { selectedBowlerObj.noBallsBowled = (selectedBowlerObj.noBallsBowled || 0) + 1; }
    else if (type === 'field-point') targetPlayer.fieldingPoints++;

    updateScoreboardDisplay(); renderDualMatrixUI(); rebuildActiveDropdownOptions(); broadcastLiveStateToFirebase();
}

function undoLastBall() {
    if (ballHistory.length === 0) return; let lastEvent = ballHistory.pop();
    totalRuns = lastEvent.totalRuns; totalWickets = lastEvent.totalWickets; totalBalls = lastEvent.totalBalls; currentInnings = lastEvent.currentInnings; totalTeamFours = lastEvent.totalTeamFours; currentStrikerName = lastEvent.currentStrikerName; currentBowlerName = lastEvent.currentBowlerName; matchEnded = lastEvent.matchEnded || false; inningsTransitionPending = lastEvent.inningsTransitionPending || false; matchEndPending = lastEvent.matchEndPending || false; lastWinningTeamName = lastEvent.lastWinningTeamName || "";
    if (matchEnded) document.getElementById("nextMatchCyclePanel").classList.remove("hidden"); else document.getElementById("nextMatchCyclePanel").classList.add("hidden");
    if (inningsTransitionPending) document.getElementById("manualInningsClosurePanel").classList.remove("hidden"); else document.getElementById("manualInningsClosurePanel").classList.add("hidden");
    if (matchEndPending) document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); else document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");
    teamAPlayers = JSON.parse(lastEvent.teamASnapshot); teamBPlayers = JSON.parse(lastEvent.teamBSnapshot); dynamicBowlerSpells = JSON.parse(lastEvent.spellsSnapshot || "[]");
    updateScoreboardDisplay(); renderDualMatrixUI(); rebuildActiveDropdownOptions(); broadcastLiveStateToFirebase();
}

function calculateDailySeriesWins() {
    let winA = 0, winB = 0;
    try {
        matchHistory.forEach(match => {
            if (!match || match.weeklySeriesCode !== activeWeeklySeriesLabel) return;
            if (match.result && (match.result.includes("CSK") || match.result.includes(currentTeamA))) winA++;
            if (match.result && (match.result.includes("SBG") || match.result.includes(currentTeamB))) winB++;
        });
    } catch (err) {} return { winA, winB };
}

function updateScoreboardDisplay() {
    let series = calculateDailySeriesWins();
    document.getElementById("liveSeriesTracker").innerText = "Total Wins CSK (" + series.winA + ") - SBG (" + series.winB + ")";
    
    let fA = teamAPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0), wA = teamAPlayers.filter(p => p.enabled && p.isOut).length;
    let fB = teamBPlayers.filter(p => p.enabled).reduce((sum, p) => sum + p.foursHit, 0), wB = teamBPlayers.filter(p => p.enabled && p.isOut).length;
    let cskF = currentTeamA === "CSK" ? fA : fB, sbgF = currentTeamA === "SBG" ? fA : fB;
    let cskW = currentTeamA === "CSK" ? (currentInnings === 2 ? wA : totalWickets) : (currentInnings === 2 ? totalWickets : wB);
    let sbgW = currentTeamA === "SBG" ? (currentInnings === 2 ? wA : totalWickets) : (currentInnings === 2 ? totalWickets : wB);
    
    document.getElementById("liveTeams").innerText = `${activeMatchIndexLabel} Slot Tracker: CSK [${cskF} / ${cskW}] - SBG [${sbgF} / ${sbgW}]`;

    let currentBattingPool = currentInnings === 1 ? teamAPlayers : teamBPlayers;
    let checkedActiveCount = currentBattingPool.filter(p => p.enabled).length || 10;

    if (currentInnings === 1 && totalWickets >= checkedActiveCount && !inningsTransitionPending) { inningsTransitionPending = true; document.getElementById("manualInningsClosurePanel").classList.remove("hidden"); }
    else if (currentInnings === 2 && !matchEnded && !matchEndPending) {
        if (totalRuns > firstInningsScore) { matchEndPending = true; finalMatchResultText = currentTeamB + " won"; lastWinningTeamName = currentTeamB; document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); }
        else if (totalWickets >= checkedActiveCount) { matchEndPending = true; finalMatchResultText = totalRuns === firstInningsScore ? "Match Tied" : currentTeamA + " won"; lastWinningTeamName = totalRuns === firstInningsScore ? "" : currentTeamA; document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); }
    }
}

function commitInningsTransitionBreak() { firstInningsScore = totalRuns; firstInningsWickets = totalWickets; firstInningsFours = totalTeamFours; currentInnings = 2; totalRuns = 0; totalWickets = 0; totalBalls = 0; totalTeamFours = 0; currentStrikerName = ""; currentBowlerName = ""; inningsTransitionPending = false; document.getElementById("manualInningsClosurePanel").classList.add("hidden"); renderDualMatrixUI(); rebuildActiveDropdownOptions(); updateScoreboardDisplay(); broadcastLiveStateToFirebase(); }
function commitFinalMatchClosureHistory() { matchEnded = true; matchEndPending = false; isMatchActiveShieldEnabled = false; document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden"); document.getElementById("nextMatchCyclePanel").classList.remove("hidden"); saveMatchToHistory(finalMatchResultText); alert(`Match officially recorded under ${activeMatchIndexLabel}!`); }

// ==========================================
// 7. CONTEXT-AWARE MANUAL LEDGER OVERRIDES
// ==========================================
function getActiveLedgerStorageKeyLabel() {
    let scope = document.getElementById("leaderboardFilterScope").value;
    if (scope === "week") {
        return "WEEK:" + (document.getElementById("filterSpecificWeekDropdown").value || "Week 1 - July 14");
    } else if (scope === "month") {
        return "MONTH:" + document.getElementById("filterSpecificMonthDropdown").value;
    } else if (scope === "match-index") {
        return "MATCHINDEX:" + document.getElementById("filterSpecificMatchIndexDropdown").value;
    }
    return "OVERALL";
}

function rebuildLedgerPlayerOptionsDropdown() {
    const selector = document.getElementById("ledgerPlayerSelectorTarget"); if (!selector) return;
    let html = `<option value="">-- Choose Profile to Override --</option>`;
    MASTER_ROSTER.forEach(name => html += `<option value="${name}">${name}</option>`);
    selector.innerHTML = html;
}

function loadSelectedPlayerLedgerProfile(name) {
    if (!name) return;
    let contextKey = getActiveLedgerStorageKeyLabel();
    
    if (!manualLedgerStorage[contextKey]) manualLedgerStorage[contextKey] = {};
    let pData = manualLedgerStorage[contextKey][name] || { matches: 0, silver: 0, gold: 0, fours: 0, wickets: 0, points: 0 };
    
    document.getElementById("ledg_matches").value = pData.matches || 0;
    document.getElementById("ledg_silver").value = pData.silver || 0;
    document.getElementById("ledg_gold").value = pData.gold || 0;
    document.getElementById("ledg_fours").value = pData.fours || 0;
    document.getElementById("ledg_wickets").value = pData.wickets || 0;
    document.getElementById("ledg_points").value = pData.points || 0;
}

function onFilterViewScopeContextChanged() {
    let contextKey = getActiveLedgerStorageKeyLabel();
    document.getElementById("ledgerScopeStatusBadgeLabel").innerText = "Editing Mode Context: " + contextKey.replace("WEEK:", "WEEKLY ").replace("MONTH:", "MONTHLY ").replace("MATCHINDEX:", "");
    
    let name = document.getElementById("ledgerPlayerSelectorTarget").value;
    if (name) { loadSelectedPlayerLedgerProfile(name); }
    renderMatchHistory();
}

function submitManualLedgerOverrideProfile() {
    let name = document.getElementById("ledgerPlayerSelectorTarget").value; if (!name) { alert("Please select a player profile first!"); return; }
    let contextKey = getActiveLedgerStorageKeyLabel();
    
    if (!manualLedgerStorage[contextKey]) manualLedgerStorage[contextKey] = {};
    
    manualLedgerStorage[contextKey][name] = {
        name: name,
        matches: parseInt(document.getElementById("ledg_matches").value) || 0,
        silver: parseInt(document.getElementById("ledg_silver").value) || 0,
        gold: parseInt(document.getElementById("ledg_gold").value) || 0,
        fours: parseInt(document.getElementById("ledg_fours").value) || 0,
        wickets: parseInt(document.getElementById("ledg_wickets").value) || 0,
        points: parseInt(document.getElementById("ledg_points").value) || 0
    };
    
    localStorage.setItem("ns_manual_ledger", JSON.stringify(manualLedgerStorage));
    database.ref("tournament_manual_override_ledger").set(manualLedgerStorage);
    alert(`Success! Saved separate override records for ${name} under ${contextKey.replace("WEEK:", "Weekly ").replace("MONTH:", "Monthly ")} context.`);
    renderMatchHistory();
}

function saveMatchToHistory(resultText) {
    let players = [];
    teamAPlayers.concat(teamBPlayers).filter(p => p.enabled).forEach(p => {
        players.push({ name: p.name, fours: p.foursHit, isNotOut: !p.isOut && (p.ballsFaced > 0 || p.foursHit > 0), ballsFaced: p.ballsFaced, points: p.fieldingPoints, ballsBowled: p.ballsBowled, wickets: p.wicketsTaken });
    });
    const completedMatch = { id: "match_" + Date.now(), timestamp: new Date().toISOString(), weeklySeriesCode: activeWeeklySeriesLabel, matchIndexCode: activeMatchIndexLabel, teams: currentTeamA + " vs " + currentTeamB, result: resultText, totals: currentTeamA + ": " + firstInningsScore + "/" + firstInningsWickets + " | " + currentTeamB + ": " + totalRuns + "/" + totalWickets, players };
    matchHistory.unshift(completedMatch); localStorage.setItem("ns_match_history", JSON.stringify(matchHistory));
    database.ref("tournament_match_history").set(matchHistory); broadcastLiveStateToFirebase();
}

function populateWeeklyFilterDropdownOptions() {
    const sDropdown = document.getElementById("filterSpecificWeekDropdown"); if (!sDropdown) return;
    let weeksPool = new Set(); weeksPool.add("Week 1 - July 14");
    matchHistory.forEach(m => { if (m && m.weeklySeriesCode) weeksPool.add(m.weeklySeriesCode); });
    let html = ""; weeksPool.forEach(w => html += `<option value="${w}">${w}</option>`);
    sDropdown.innerHTML = html;
}

function exportStandingsHubToPNGImage() {
    const element = document.getElementById("snapshotCaptureOuterWrapper"); if (!element) return;
    html2canvas(element, { backgroundColor: "#0f172a", scale: 2 }).then(canvas => {
        const dAnchor = document.createElement("a"); dAnchor.href = canvas.toDataURL("image/png"); dAnchor.download = "NewSmashers_Leaderboard_v6_5.png"; dAnchor.click();
    });
}

// FIXED: COMPLES DATA SEPARATELY BY COMBINING ORIGINAL MATCH ENTRIES AND SPECIFIC OVERRIDE BLUEPRINTS
function renderMatchHistory() {
    const historyContainer = document.getElementById("historyListContainer"); if (!historyContainer) return;
    let filterScope = document.getElementById("leaderboardFilterScope").value;
    let contextKey = getActiveLedgerStorageKeyLabel();
    let filteredMatches = [...matchHistory];

    if (filterScope === "week") {
        let wTarget = document.getElementById("filterSpecificWeekDropdown").value;
        if (wTarget) filteredMatches = filteredMatches.filter(m => m.weeklySeriesCode === wTarget);
    } else if (filterScope === "month") {
        let mTarget = document.getElementById("filterSpecificMonthDropdown").value;
        if (mTarget) filteredMatches = filteredMatches.filter(m => {
            let dateObj = new Date(m.timestamp);
            return String(dateObj.getMonth() + 1).padStart(2, '0') === mTarget;
        });
    } else if (filterScope === "match-index") {
        let idxTarget = document.getElementById("filterSpecificMatchIndexDropdown").value;
        if (idxTarget) filteredMatches = filteredMatches.filter(m => m.matchIndexCode === idxTarget);
    }

    let batsmanMetrics = {}; 
    MASTER_ROSTER.forEach(n => { 
        // Loads data inputs matched strictly to this context profile bucket slice
        let override = (manualLedgerStorage[contextKey] && manualLedgerStorage[contextKey][n]) ? manualLedgerStorage[contextKey][n] : {};
        batsmanMetrics[n] = { name: n, matches: override.matches||0, fours: override.fours||0, silver: override.silver||0, gold: override.gold||0, wickets: override.wickets||0, points: override.points||0 }; 
    });

    filteredMatches.forEach(match => {
        if (match.players) {
            match.players.forEach(p => {
                if (!batsmanMetrics[p.name]) return;
                batsmanMetrics[p.name].matches += 1;
                batsmanMetrics[p.name].fours += (p.fours || 0);
                batsmanMetrics[p.name].wickets += (p.wickets || 0);
                batsmanMetrics[p.name].points += (p.points || 0);
            });
        }
    });

    let lBat = Object.values(batsmanMetrics).filter(p => p.matches > 0 || p.fours > 0).sort((a,b) => b.fours - a.fours);
    let lBowl = Object.values(batsmanMetrics).filter(p => p.matches > 0 || p.wickets > 0).sort((a,b) => b.wickets - a.wickets);
    let lFld = Object.values(batsmanMetrics).filter(p => p.matches > 0 || p.points > 0).sort((a,b) => b.points - a.points);

    let headingTitleText = "OVERALL STATUS SUMMARY";
    if (filterScope === "week") headingTitleText = (document.getElementById("filterSpecificWeekDropdown").value || "WEEKLY REPORT").toUpperCase();
    if (filterScope === "month") headingTitleText = "MONTHLY OVERVIEW OVERVIEW - CODE ID: " + document.getElementById("filterSpecificMonthDropdown").value;
    if (filterScope === "match-index") headingTitleText = "ISOLATED TARGET RUN LOG: " + document.getElementById("filterSpecificMatchIndexDropdown").value;

    let individualMatchLogsHTML = `<h4 style="color:#94a3b8; font-size:12px; text-transform:uppercase; margin-bottom:10px; margin-top:20px;">📋 Individual Raw Game Logs Included</h4>`;
    filteredMatches.forEach(match => {
        individualMatchLogsHTML += `<div class="match-history-card" style="background:#223047; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #334155; font-size:13px;">
            <div style="font-size:11px; color:#94a3b8; font-weight:bold; margin-bottom:2px;">${match.weeklySeriesCode || 'N/A'} - ${match.matchIndexCode || 'N/A'} (${new Date(match.timestamp).toLocaleDateString()})</div>
            <h4 style="color:#fff;">${match.teams}</h4><div>${match.totals}</div><div style="color:#34d399; font-weight:bold; font-size:12px; margin-top:2px;">${match.result}</div>
        </div>`;
    });

    historyContainer.innerHTML = `<div class="snapshot-target-card">
        <h3 style="color:#f59e0b; text-align:center; font-size:14px; margin-bottom:4px; text-transform:uppercase;">🏆 ACCUMULATED STANDINGS HUB (v7.0) 🏆</h3>
        <div style="font-size:11px; text-align:center; color:#94a3b8; font-weight:bold; margin-bottom:12px; text-transform:uppercase;">📊 Scope: ${headingTitleText}</div>
        
        <div class="report-title">🏏 MOST FOURS RANKING</div>
        <table class="report-table">
            <thead><tr><th style="width:10%;">RK</th><th style="width:30%;">PLAYERS</th><th style="width:12%;">MAT</th><th style="width:12%;">4'S</th><th style="width:16%;">S.RATE</th><th style="width:10%;">S</th><th style="width:10%;">G</th></tr></thead>
            <tbody>${lBat.length > 0 ? lBat.map((p,i)=>`<tr><td>${i+1}</td><td><b>${p.name}</b></td><td>${p.matches}</td><td style="color:#3b82f6; font-weight:bold;">${p.fours}</td><td>${p.matches>0?((p.fours/p.matches)*100).toFixed(1):0}%</td><td>${p.silver}</td><td>${p.gold}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center; opacity:0.5;">No recorded entries found</td></tr>'}</tbody>
        </table>
        <div class="report-title">🏃 MOST WICKETS RANKING</div>
        <table class="report-table">
            <thead><tr><th style="width:12%;">RK</th><th style="width:40%;">PLAYERS</th><th style="width:16%;">MAT</th><th style="width:16%;">W'S</th><th style="width:16%;">AVG</th></tr></thead>
            <tbody>${lBowl.length > 0 ? lBowl.map((p,i)=>`<tr><td>${i+1}</td><td><b>${p.name}</b></td><td>${p.matches}</td><td style="color:#ef4444; font-weight:bold;">${p.wickets}</td><td>${p.matches>0?(p.wickets/p.matches).toFixed(2):"0.00"}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center; opacity:0.5;">No recorded entries found</td></tr>'}</tbody>
        </table>
        <div class="report-title">🧤 MOST FIELDING POINTS</div>
        <table class="report-table">
            <thead><tr><th style="width:12%;">RK</th><th style="width:40%;">PLAYERS</th><th style="width:16%;">MAT</th><th style="width:16%;">PTS</th><th style="width:16%;">EFF</th></tr></thead>
            <tbody>${lFld.length > 0 ? lFld.map((p,i)=>`<tr><td>${i+1}</td><td><b>${p.name}</b></td><td>${p.matches}</td><td style="color:#a855f7; font-weight:bold;">${p.points}</td><td>${p.matches>0?(p.points/p.matches).toFixed(1):0}%</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center; opacity:0.5;">No recorded entries found</td></tr>'}</tbody>
        </table>
    </div>` + individualMatchLogsHTML;
}

function toggleFilterInputs(s) {
    document.getElementById("weekFilterGroup").classList.add("hidden"); 
    document.getElementById("monthFilterGroup").classList.add("hidden"); 
    document.getElementById("matchIndexFilterGroup").classList.add("hidden");
    if (s === "week") document.getElementById("weekFilterGroup").classList.remove("hidden");
    else if (s === "month") document.getElementById("monthFilterGroup").classList.remove("hidden");
    else if (s === "match-index") document.getElementById("matchIndexFilterGroup").classList.remove("hidden");
    onFilterViewScopeContextChanged();
}

function clearAllHistory() { if (confirm("Clear history?")) { matchHistory = []; localStorage.removeItem("ns_match_history"); database.ref("tournament_match_history").set([]); renderMatchHistory(); } }
function loadSettingsUI() { document.getElementById("settingVibrate").checked = appSettings.vibrateOnBall; document.getElementById("settingConfirmUndo").checked = appSettings.confirmUndo; }
function saveSettingsFromUI() { appSettings.vibrateOnBall = document.getElementById("settingVibrate").checked; appSettings.confirmUndo = document.getElementById("settingConfirmUndo").checked; localStorage.setItem("ns_settings", JSON.stringify(appSettings)); alert("Saved!"); showMainMenu(); }

function startGlobalCloudSyncListener() {
    checkUserRolePermissions();
    database.ref("tournament_match_history").on("value", s => { const val = s.val(); if (val) { matchHistory = val; localStorage.setItem("ns_match_history", JSON.stringify(matchHistory)); if (!document.getElementById("matchHistoryView").classList.contains("hidden")) renderMatchHistory(); } });
    database.ref("tournament_manual_override_ledger").on("value", s => { const val = s.val(); if (val) { manualLedgerStorage = val; localStorage.setItem("ns_manual_ledger", JSON.stringify(manualLedgerStorage)); if (!document.getElementById("matchHistoryView").classList.contains("hidden")) renderMatchHistory(); } });
    
    if (!isAdmin) {
        database.ref("live_match_stream").on("value", s => {
            const data = s.val(); if (!data) return;
            currentTeamA = data.currentTeamA; currentTeamB = data.currentTeamB; totalRuns = data.totalRuns; totalWickets = data.totalWickets; totalBalls = data.totalBalls; currentInnings = data.currentInnings; firstInningsScore = data.firstInningsScore; firstInningsWickets = data.firstInningsWickets; firstInningsFours = data.firstInningsFours; totalTeamFours = data.totalTeamFours; matchEnded = data.matchEnded; currentStrikerName = data.currentStrikerName; currentBowlerName = data.currentBowlerName; teamAPlayers = data.teamAPlayers; teamBPlayers = data.teamBPlayers; dynamicBowlerSpells = data.dynamicBowlerSpells || []; inningsTransitionPending = data.inningsTransitionPending || false; matchEndPending = data.matchEndPending || false; lastWinningTeamName = data.lastWinningTeamName || ""; activeWeeklySeriesLabel = data.activeWeeklySeriesLabel || "Week 1 - July 14"; activeMatchIndexLabel = data.activeMatchIndexLabel || "Match 1";
            if (matchEnded) document.getElementById("nextMatchCyclePanel").classList.remove("hidden"); else document.getElementById("nextMatchCyclePanel").classList.add("hidden");
            if (inningsTransitionPending) document.getElementById("manualInningsClosurePanel").classList.remove("hidden"); else document.getElementById("manualInningsClosurePanel").classList.add("hidden");
            if (matchEndPending) document.getElementById("manualMatchEndVerificationPanel").classList.remove("hidden"); else document.getElementById("manualMatchEndVerificationPanel").classList.add("hidden");
            hideAllViews(); document.getElementById("scoreboard").classList.remove("hidden"); updateScoreboardDisplay(); renderDualMatrixUI();
        });
    } else { showMainMenu(); }
}
startGlobalCloudSyncListener();
