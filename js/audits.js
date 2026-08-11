import { db, auth } from "./firebase.js";
import {
  collection, getDocs, query, where, doc, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setupShell, esc, formatDate } from "./common.js";

const REQUIRED_AUDIT_TYPES = ["marketing", "staff", "documentation", "compliance"];
const AUDIT_TYPES = [
  { id: "marketing", label: "Marketing", frequency: "quarterly", description: "Website, Google Business Profile, social media, recruitment marketing and local brand activity." },
  { id: "staff", label: "Staff", frequency: "quarterly", description: "Training, DBS, supervision, staff records and people-related compliance." },
  { id: "documentation", label: "Documentation", frequency: "quarterly", description: "Client records, care plans, risk assessments, reviews and document control." },
  { id: "compliance", label: "Compliance", frequency: "quarterly", description: "Incidents, complaints, safeguarding, policies and regulatory requirements." },
  { id: "quality-governance", label: "Quality & Governance", frequency: "annual", description: "Quality improvement, governance, leadership oversight and continuous improvement. This is an additional fifth topic." }
];

const FREQUENCIES = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "Quarterly", months: 3 },
  { id: "six-monthly", label: "Every 6 months", months: 6 },
  { id: "annual", label: "Annual", months: 12 }
];

let profile = null;
let offices = [];
let audits = [];
let schedules = [];
let selectedAudit = null;

const $ = id => document.getElementById(id);
const pct = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";
const today = () => new Date().toISOString().slice(0, 10);

setupShell(null, async p => {
  profile = p;
  bindEvents();
  await loadOffices();
  await Promise.all([loadAudits(), loadSchedules()]);
});

function bindEvents() {
  $("createAudit").addEventListener("click", () => openAddAudit());
  $("scheduleAudit").addEventListener("click", () => openScheduleModal());
  $("closeAuditModal").addEventListener("click", closeAddAudit);
  $("cancelAudit").addEventListener("click", closeAddAudit);
  $("closeDetailsModal").addEventListener("click", closeDetails);
  $("addAuditAction").addEventListener("click", () => openAuditActionModal(selectedAudit));
  $("closeScheduleModal").addEventListener("click", closeScheduleModal);
  $("cancelSchedule").addEventListener("click", closeScheduleModal);
  $("auditForm").addEventListener("submit", saveAudit);
  $("scheduleForm").addEventListener("submit", saveSchedule);

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
  $("historyOfficeFilter").addEventListener("change", render);
  $("scheduleOfficeFilter").addEventListener("change", render);
  $("trendTopicFilter").addEventListener("change", renderTrend);
  $("scheduleType").addEventListener("change", () => {
    const type = AUDIT_TYPES.find(t => t.id === $("scheduleType").value);
    if (type) $("scheduleFrequency").value = type.frequency;
  });
  $("auditType").addEventListener("change", () => {
    const type = AUDIT_TYPES.find(t => t.id === $("auditType").value);
    $("auditNotes").placeholder = type
      ? `Record ${type.label.toLowerCase()} improvements required, future changes, observations or follow-up notes…`
      : "Record improvements required, future changes, observations or follow-up notes…";
  });
}

