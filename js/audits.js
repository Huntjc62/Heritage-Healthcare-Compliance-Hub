import { db, auth } from "./firebase.js";
import {
  collection, getDocs, query, where, doc, addDoc, updateDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setupShell, esc, formatDate } from "./common.js";

const REQUIRED_AUDIT_TYPES = ["marketing", "staff", "documentation", "compliance"];
const AUDIT_TYPES = [
  { id: "marketing", label: "Marketing", description: "Website, Google Business Profile, social media, recruitment marketing and local brand activity." },
  { id: "staff", label: "Staff", description: "Training, DBS, supervision, staff records and people-related compliance." },
  { id: "documentation", label: "Documentation", description: "Client records, care plans, risk assessments, reviews and document control." },
  { id: "compliance", label: "Compliance", description: "Incidents, complaints, safeguarding, policies and regulatory requirements." },
  { id: "quality-governance", label: "Quality & Governance", description: "Quality improvement, governance, leadership oversight and continuous improvement. This is an additional fifth topic." }
];

let profile = null;
let offices = [];
let audits = [];
let selectedAudit = null;

const $ = id => document.getElementById(id);
const pct = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";

setupShell(null, async p => {
  profile = p;
  bindEvents();
  await loadOffices();
  await loadAudits();
});

function bindEvents() {
  $("createAudit").addEventListener("click", openAddAudit);
  $("closeAuditModal").addEventListener("click", closeAddAudit);
  $("cancelAudit").addEventListener("click", closeAddAudit);
  $("closeDetailsModal").addEventListener("click", closeDetails);
  $("auditForm").addEventListener("submit", saveAudit);

  $("auditScore").addEventListener("input", e => {
    $("auditScoreNumber").value = e.target.value;
    $("auditScoreOutput").textContent = `${e.target.value}%`;
  });
  $("auditScoreNumber").addEventListener("input", e => {
    let value = Math.max(0, Math.min(100, Number(e.target.value || 0)));
    e.target.value = value;
    $("auditScore").value = value;
    $("auditScoreOutput").textContent = `${value}%`;
  });
  $("officeFilter").addEventListener("change", render);
  $("historyOfficeFilter").addEventListener("change", renderHistory);
  $("auditType").addEventListener("change", () => {
    const type = AUDIT_TYPES.find(t => t.id === $("auditType").value);
    $("auditNotes").placeholder = type
      ? `Record ${type.label.toLowerCase()} improvements required, future changes, observations or follow-up notes…`
      : "Record improvements required, future changes, observations or follow-up notes…";
  });
}

async function loadOffices() {
  const snap = await getDocs(collection(db, "offices"));
  offices = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

  const officeSelect = $("auditOffice");
  const filter = $("officeFilter");
  if (profile.role === "franchisor") {
    officeSelect.innerHTML = offices.length
      ? offices.map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`).join("")
      : `<option value="">No offices available</option>`;
    filter.innerHTML = `<option value="all">All offices</option>` + offices.map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`).join("");
    $("officeFilterWrap").classList.remove("hidden");
    $("historyOfficeFilter").innerHTML = `<option value="all">All offices</option>` + offices.map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`).join("");
    $("historyOfficeFilterWrap").classList.remove("hidden");
  } else {
    const office = offices.find(o => o.id === profile.officeId);
    officeSelect.innerHTML = office ? `<option value="${esc(office.id)}">${esc(office.name || office.id)}</option>` : `<option value="">Your office</option>`;
    officeSelect.disabled = true;
    $("officeFilterWrap").classList.add("hidden");
    $("historyOfficeFilterWrap").classList.add("hidden");
  }

  $("auditType").innerHTML = AUDIT_TYPES.map(t => `
    <option value="${t.id}">${esc(t.label)}</option>
  `).join("");
  const today = new Date().toISOString().slice(0, 10);
  $("completedDate").value = today;
}

async function loadAudits() {
  let snap;
  if (profile.role === "franchisor") {
    snap = await getDocs(collection(db, "audits"));
  } else {
    snap = await getDocs(query(collection(db, "audits"), where("officeId", "==", profile.officeId)));
  }

  audits = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.status === "completed")
    .sort((a, b) => {
      const ad = String(a.completedDate || "");
      const bd = String(b.completedDate || "");
      return bd.localeCompare(ad) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

  render();
}

function getFilteredAudits() {
  const officeId = profile.role === "franchisee" ? profile.officeId : $("officeFilter").value;
  return officeId === "all" ? audits : audits.filter(a => a.officeId === officeId);
}

function latestScoresForOffice(officeId) {
  const officeAudits = audits
    .filter(a => a.officeId === officeId)
    .sort((a, b) => String(b.completedDate || "").localeCompare(String(a.completedDate || "")) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const latest = {};
  for (const audit of officeAudits) {
    if (!latest[audit.auditType]) latest[audit.auditType] = audit;
  }
  return latest;
}

function getCurrentOfficeId() {
  return profile.role === "franchisee" ? profile.officeId : $("officeFilter").value;
}

function render() {
  const officeId = getCurrentOfficeId();
  const visibleAudits = getFilteredAudits();

  if (profile.role === "franchisor" && officeId === "all") {
    renderNetworkSummary();
  } else {
    renderOfficeSummary(officeId);
  }
  syncHistoryFilter(officeId);
  renderHistory();

  $("auditCount").textContent = visibleAudits.length;
  $("auditList").innerHTML = visibleAudits.length
    ? visibleAudits.map(auditCard).join("")
    : `<div class="empty-state">
         <strong>No completed audits yet.</strong>
         <div>${profile.role === "franchisor" ? "Click “+ Add an audit” to record the first audit." : "Your Head Office team will add completed audits here."}</div>
       </div>`;

  document.querySelectorAll("[data-view-audit]").forEach(btn => {
    btn.addEventListener("click", () => openDetails(btn.dataset.viewAudit));
  });
}

function renderNetworkSummary() {
  const allCompleted = audits.length;
  const officesWithAudits = offices.map(o => ({
    office: o,
    latest: latestScoresForOffice(o.id)
  })).filter(x => Object.keys(x.latest).length);

  const officeScores = officesWithAudits.map(x => {
    const vals = Object.values(x.latest).map(a => Number(a.score)).filter(Number.isFinite);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }).filter(Number.isFinite);

  const average = officeScores.length ? officeScores.reduce((s, v) => s + v, 0) / officeScores.length : null;
  $("overallScore").textContent = pct(average);
  $("overallSubtext").textContent = "Average of the latest completed topic scores across the network";

  const requiredCompletions = officesWithAudits.reduce((sum, x) => {
    return sum + REQUIRED_AUDIT_TYPES.filter(type => x.latest[type]).length;
  }, 0);
  const possible = Math.max(1, offices.length * REQUIRED_AUDIT_TYPES.length);
  const completion = (requiredCompletions / possible) * 100;

  $("completedRequired").textContent = `${requiredCompletions} / ${possible}`;
  $("completionPercent").textContent = `${Math.round(completion)}% complete across required audits`;
  $("topicsScored").textContent = `${new Set(audits.map(a => a.auditType)).size} / 5`;
  $("topicScoreGrid").innerHTML = AUDIT_TYPES.map(t => {
    const vals = audits.filter(a => a.auditType === t.id).map(a => Number(a.score)).filter(Number.isFinite);
    const avgT = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return topicCard(t, avgT, vals.length);
  }).join("");
}

function renderOfficeSummary(officeId) {
  const latest = latestScoresForOffice(officeId);
  const completedRequired = REQUIRED_AUDIT_TYPES.filter(type => latest[type]).length;
  const completion = completedRequired / REQUIRED_AUDIT_TYPES.length * 100;
  const scored = Object.values(latest).map(a => Number(a.score)).filter(Number.isFinite);
  const overall = scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null;

  $("overallScore").textContent = pct(overall);
  $("overallSubtext").textContent = scored.length < 5
    ? `Based on ${scored.length} of 5 topic scores`
    : "Based on all five latest topic scores";

  $("completedRequired").textContent = `${completedRequired} / 4`;
  $("completionPercent").textContent = `${Math.round(completion)}% of minimum audits complete`;
  $("topicsScored").textContent = `${Object.keys(latest).length} / 5`;

  $("topicScoreGrid").innerHTML = AUDIT_TYPES.map(t => {
    const audit = latest[t.id];
    return topicCard(t, audit ? audit.score : null, audit ? 1 : 0, audit);
  }).join("");
}

function topicCard(type, score, count, audit = null) {
  const scoreText = score == null ? "—" : pct(score);
  const status = score == null ? "Not audited" : Number(score) >= 90 ? "Excellent" : Number(score) >= 80 ? "Needs attention" : "Requires action";
  return `
    <article class="topic-score-card">
      <div class="topic-score-top">
        <div>
          <p class="eyebrow">${esc(type.label)}</p>
          <strong>${scoreText}</strong>
        </div>
        <span class="topic-status ${score == null ? "neutral" : Number(score) >= 90 ? "good" : Number(score) >= 80 ? "warning" : "danger"}">${status}</span>
      </div>
      <p>${esc(type.description)}</p>
      <small>${audit ? `Latest audit: ${formatDate(audit.completedDate)}` : `${count ? `${count} audit(s)` : "No audit recorded"}`}</small>
    </article>
  `;
}

function auditCard(a) {
  const type = AUDIT_TYPES.find(t => t.id === a.auditType);
  const office = offices.find(o => o.id === a.officeId);
  const score = Number(a.score);
  const statusClass = score >= 90 ? "good" : score >= 80 ? "warning" : "danger";
  return `
    <article class="audit-record-card">
      <div class="audit-record-icon">✓</div>
      <div class="audit-record-main">
        <div class="audit-record-heading">
          <div>
            <p class="eyebrow">${esc(type?.label || a.auditTypeName || "Audit")}</p>
            <h3>${esc(office?.name || a.officeName || a.officeId || "Office")}</h3>
          </div>
          <strong class="audit-score-pill ${statusClass}">${pct(score)}</strong>
        </div>
        <div class="audit-record-meta">
          <span>Completed by <strong>${esc(a.completedBy || "Not recorded")}</strong></span>
          <span>${formatDate(a.completedDate)}</span>
        </div>
        <p class="audit-note-preview">${esc(a.notes || "No future changes or notes recorded.")}</p>
        <button class="btn secondary small" data-view-audit="${esc(a.id)}">View audit details</button>
      </div>
    </article>
  `;
}

function openAddAudit() {
  if (!offices.length) {
    showMessage("Create a franchise office first, then add an audit.", true);
    return;
  }
  $("auditModal").classList.remove("hidden");
  $("completedBy").value = profile.name || "";
  $("completedDate").value = new Date().toISOString().slice(0, 10);
  $("auditScore").value = 0;
  $("auditScoreNumber").value = 0;
  $("auditScoreOutput").textContent = "0%";
  $("auditNotes").value = "";
  $("saveAuditButton").disabled = false;
}

function closeAddAudit() {
  $("auditModal").classList.add("hidden");
}

function openDetails(id) {
  selectedAudit = audits.find(a => a.id === id);
  if (!selectedAudit) return;
  const type = AUDIT_TYPES.find(t => t.id === selectedAudit.auditType);
  const office = offices.find(o => o.id === selectedAudit.officeId);
  $("detailsType").textContent = (type?.label || selectedAudit.auditTypeName || "AUDIT").toUpperCase();
  $("detailsTitle").textContent = `${type?.label || "Audit"} — ${office?.name || selectedAudit.officeName || "Office"}`;
  $("detailsScore").textContent = pct(selectedAudit.score);
  $("detailsOffice").textContent = office?.name || selectedAudit.officeName || selectedAudit.officeId || "—";
  $("detailsCompletedBy").textContent = selectedAudit.completedBy || "—";
  $("detailsDate").textContent = formatDate(selectedAudit.completedDate);
  $("detailsNotes").textContent = selectedAudit.notes || "No future changes or notes recorded.";
  $("detailsModal").classList.remove("hidden");
}

function closeDetails() {
  $("detailsModal").classList.add("hidden");
  selectedAudit = null;
}

async function saveAudit(event) {
  event.preventDefault();

  const officeId = $("auditOffice").value;
  const typeId = $("auditType").value;
  const type = AUDIT_TYPES.find(t => t.id === typeId);
  const office = offices.find(o => o.id === officeId);
  const completedBy = $("completedBy").value.trim();
  const completedDate = $("completedDate").value;
  const score = Math.max(0, Math.min(100, Number($("auditScoreNumber").value || 0)));
  const notes = $("auditNotes").value.trim();

  if (!office || !type || !completedBy || !completedDate) {
    showMessage("Please complete all required audit fields.", true);
    return;
  }

  $("saveAuditButton").disabled = true;
  $("saveAuditButton").textContent = "Saving…";

  try {
    await addDoc(collection(db, "audits"), {
      officeId,
      officeName: office.name || officeId,
      auditType: type.id,
      auditTypeName: type.label,
      title: `${type.label} Audit`,
      score,
      completedBy,
      completedDate,
      notes,
      status: "completed",
      createdBy: auth.currentUser?.uid || "",
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    await recalculateOffice(officeId);
    closeAddAudit();
    await loadAudits();
    showMessage(`${type.label} audit saved. ${office.name || officeId}'s compliance profile has been updated.`);
  } catch (error) {
    console.error(error);
    showMessage(`The audit could not be saved: ${error.message}`, true);
  } finally {
    $("saveAuditButton").disabled = false;
    $("saveAuditButton").textContent = "Save audit";
  }
}