async function loadOffices() {
  const snap = await getDocs(collection(db, "offices"));
  offices = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

  const officeOptions = offices.map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`).join("");
  const officeSelect = $("auditOffice");

  if (profile.role === "franchisor") {
    officeSelect.innerHTML = officeOptions || `<option value="">No offices available</option>`;
    $("officeFilter").innerHTML = `<option value="all">All offices</option>${officeOptions}`;
    $("historyOfficeFilter").innerHTML = `<option value="all">All offices</option>${officeOptions}`;
    $("scheduleOfficeFilter").innerHTML = `<option value="all">All offices</option>${officeOptions}`;
    $("scheduleOffice").innerHTML = officeOptions || `<option value="">No offices available</option>`;
    $("officeFilterWrap").classList.remove("hidden");
    $("historyOfficeFilterWrap").classList.remove("hidden");
    $("scheduleOfficeFilterWrap").classList.remove("hidden");
  } else {
    const office = offices.find(o => o.id === profile.officeId);
    const option = office ? `<option value="${esc(office.id)}">${esc(office.name || office.id)}</option>` : `<option value="">Your office</option>`;
    officeSelect.innerHTML = option;
    officeSelect.disabled = true;
    $("officeFilterWrap").classList.add("hidden");
    $("historyOfficeFilterWrap").classList.add("hidden");
    $("scheduleOfficeFilterWrap").classList.add("hidden");
    $("scheduleOffice").innerHTML = option;
    $("scheduleOffice").disabled = true;
  }

  const typeOptions = AUDIT_TYPES.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");
  $("auditType").innerHTML = typeOptions;
  $("scheduleType").innerHTML = typeOptions;
  $("scheduleFrequency").innerHTML = FREQUENCIES.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join("");
  $("scheduleStatus").innerHTML = ["scheduled", "in-progress", "completed", "overdue"]
    .map(s => `<option value="${s}">${s === "in-progress" ? "In progress" : s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
  $("completedDate").value = today();
  $("scheduleDueDate").value = addMonths(today(), 3);
}

async function loadAudits() {
  const snap = profile.role === "franchisor"
    ? await getDocs(collection(db, "audits"))
    : await getDocs(query(collection(db, "audits"), where("officeId", "==", profile.officeId)));

  audits = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.status === "completed")
    .sort((a, b) => String(b.completedDate || "").localeCompare(String(a.completedDate || "")) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function loadSchedules() {
  const snap = profile.role === "franchisor"
    ? await getDocs(collection(db, "auditSchedules"))
    : await getDocs(query(collection(db, "auditSchedules"), where("officeId", "==", profile.officeId)));
  schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function getFilteredAudits() {
  const officeId = profile.role === "franchisee" ? profile.officeId : $("officeFilter").value;
  return officeId === "all" ? audits : audits.filter(a => a.officeId === officeId);
}

function latestScoresForOffice(officeId) {
  const officeAudits = audits.filter(a => a.officeId === officeId)
    .sort((a, b) => String(b.completedDate || "").localeCompare(String(a.completedDate || "")) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const latest = {};
  for (const audit of officeAudits) if (!latest[audit.auditType]) latest[audit.auditType] = audit;
  return latest;
}

function getCurrentOfficeId() {
  return profile.role === "franchisee" ? profile.officeId : $("officeFilter").value;
}

function render() {
  const officeId = getCurrentOfficeId();
  const visibleAudits = getFilteredAudits();
  if (profile.role === "franchisor" && officeId === "all") renderNetworkSummary();
  else renderOfficeSummary(officeId);

  syncHistoryFilter(officeId);
  renderHistory();
  renderSchedules(officeId);
  renderTrend();

  $("auditCount").textContent = visibleAudits.length;
  $("auditList").innerHTML = visibleAudits.length
    ? visibleAudits.map(auditCard).join("")
    : `<div class="empty-state"><strong>No completed audits yet.</strong><div>${profile.role === "franchisor" ? "Click “+ Add an audit” to record the first audit." : "Your Head Office team will add completed audits here."}</div></div>`;

  document.querySelectorAll("[data-view-audit]").forEach(btn => btn.addEventListener("click", () => openDetails(btn.dataset.viewAudit)));
  document.querySelectorAll("[data-complete-audit]").forEach(btn => btn.addEventListener("click", () => openAddAudit(btn.dataset.office, btn.dataset.type)));

}

function renderNetworkSummary() {
  const officesWithAudits = offices.map(o => ({ office: o, latest: latestScoresForOffice(o.id) })).filter(x => Object.keys(x.latest).length);
  const officeScores = officesWithAudits.map(x => average(Object.values(x.latest).map(a => a.score))).filter(Number.isFinite);
  const networkAverage = average(officeScores);
  $("overallScore").textContent = pct(networkAverage);
  $("overallSubtext").textContent = "Average of the latest completed topic scores across the network";

  const requiredCompletions = offices.reduce((sum, o) => sum + REQUIRED_AUDIT_TYPES.filter(type => latestScoresForOffice(o.id)[type]).length, 0);
  const possible = Math.max(1, offices.length * REQUIRED_AUDIT_TYPES.length);
  const completion = requiredCompletions / possible * 100;
  $("completedRequired").textContent = `${requiredCompletions} / ${possible}`;
  $("completionPercent").textContent = `${Math.round(completion)}% complete across required audits`;
  $("topicsScored").textContent = `${new Set(audits.map(a => a.auditType)).size} / 5`;
  $("topicScoreGrid").innerHTML = AUDIT_TYPES.map(t => {
    const vals = audits.filter(a => a.auditType === t.id).map(a => Number(a.score)).filter(Number.isFinite);
    return topicCard(t, average(vals), vals.length);
  }).join("");
}

function renderOfficeSummary(officeId) {
  const latest = latestScoresForOffice(officeId);
  const completedRequired = REQUIRED_AUDIT_TYPES.filter(type => latest[type]).length;
  const scored = Object.values(latest).map(a => Number(a.score)).filter(Number.isFinite);
  $("overallScore").textContent = pct(average(scored));
  $("overallSubtext").textContent = scored.length < 5 ? `Based on ${scored.length} of 5 topic scores` : "Based on all five latest topic scores";
  $("completedRequired").textContent = `${completedRequired} / 4`;
  $("completionPercent").textContent = `${Math.round(completedRequired / 4 * 100)}% of minimum audits complete`;
  $("topicsScored").textContent = `${Object.keys(latest).length} / 5`;
  $("topicScoreGrid").innerHTML = AUDIT_TYPES.map(t => {
    const audit = latest[t.id];
    return topicCard(t, audit ? audit.score : null, audit ? 1 : 0, audit);
  }).join("");
}

function topicCard(type, score, count, audit = null) {
  const scoreText = score == null ? "—" : pct(score);
  const status = score == null ? "Not audited" : Number(score) >= 90 ? "Excellent" : Number(score) >= 80 ? "Needs attention" : "Requires action";
  return `<article class="topic-score-card"><div class="topic-score-top"><div><p class="eyebrow">${esc(type.label)}</p><strong>${scoreText}</strong></div><span class="topic-status ${score == null ? "neutral" : Number(score) >= 90 ? "good" : Number(score) >= 80 ? "warning" : "danger"}">${status}</span></div><p>${esc(type.description)}</p><small>${audit ? `Latest audit: ${formatDate(audit.completedDate)}` : `${count ? `${count} audit(s)` : "No audit recorded"}`}</small></article>`;
}

function auditCard(a) {
  const type = AUDIT_TYPES.find(t => t.id === a.auditType);
  const office = offices.find(o => o.id === a.officeId);
  const score = Number(a.score);
  const statusClass = score >= 90 ? "good" : score >= 80 ? "warning" : "danger";
  return `<article class="audit-record-card"><div class="audit-record-icon">✓</div><div class="audit-record-main"><div class="audit-record-heading"><div><p class="eyebrow">${esc(type?.label || a.auditTypeName || "Audit")}</p><h3>${esc(office?.name || a.officeName || a.officeId || "Office")}</h3></div><strong class="audit-score-pill ${statusClass}">${pct(score)}</strong></div><div class="audit-record-meta"><span>Completed by <strong>${esc(a.completedBy || "Not recorded")}</strong></span><span>${formatDate(a.completedDate)}</span><span class="status-chip completed">Completed</span></div><p class="audit-note-preview">${esc(a.notes || "No future changes or notes recorded.")}</p><button class="btn secondary small" data-view-audit="${esc(a.id)}">View audit details</button></div></article>`;
}

function renderSchedules(officeId) {
  const scheduleOfficeId = profile.role === "franchisee" ? profile.officeId : ($("scheduleOfficeFilter").value || officeId);
  const visibleSchedules = scheduleOfficeId === "all" ? schedules : schedules.filter(s => s.officeId === scheduleOfficeId);
  const cards = [];
  const targetOffices = scheduleOfficeId === "all" ? offices : offices.filter(o => o.id === scheduleOfficeId);

  if (scheduleOfficeId === "all" && profile.role === "franchisor") {
    const statuses = { scheduled: 0, "in-progress": 0, completed: 0, overdue: 0 };
    for (const office of offices) {
      for (const type of AUDIT_TYPES) {
        const schedule = getEffectiveSchedule(office.id, type.id);
        statuses[schedule.status] = (statuses[schedule.status] || 0) + 1;
      }
    }
    $("scheduleSummary").innerHTML = Object.entries(statuses).map(([key, value]) => `<div class="schedule-stat"><span>${statusLabel(key)}</span><strong>${value}</strong></div>`).join("");
  } else {
    const office = targetOffices[0];
    $("scheduleSummary").innerHTML = office ? AUDIT_TYPES.map(type => {
      const s = getEffectiveSchedule(office.id, type.id);
      return `<div class="schedule-stat"><span>${esc(type.label)}</span><strong class="schedule-status ${s.status}">${statusLabel(s.status)}</strong><small>${s.nextDueDate ? `Next due ${formatDate(s.nextDueDate)}` : "No date set"}</small></div>`;
    }).join("") : `<div class="empty-state">No office selected.</div>`;
  }

  const rows = [];
  for (const office of targetOffices) {
    for (const type of AUDIT_TYPES) {
      const s = getEffectiveSchedule(office.id, type.id);
      rows.push(`<article class="schedule-card"><div class="schedule-card-main"><div><p class="eyebrow">${esc(type.label)}</p><h3>${esc(office.name || office.id)}</h3></div><span class="schedule-status ${s.status}">${statusLabel(s.status)}</span></div><div class="schedule-meta"><span><b>Frequency</b>${esc(frequencyLabel(s.frequency))}</span><span><b>Next due</b>${s.nextDueDate ? formatDate(s.nextDueDate) : "—"}</span><span><b>Last completed</b>${s.lastCompletedDate ? formatDate(s.lastCompletedDate) : "Not yet audited"}</span></div><div class="schedule-actions">${profile.role === "franchisor" ? `<button class="btn secondary small" data-edit-schedule="${esc(s.id || "")}" data-office="${esc(office.id)}" data-type="${esc(type.id)}">Manage</button><button class="btn primary small" data-complete-audit="${esc(office.id)}" data-type="${esc(type.id)}">Add completed audit</button>` : ""}</div></article>`);
    }
  }
  $("scheduleList").innerHTML = rows.length ? rows.join("") : `<div class="empty-state">No audit schedules yet.</div>`;

  document.querySelectorAll("[data-edit-schedule]").forEach(btn => btn.addEventListener("click", () => openScheduleModal(btn.dataset.office, btn.dataset.type, btn.dataset.id)));
  document.querySelectorAll("[data-complete-audit]").forEach(btn => btn.addEventListener("click", () => openAddAudit(btn.dataset.office, btn.dataset.type)));
}

function getEffectiveSchedule(officeId, typeId) {
  const stored = schedules.find(s => s.officeId === officeId && s.auditType === typeId);
  const latest = latestScoresForOffice(officeId)[typeId];
  const type = AUDIT_TYPES.find(t => t.id === typeId);
  const frequency = stored?.frequency || type?.frequency || "quarterly";
  let nextDueDate = stored?.nextDueDate || (latest?.completedDate ? addMonths(latest.completedDate, frequencyMonths(frequency)) : addMonths(today(), frequencyMonths(frequency)));
  let status = stored?.status || "scheduled";
  if (status !== "in-progress" && status !== "completed") status = nextDueDate < today() ? "overdue" : "scheduled";
  return { id: stored?.id, officeId, auditType: typeId, frequency, nextDueDate, status, lastCompletedDate: latest?.completedDate || stored?.lastCompletedDate || null };
}

function openScheduleModal(officeId = null, typeId = null, scheduleId = null) {
  if (profile.role !== "franchisor") return;
  const office = officeId || offices[0]?.id || "";
  const type = typeId || AUDIT_TYPES[0].id;
  const existing = schedules.find(s => s.id === scheduleId) || schedules.find(s => s.officeId === office && s.auditType === type);
  $("scheduleModal").classList.remove("hidden");
  $("scheduleOffice").value = office;
  $("scheduleType").value = type;
  $("scheduleFrequency").value = existing?.frequency || AUDIT_TYPES.find(t => t.id === type)?.frequency || "quarterly";
  $("scheduleDueDate").value = existing?.nextDueDate || addMonths(today(), frequencyMonths($("scheduleFrequency").value));
  $("scheduleStatus").value = existing?.status || "scheduled";
  $("scheduleId").value = existing?.id || "";
}

function closeScheduleModal() { $("scheduleModal").classList.add("hidden"); }

async function saveSchedule(event) {
  event.preventDefault();
  const officeId = $("scheduleOffice").value;
  const typeId = $("scheduleType").value;
  const office = offices.find(o => o.id === officeId);
  const type = AUDIT_TYPES.find(t => t.id === typeId);
  if (!office || !type) return showMessage("Please select an office and audit type.", true);
  const payload = {
    officeId, officeName: office.name || officeId, auditType: typeId, auditTypeName: type.label,
    frequency: $("scheduleFrequency").value, nextDueDate: $("scheduleDueDate").value,
    status: $("scheduleStatus").value, updatedBy: auth.currentUser?.uid || "", updatedAt: serverTimestamp()
  };
  const scheduleId = $("scheduleId").value;
  try {
    if (scheduleId) await updateDoc(doc(db, "auditSchedules", scheduleId), payload);
    else await addDoc(collection(db, "auditSchedules"), { ...payload, createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp() });
    closeScheduleModal();
    await loadSchedules();
    render();
    showMessage(`${type.label} audit schedule saved for ${office.name || officeId}.`);
  } catch (error) {
    console.error(error);
    showMessage(`The schedule could not be saved: ${error.message}`, true);
  }
}

async function setScheduleStatus(scheduleId, status) {
  if (!scheduleId) return;
  try {
    await updateDoc(doc(db, "auditSchedules", scheduleId), { status, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || "" });
    await loadSchedules();
    render();
    showMessage(`Audit marked as ${statusLabel(status)}.`);
  } catch (error) { showMessage(`The schedule could not be updated: ${error.message}`, true); }
}

function openAddAudit(officeId = null, typeId = null) {
  if (profile.role !== "franchisor") return showMessage("Only Head Office can record completed audits.", true);
  if (!offices.length) return showMessage("Create a franchise office first, then add an audit.", true);
  $("auditModal").classList.remove("hidden");
  $("auditOffice").value = officeId || (profile.role === "franchisee" ? profile.officeId : offices[0].id);
  $("auditType").value = typeId || AUDIT_TYPES[0].id;
  $("completedBy").value = profile.name || "";
  $("completedDate").value = today();
  $("auditScore").value = 0; $("auditScoreNumber").value = 0; $("auditScoreOutput").textContent = "0%";
  $("auditNotes").value = ""; $("auditFinding").value = "";
  $("saveAuditButton").disabled = false;
}
function closeAddAudit() { $("auditModal").classList.add("hidden"); }

function openDetails(id) {
  selectedAudit = audits.find(a => a.id === id);
  if (!selectedAudit) return;
  const type = AUDIT_TYPES.find(t => t.id === selectedAudit.auditType);
  const office = offices.find(o => o.id === selectedAudit.officeId);
  const historyRows = audits.filter(a => a.officeId === selectedAudit.officeId && a.auditType === selectedAudit.auditType && a.completedDate <= selectedAudit.completedDate).sort((a,b) => String(a.completedDate).localeCompare(String(b.completedDate)));
  const index = historyRows.findIndex(a => a.id === selectedAudit.id);
  const previous = index > 0 ? historyRows[index - 1] : null;
  const change = previous ? Number(selectedAudit.score) - Number(previous.score) : null;

  $("detailsType").textContent = (type?.label || selectedAudit.auditTypeName || "AUDIT").toUpperCase();
  $("detailsTitle").textContent = `${type?.label || "Audit"} — ${office?.name || selectedAudit.officeName || "Office"}`;
  $("detailsScore").textContent = pct(selectedAudit.score);
  $("detailsOffice").textContent = office?.name || selectedAudit.officeName || selectedAudit.officeId || "—";
  $("detailsCompletedBy").textContent = selectedAudit.completedBy || "—";
  $("detailsDate").textContent = formatDate(selectedAudit.completedDate);
  $("detailsChange").textContent = change == null ? "First recorded audit" : `${change > 0 ? "+" : ""}${change}% vs previous`;
  $("detailsNotes").textContent = selectedAudit.notes || "No future changes or notes recorded.";
  const findingBox = $("detailsFinding");
  if (findingBox) findingBox.textContent = selectedAudit.finding || "No specific finding recorded.";
  await renderAuditActions(selectedAudit.id);
  $("detailsModal").classList.remove("hidden");
}
function closeDetails() { $("detailsModal").classList.add("hidden"); selectedAudit = null; }

async function saveAudit(event) {
  event.preventDefault();
  if (profile.role !== "franchisor") return showMessage("Only Head Office can record completed audits.", true);
  const officeId = $("auditOffice").value;
  const typeId = $("auditType").value;
  const type = AUDIT_TYPES.find(t => t.id === typeId);
  const office = offices.find(o => o.id === officeId);
  const completedBy = $("completedBy").value.trim();
  const completedDate = $("completedDate").value;
  const score = Math.max(0, Math.min(100, Number($("auditScoreNumber").value || 0)));
  const notes = $("auditNotes").value.trim();
  const finding = $("auditFinding").value.trim();
  if (!office || !type || !completedBy || !completedDate) return showMessage("Please complete all required audit fields.", true);

  $("saveAuditButton").disabled = true; $("saveAuditButton").textContent = "Saving…";
  try {
    await addDoc(collection(db, "audits"), {
      officeId, officeName: office.name || officeId, auditType: type.id, auditTypeName: type.label,
      title: `${type.label} Audit`, score, completedBy, completedDate, notes, finding, status: "completed",
      createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp(), completedAt: serverTimestamp()
    });

    const existing = schedules.find(s => s.officeId === officeId && s.auditType === typeId);
    const frequency = existing?.frequency || type.frequency;
    const schedulePayload = {
      officeId, officeName: office.name || officeId, auditType: typeId, auditTypeName: type.label,
      frequency, lastCompletedDate: completedDate, nextDueDate: addMonths(completedDate, frequencyMonths(frequency)),
      status: "scheduled", updatedBy: auth.currentUser?.uid || "", updatedAt: serverTimestamp()
    };
    if (existing) await updateDoc(doc(db, "auditSchedules", existing.id), schedulePayload);
    else await addDoc(collection(db, "auditSchedules"), { ...schedulePayload, createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp() });

    await recalculateOffice(officeId);
    closeAddAudit();
    await Promise.all([loadAudits(), loadSchedules()]);
    render();
    showMessage(`${type.label} audit saved. ${office.name || officeId}'s compliance profile and next audit date have been updated.`);
  } catch (error) {
    console.error(error); showMessage(`The audit could not be saved: ${error.message}`, true);
  } finally { $("saveAuditButton").disabled = false; $("saveAuditButton").textContent = "Save audit"; }
}

async function recalculateOffice(officeId) {
  const snap = await getDocs(query(collection(db, "audits"), where("officeId", "==", officeId)));
  const officeAudits = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status === "completed")
    .sort((a,b) => String(b.completedDate || "").localeCompare(String(a.completedDate || "")) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const latest = {};
  for (const audit of officeAudits) if (!latest[audit.auditType]) latest[audit.auditType] = audit;
  const scores = {}; for (const type of AUDIT_TYPES) scores[type.id] = latest[type.id] ? Number(latest[type.id].score) : null;
  const overall = average(Object.values(latest).map(a => a.score));
  const requiredCompleted = REQUIRED_AUDIT_TYPES.filter(type => latest[type]).length;
  await updateDoc(doc(db, "offices", officeId), {
    complianceScore: Math.round(overall || 0), auditCompletion: Math.round(requiredCompleted / 4 * 100), completedAudits: officeAudits.length,
    requiredAuditsCompleted: requiredCompleted, requiredAudits: 4, scores, lastAuditDate: officeAudits[0]?.completedDate || null, updatedAt: serverTimestamp()
  });
}

function renderTrend() {
  const officeId = getCurrentOfficeId();
  const topic = $("trendTopicFilter").value || "overall";
  const officeIds = officeId === "all" ? offices.map(o => o.id) : [officeId];
  const officeName = officeId === "all" ? "Heritage Healthcare network" : (offices.find(o => o.id === officeId)?.name || "Selected office");

  const grouped = new Map();
  audits.filter(a => officeIds.includes(a.officeId)).forEach(a => {
    const key = String(a.completedDate || "");
    if (!key) return;
    let value = null;
    if (topic === "overall") {
      const sameDay = audits.filter(x => officeIds.includes(x.officeId) && String(x.completedDate || "") === key);
      value = average(sameDay.map(x => x.score));
    } else if (a.auditType === topic) {
      value = Number(a.score);
    }
    if (value != null && Number.isFinite(value)) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(value);
    }
  });

  const points = [...grouped.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([date, vals]) => ({date, value: average(vals)}));
  $("trendMeta").innerHTML = `<span><b>${esc(officeName)}</b></span><span>${esc(topic === "overall" ? "Overall compliance" : AUDIT_TYPES.find(t => t.id === topic)?.label || topic)}</span><span>${points.length} audit date${points.length === 1 ? "" : "s"}</span>${points.length ? `<span>Latest <b>${pct(points.at(-1).value)}</b></span>` : ""}`;

  if (points.length < 2) {
    $("trendChart").innerHTML = `<div class="trend-empty"><div><strong>Not enough data for a trend yet.</strong><br>Complete at least two audits for the selected measure to see movement over time.</div></div>`;
    return;
  }

  const width = 900, height = 280, pad = {left: 42, right: 18, top: 18, bottom: 40};
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const x = i => pad.left + (i / (points.length - 1)) * plotW;
  const y = v => pad.top + ((100 - v) / 100) * plotH;
  const line = points.map((p,i) => `${x(i)},${y(p.value)}`).join(" ");
  const grid = [0,25,50,75,100].map(v => `<line class="grid-line" x1="${pad.left}" y1="${y(v)}" x2="${width-pad.right}" y2="${y(v)}"/><text class="axis-label" x="6" y="${y(v)+4}">${v}%</text>`).join("");
  const labels = points.map((p,i) => {
    const d = new Date(`${p.date}T12:00:00`);
    const label = d.toLocaleDateString("en-GB", {day:"2-digit", month:"short"});
    return `<text class="axis-label" text-anchor="middle" x="${x(i)}" y="${height-12}">${esc(label)}</text>`;
  }).join("");
  const circles = points.map((p,i) => `<circle class="trend-point" cx="${x(i)}" cy="${y(p.value)}" r="4"><title>${esc(formatDate(p.date))}: ${pct(p.value)}</title></circle>`).join("");
  $("trendChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Compliance trend chart">${grid}${labels}<polyline class="trend-line" points="${line}"/>${circles}</svg>`;
}

function syncHistoryFilter(officeId) { if (profile.role === "franchisor") { $("historyOfficeFilter").value = officeId || "all"; } }
function getHistoryOfficeId() { return profile.role === "franchisee" ? profile.officeId : $("historyOfficeFilter").value || "all"; }
function auditDateValue(a) { return String(a.completedDate || ""); }
function auditsForHistory(officeId) { return audits.filter(a => officeId === "all" || a.officeId === officeId).sort((a,b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); }
function compareHistory(audit, previous) { if (!previous) return { change: null, label: "First audit", cls: "neutral", icon: "•" }; const change = Number(audit.score) - Number(previous.score); return change > 0 ? { change, label: "Improved", cls: "good", icon: "↑" } : change < 0 ? { change, label: "Declined", cls: "danger", icon: "↓" } : { change: 0, label: "Unchanged", cls: "neutral", icon: "→" }; }

function renderHistory() {
  const officeId = getHistoryOfficeId();
  const relevant = auditsForHistory(officeId);
  const targetOffices = officeId === "all" ? offices : offices.filter(o => o.id === officeId);
  const topicData = [];
  const comparisons = [];

  for (const type of AUDIT_TYPES) {
    const officeTopicSets = targetOffices.map(office => {
      const rows = relevant.filter(a => a.officeId === office.id && a.auditType === type.id).sort((a,b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      for (let i = 1; i < rows.length; i++) comparisons.push({ audit: rows[i], previous: rows[i-1], comparison: compareHistory(rows[i], rows[i-1]), type, office });
      return { office, latest: rows.at(-1) || null, previous: rows.at(-2) || null, rows };
    });
    const comparable = officeTopicSets.filter(x => x.latest && x.previous);
    const latestAvg = average(comparable.map(x => x.latest.score));
    const previousAvg = average(comparable.map(x => x.previous.score));
    const comparison = latestAvg != null && previousAvg != null ? compareHistory({score: latestAvg}, {score: previousAvg}) : null;
    topicData.push({ type, latestAvg, previousAvg, comparison, officeTopicSets });
  }

  let improved = 0, declined = 0, unchanged = 0;
  comparisons.forEach(({comparison}) => { if (comparison.change > 0) improved++; else if (comparison.change < 0) declined++; else unchanged++; });
  $("historyImproved").textContent = improved; $("historyDeclined").textContent = declined; $("historyUnchanged").textContent = unchanged;

  const comparableOverall = targetOffices.flatMap(office => AUDIT_TYPES.map(type => {
    const rows = relevant.filter(a => a.officeId === office.id && a.auditType === type.id).sort((a,b) => auditDateValue(a).localeCompare(auditDateValue(b)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    return rows.length > 1 ? { current: Number(rows.at(-1).score), previous: Number(rows.at(-2).score) } : null;
  })).filter(x => x && Number.isFinite(x.current) && Number.isFinite(x.previous));
  const currentAvg = average(comparableOverall.map(x => x.current));
  const previousAvg = average(comparableOverall.map(x => x.previous));
  if (currentAvg != null && previousAvg != null) {
    const change = currentAvg - previousAvg; const cls = change > 0 ? "good" : change < 0 ? "danger" : "neutral";
    $("historyOverallChange").className = cls; $("historyOverallChange").textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
    $("historyOverallText").textContent = `${change > 0 ? "Improved overall" : change < 0 ? "Declined overall" : "No overall change"} — latest comparable average ${Math.round(currentAvg)}% vs ${Math.round(previousAvg)}% previously.`;
  } else { $("historyOverallChange").className = "neutral"; $("historyOverallChange").textContent = "—"; $("historyOverallText").textContent = relevant.length < 2 ? "Complete more audits to measure improvement." : "Not enough comparable topic history yet."; }

  $("historyTopicGrid").innerHTML = topicData.map(item => {
    const c = item.comparison; const cls = c?.cls || "neutral"; const changeText = c?.change == null ? "First audit" : `${c.change > 0 ? "+" : ""}${c.change.toFixed(1)}%`;
    const officeCount = item.officeTopicSets.filter(x => x.latest).length;
    return `<article class="history-topic-card"><div class="history-topic-head"><p class="eyebrow">${esc(item.type.label)}</p><span class="history-movement ${cls}">${c?.icon || "•"} ${esc(c?.label || "Not audited")}</span></div><strong>${item.latestAvg == null ? "—" : pct(item.latestAvg)}</strong><div class="history-compare"><span>Previous</span><b>${item.previousAvg == null ? "—" : pct(item.previousAvg)}</b><em class="${cls}">${esc(changeText)}</em></div><small>${item.latestAvg == null ? "No completed audit" : officeId === "all" ? `${officeCount} office(s) with this topic audited` : `Latest: ${formatDate(item.officeTopicSets[0]?.latest?.completedDate)}`}</small></article>`;
  }).join("");

  comparisons.sort((a,b) => auditDateValue(b.audit).localeCompare(auditDateValue(a.audit)));
  $("auditHistoryList").innerHTML = comparisons.length ? comparisons.map(({audit, previous, comparison, type, office}) => `<article class="history-row"><div class="history-row-date"><strong>${formatDate(audit.completedDate)}</strong><small>${esc(office?.name || audit.officeName || "Office")}</small></div><div class="history-row-topic"><p class="eyebrow">${esc(type.label)}</p><strong>${pct(audit.score)}</strong><span>Previous: ${pct(previous.score)}</span></div><div class="history-row-movement ${comparison.cls}"><strong>${comparison.icon} ${esc(comparison.label)}</strong><span>${comparison.change > 0 ? "+" : ""}${comparison.change}%</span></div><div class="history-row-notes"><strong>${esc(audit.completedBy || "Unknown")}</strong><small>${esc(audit.notes || "No changes or notes recorded.")}</small></div><button class="btn secondary small" data-view-audit="${esc(audit.id)}">View</button></article>`).join("") : `<div class="empty-state"><strong>Not enough history yet.</strong><div>Once a topic has been audited at least twice, the system will show whether it improved or declined.</div></div>`;
  document.querySelectorAll("#auditHistoryList [data-view-audit]").forEach(btn => btn.addEventListener("click", () => openDetails(btn.dataset.viewAudit)));
}


async function renderAuditActions(auditId){
  const snap=await getDocs(query(collection(db,"actions"),where("auditId","==",auditId)));
  const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("auditActionList").innerHTML=rows.length?rows.map(a=>`<article class="action-card compact">
    <div class="action-main"><div class="action-title-row"><h4>${esc(a.title||"Action")}</h4><span class="priority ${esc(a.priority||"medium")}">${esc(a.priority||"medium")}</span></div>
    ${a.finding?`<div class="finding-inline"><strong>Finding:</strong> ${esc(a.finding)}</div>`:""}<p>${esc(a.description||"")}</p>
    <div class="action-meta"><span>Owner: ${esc(a.owner||"—")}</span><span>Due: ${esc(a.dueDate||"—")}</span><span>Status: ${esc(a.status||"open")}</span></div></div></article>`).join(""):'<div class="empty-state">No actions linked to this audit yet.</div>';
}
async function openAuditActionModal(audit){
  if(!audit || profile.role!=="franchisor") return;
  const title=prompt("Action title (what needs to happen?)");
  if(!title) return;
  const finding=prompt("Finding / issue identified");
  const owner=prompt("Action owner (e.g. Franchise Manager)");
  const dueDate=prompt("Due date (YYYY-MM-DD)");
  const priority=(prompt("Priority: high, medium or low","medium")||"medium").toLowerCase();
  const description=prompt("Action details / required change")||"";
  const office=offices.find(o=>o.id===audit.officeId);
  await addDoc(collection(db,"actions"),{
    title:title.trim(),finding:(finding||"").trim(),owner:(owner||"").trim(),dueDate:(dueDate||"").trim(),
    priority:["high","medium","low"].includes(priority)?priority:"medium",description:description.trim(),
    status:"open",officeId:audit.officeId,officeName:office?.name||audit.officeName||audit.officeId,
    auditId:audit.id,auditTypeName:audit.auditTypeName||audit.auditType,createdAt:serverTimestamp(),createdBy:profile.uid
  });
  await renderAuditActions(audit.id);
  showMessage("Action linked to the audit.");
}
function average(values) { const nums = values.map(Number).filter(Number.isFinite); return nums.length ? nums.reduce((a,b) => a+b, 0) / nums.length : null; }
function frequencyMonths(id) { return FREQUENCIES.find(f => f.id === id)?.months || 3; }
function frequencyLabel(id) { return FREQUENCIES.find(f => f.id === id)?.label || "Quarterly"; }
function addMonths(dateString, months) { const d = new Date(`${dateString}T12:00:00`); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0,10); }
function statusLabel(status) { return status === "in-progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1); }
function showMessage(message, error = false) { const box = $("auditMessage"); box.textContent = message; box.classList.toggle("error", error); box.classList.toggle("success", !error); box.classList.remove("hidden"); window.setTimeout(() => box.classList.add("hidden"), 5000); }