async function recalculateOffice(officeId) {
  const snap = await getDocs(query(collection(db, "audits"), where("officeId", "==", officeId)));
  const officeAudits = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.status === "completed")
    .sort((a, b) => String(b.completedDate || "").localeCompare(String(a.completedDate || "")) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const latest = {};
  for (const audit of officeAudits) {
    if (!latest[audit.auditType]) latest[audit.auditType] = audit;
  }

  const scores = {};
  for (const type of AUDIT_TYPES) {
    scores[type.id] = latest[type.id] ? Number(latest[type.id].score) : null;
  }

  const scoredValues = Object.values(latest).map(a => Number(a.score)).filter(Number.isFinite);
  const overall = scoredValues.length ? scoredValues.reduce((s, v) => s + v, 0) / scoredValues.length : 0;
  const requiredCompleted = REQUIRED_AUDIT_TYPES.filter(type => latest[type]).length;
  const auditCompletion = requiredCompleted / REQUIRED_AUDIT_TYPES.length * 100;

  await updateDoc(doc(db, "offices", officeId), {
    complianceScore: Math.round(overall),
    auditCompletion: Math.round(auditCompletion),
    completedAudits: officeAudits.length,
    requiredAuditsCompleted: requiredCompleted,
    requiredAudits: REQUIRED_AUDIT_TYPES.length,
    scores,
    lastAuditDate: officeAudits[0]?.completedDate || null,
    updatedAt: serverTimestamp()
  });
}


function syncHistoryFilter(officeId) {
  if (profile.role !== "franchisor") return;
  const historyFilter = $("historyOfficeFilter");
  if (!historyFilter) return;
  historyFilter.value = officeId || "all";
}

function getHistoryOfficeId() {
  if (profile.role === "franchisee") return profile.officeId;
  return $("historyOfficeFilter")?.value || $("officeFilter")?.value || "all";
}

function auditDateValue(a) {
  return String(a.completedDate || "");
}

function auditsForHistory(officeId) {
  return audits
    .filter(a => officeId === "all" ? true : a.officeId === officeId)
    .sort((a, b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

function compareHistory(audit, previous) {
  if (!previous) return { change: null, label: "First audit", cls: "neutral", icon: "•" };
  const change = Number(audit.score) - Number(previous.score);
  if (change > 0) return { change, label: "Improved", cls: "good", icon: "↑" };
  if (change < 0) return { change, label: "Declined", cls: "danger", icon: "↓" };
  return { change: 0, label: "Unchanged", cls: "neutral", icon: "→" };
}

function historyTopicData(officeId) {
  const relevant = auditsForHistory(officeId);
  return AUDIT_TYPES.map(type => {
    const rows = relevant.filter(a => a.auditType === type.id);
    if (!rows.length) return { type, rows: [], latest: null, previous: null, comparison: null };
    const latest = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    return { type, rows, latest, previous, comparison: compareHistory(latest, previous) };
  });
}

function renderHistory() {
  const officeId = getHistoryOfficeId();
  const relevant = auditsForHistory(officeId);
  const targetOffices = officeId === "all" ? offices : offices.filter(o => o.id === officeId);
  const topicData = [];
  const comparisons = [];

  for (const type of AUDIT_TYPES) {
    const officeTopicSets = targetOffices.map(office => {
      const rows = relevant
        .filter(a => a.officeId === office.id && a.auditType === type.id)
        .sort((a,b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      for (let i = 1; i < rows.length; i++) {
        const audit = rows[i];
        const previous = rows[i - 1];
        const comparison = compareHistory(audit, previous);
        comparisons.push({ audit, previous, comparison, type, office });
      }
      return {
        office,
        latest: rows.length ? rows[rows.length - 1] : null,
        previous: rows.length > 1 ? rows[rows.length - 2] : null,
        rows
      };
    });

    const comparable = officeTopicSets.filter(x => x.latest && x.previous);
    const latestScores = comparable.map(x => Number(x.latest.score)).filter(Number.isFinite);
    const previousScores = comparable.map(x => Number(x.previous.score)).filter(Number.isFinite);
    const latestAvg = latestScores.length ? latestScores.reduce((a,b) => a+b, 0) / latestScores.length : null;
    const previousAvg = previousScores.length ? previousScores.reduce((a,b) => a+b, 0) / previousScores.length : null;
    const change = latestAvg != null && previousAvg != null ? latestAvg - previousAvg : null;
    const comparison = change == null ? null : compareHistory({score: latestAvg}, {score: previousAvg});
    topicData.push({ type, latestAvg, previousAvg, change, comparison, officeTopicSets });
  }

  let improved = 0, declined = 0, unchanged = 0;
  comparisons.forEach(({comparison}) => {
    if (comparison.change > 0) improved++;
    else if (comparison.change < 0) declined++;
    else unchanged++;
  });

  $("historyImproved").textContent = improved;
  $("historyDeclined").textContent = declined;
  $("historyUnchanged").textContent = unchanged;

  const comparableOverall = targetOffices.flatMap(office => {
    return AUDIT_TYPES.map(type => {
      const rows = relevant.filter(a => a.officeId === office.id && a.auditType === type.id)
        .sort((a,b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      return rows.length > 1 ? { current: Number(rows[rows.length - 1].score), previous: Number(rows[rows.length - 2].score) } : null;
    });
  }).filter(x => x && Number.isFinite(x.current) && Number.isFinite(x.previous));
  const currentScores = comparableOverall.map(x => x.current);
  const previousScores = comparableOverall.map(x => x.previous);

  if (currentScores.length && previousScores.length) {
    const currentAvg = currentScores.reduce((a,b) => a+b, 0) / currentScores.length;
    const previousAvg = previousScores.reduce((a,b) => a+b, 0) / previousScores.length;
    const change = currentAvg - previousAvg;
    const cls = change > 0 ? "good" : change < 0 ? "danger" : "neutral";
    const label = change > 0 ? "Improved overall" : change < 0 ? "Declined overall" : "No overall change";
    $("historyOverallChange").className = cls;
    $("historyOverallChange").textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
    $("historyOverallText").textContent = `${label} — latest comparable topic average ${Math.round(currentAvg)}% vs ${Math.round(previousAvg)}% previously.`;
  } else {
    $("historyOverallChange").className = "neutral";
    $("historyOverallChange").textContent = "—";
    $("historyOverallText").textContent = relevant.length < 2 ? "Complete more audits to measure improvement." : "Not enough comparable topic history yet.";
  }

  $("historyTopicGrid").innerHTML = topicData.map(item => {
    const latest = item.latestAvg;
    const previous = item.previousAvg;
    const comparison = item.comparison;
    const changeText = comparison?.change === null || comparison?.change === undefined ? "First audit" : `${comparison.change > 0 ? "+" : ""}${comparison.change.toFixed(1)}%`;
    const cls = comparison?.cls || "neutral";
    const officeCount = item.officeTopicSets.filter(x => x.latest).length;
    return `<article class="history-topic-card">
      <div class="history-topic-head"><p class="eyebrow">${esc(item.type.label)}</p><span class="history-movement ${cls}">${comparison?.icon || "•"} ${esc(comparison?.label || "Not audited")}</span></div>
      <strong>${latest == null ? "—" : pct(latest)}</strong>
      <div class="history-compare"><span>Previous</span><b>${previous == null ? "—" : pct(previous)}</b><em class="${cls}">${esc(changeText)}</em></div>
      <small>${latest == null ? "No completed audit" : officeId === "all" ? `${officeCount} office(s) with this topic audited` : `Latest: ${formatDate(item.officeTopicSets[0]?.latest?.completedDate)}`}</small>
    </article>`;
  }).join("");

  comparisons.sort((a,b) => auditDateValue(b.audit).localeCompare(auditDateValue(a.audit)));
  $("auditHistoryList").innerHTML = comparisons.length ? comparisons.map(({audit, previous, comparison, type, office}) => {
    const change = comparison.change;
    return `<article class="history-row">
      <div class="history-row-date"><strong>${formatDate(audit.completedDate)}</strong><small>${esc(office?.name || audit.officeName || "Office")}</small></div>
      <div class="history-row-topic"><p class="eyebrow">${esc(type.label)}</p><strong>${pct(audit.score)}</strong><span>Previous: ${pct(previous.score)}</span></div>
      <div class="history-row-movement ${comparison.cls}"><strong>${comparison.icon} ${esc(comparison.label)}</strong><span>${change > 0 ? "+" : ""}${change}%</span></div>
      <div class="history-row-notes"><strong>${esc(audit.completedBy || "Unknown")}</strong><small>${esc(audit.notes || "No changes or notes recorded.")}</small></div>
      <button class="btn secondary small" data-view-audit="${esc(audit.id)}">View</button>
    </article>`;
  }).join("") : `<div class="empty-state"><strong>Not enough history yet.</strong><div>Once a topic has been audited at least twice, the system will show whether it improved or declined.</div></div>`;

  document.querySelectorAll("#auditHistoryList [data-view-audit]").forEach(btn => {
    btn.addEventListener("click", () => openDetails(btn.dataset.viewAudit));
  });
}

function showMessage(message, error = false) {
  const box = $("auditMessage");
  box.textContent = message;
  box.classList.toggle("error", error);
  box.classList.toggle("success", !error);
  box.classList.remove("hidden");
  window.setTimeout(() => box.classList.add("hidden"), 5000);
}
