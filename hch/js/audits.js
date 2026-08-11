import { db, auth } from "./firebase.js";
import {
  collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setupShell, esc, formatDate } from "./common.js?v=20260811-ho-staff-v2";

const TYPES = [
  { id: "marketing", label: "Marketing", frequency: "quarterly", months: 3 },
  { id: "staff", label: "Staff", frequency: "quarterly", months: 3 },
  { id: "documentation", label: "Documentation", frequency: "quarterly", months: 3 },
  { id: "compliance", label: "Compliance", frequency: "quarterly", months: 3 },
  { id: "quality-governance", label: "Quality & Governance", frequency: "annual", months: 12 }
];

const REQUIRED = ["marketing", "staff", "documentation", "compliance"];
const $ = id => document.getElementById(id);

let profile = null;
let offices = [];
let audits = [];
let schedules = [];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateString, months) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function percentage(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";
}

function auditType(id) {
  return TYPES.find(t => t.id === id);
}

function showError(message) {
  console.error("AUDITS:", message);

  const loading = $("appLoading");
  const app = $("app");
  if (loading) loading.classList.add("hidden");
  if (app) app.classList.remove("hidden");

  const errorBox = document.querySelector(".page-error");
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }
}

function showMessage(message, error = false) {
  const box = $("auditMessage");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden", "error", "success");
  box.classList.add(error ? "error" : "success");
  setTimeout(() => box.classList.add("hidden"), 4500);
}

function modal(id, open) {
  const el = $(id);
  if (el) el.classList.toggle("hidden", !open);
}

setupShell(null, async userProfile => {
  profile = {
    ...userProfile,
    role: String(userProfile?.role || "").toLowerCase()
  };

  try {
    bindEvents();
    await loadOffices();
    await loadAudits();
    await loadSchedules();
    renderAll();
  } catch (error) {
    showError(`Audits could not load: ${error?.message || error}`);
  }
});

function bindEvents() {
  const on = (id, event, handler) => {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  };

  on("createAudit", "click", () => openCompletedAudit());
  on("scheduleAudit", "click", () => openSchedule());
  on("closeAuditModal", "click", () => modal("auditModal", false));
  on("cancelAudit", "click", () => modal("auditModal", false));
  on("closeScheduleModal", "click", () => modal("scheduleModal", false));
  on("cancelSchedule", "click", () => modal("scheduleModal", false));
  on("closeDetailsModal", "click", () => modal("detailsModal", false));
  on("auditForm", "submit", saveCompletedAudit);
  on("scheduleForm", "submit", saveSchedule);

  on("auditScore", "input", event => {
    const value = Number(event.target.value || 0);
    if ($("auditScoreNumber")) $("auditScoreNumber").value = value;
    if ($("auditScoreOutput")) $("auditScoreOutput").textContent = `${value}%`;
  });

  on("auditScoreNumber", "input", event => {
    const value = Math.max(0, Math.min(100, Number(event.target.value || 0)));
    event.target.value = value;
    if ($("auditScore")) $("auditScore").value = value;
    if ($("auditScoreOutput")) $("auditScoreOutput").textContent = `${value}%`;
  });

  ["officeFilter", "historyOfficeFilter", "scheduleOfficeFilter"].forEach(id => {
    on(id, "change", renderAll);
  });

  on("trendTopicFilter", "change", renderTrend);
}

async function loadOffices() {
  if (profile.role === "franchisor") {
    const snapshot = await getDocs(collection(db, "offices"));
    offices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } else if (profile.officeId) {
    const snapshot = await getDoc(doc(db, "offices", profile.officeId));
    offices = snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : [];
  } else {
    offices = [];
  }

  offices.sort((a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id))
  );

  populateOfficeSelects();
  populateAuditTypes();
}

function populateOfficeSelects() {
  const options = offices
    .map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`)
    .join("");

  ["auditOffice", "scheduleOffice"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = options || `<option value="">No office available</option>`;
  });

  ["officeFilter", "historyOfficeFilter", "scheduleOfficeFilter"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = `<option value="all">All offices</option>${options}`;
    if (profile.role === "franchisee") el.value = profile.officeId || "all";
  });

  if (profile.role === "franchisee") {
    ["auditOffice", "scheduleOffice"].forEach(id => {
      if ($(id)) $(id).disabled = true;
    });
  }
}

function populateAuditTypes() {
  const options = TYPES
    .map(t => `<option value="${t.id}">${t.label}</option>`)
    .join("");

  ["auditType", "scheduleType", "trendTopicFilter"].forEach(id => {
    const el = $(id);
    if (!el) return;
    if (id === "trendTopicFilter") {
      el.innerHTML = `<option value="overall">Overall compliance</option>${options}`;
    } else {
      el.innerHTML = options;
    }
  });

  if ($("scheduleFrequency")) {
    $("scheduleFrequency").innerHTML = `
      <option value="monthly">Monthly</option>
      <option value="quarterly">Quarterly</option>
      <option value="six-monthly">Every 6 months</option>
      <option value="annual">Annual</option>`;
  }

  if ($("scheduleStatus")) {
    $("scheduleStatus").innerHTML = `
      <option value="scheduled">Scheduled</option>
      <option value="in-progress">In progress</option>
      <option value="completed">Completed</option>`;
  }
}

async function loadAudits() {
  const snapshot = profile.role === "franchisor"
    ? await getDocs(collection(db, "audits"))
    : await getDocs(query(
        collection(db, "audits"),
        where("officeId", "==", profile.officeId)
      ));

  audits = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.status === "completed")
    .sort((a, b) =>
      String(b.completedDate || "").localeCompare(String(a.completedDate || ""))
    );
}

async function loadSchedules() {
  const snapshot = profile.role === "franchisor"
    ? await getDocs(collection(db, "auditSchedules"))
    : await getDocs(query(
        collection(db, "auditSchedules"),
        where("officeId", "==", profile.officeId)
      ));

  schedules = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

function officeFilterValue() {
  if (profile.role === "franchisee") return profile.officeId || "none";
  return $("officeFilter")?.value || "all";
}

function visibleAudits() {
  const officeId = officeFilterValue();
  return officeId === "all"
    ? audits
    : audits.filter(a => a.officeId === officeId);
}

function latestAudits(officeId) {
  const result = {};
  audits
    .filter(a => a.officeId === officeId)
    .sort((a, b) =>
      String(b.completedDate || "").localeCompare(String(a.completedDate || ""))
    )
    .forEach(a => {
      if (!result[a.auditType]) result[a.auditType] = a;
    });
  return result;
}

function renderAll() {
  const officeId = officeFilterValue();

  if (profile.role === "franchisor" && officeId === "all") {
    renderNetworkSummary();
  } else {
    renderOfficeSummary(latestAudits(officeId));
  }

  renderSchedules(officeId);
  renderRegister(visibleAudits());
  renderHistory();
  renderTrend();
}

function renderOfficeSummary(latest) {
  const scored = Object.values(latest).map(a => Number(a.score));
  const required = REQUIRED.filter(id => latest[id]).length;

  if ($("overallScore")) $("overallScore").textContent = percentage(average(scored));
  if ($("overallSubtext")) {
    $("overallSubtext").textContent =
      `Based on ${scored.length} of 5 topic scores`;
  }

  if ($("completedRequired")) $("completedRequired").textContent = `${required} / 4`;
  if ($("completionPercent")) {
    $("completionPercent").textContent = `${Math.round(required / 4 * 100)}% complete`;
  }

  if ($("topicsScored")) {
    $("topicsScored").textContent = `${Object.keys(latest).length} / 5`;
  }

  if ($("auditCount")) {
    const officeId = officeFilterValue();
    $("auditCount").textContent =
      audits.filter(a => a.officeId === officeId).length;
  }

  if ($("topicScoreGrid")) {
    $("topicScoreGrid").innerHTML =
      TYPES.map(t => topicCard(t, latest[t.id])).join("");
  }
}

function renderNetworkSummary() {
  const officeScores = offices
    .map(o => average(Object.values(latestAudits(o.id)).map(a => a.score)))
    .filter(Number.isFinite);

  const completedRequired = offices.reduce(
    (total, office) =>
      total + REQUIRED.filter(id => latestAudits(office.id)[id]).length,
    0
  );

  const possible = Math.max(1, offices.length * REQUIRED.length);

  if ($("overallScore")) $("overallScore").textContent = percentage(average(officeScores));
  if ($("overallSubtext")) {
    $("overallSubtext").textContent =
      "Average of latest completed topic scores across the network";
  }

  if ($("completedRequired")) {
    $("completedRequired").textContent =
      `${completedRequired} / ${possible}`;
  }

  if ($("completionPercent")) {
    $("completionPercent").textContent =
      `${Math.round(completedRequired / possible * 100)}% complete`;
  }

  if ($("topicsScored")) {
    $("topicsScored").textContent =
      `${new Set(audits.map(a => a.auditType)).size} / 5`;
  }

  if ($("auditCount")) $("auditCount").textContent = audits.length;

  if ($("topicScoreGrid")) {
    $("topicScoreGrid").innerHTML =
      TYPES.map(t => topicCard(t, null)).join("");
  }
}

function topicCard(type, audit) {
  const score = audit?.score;
  let status = "Not audited";
  let statusClass = "neutral";

  if (score != null) {
    if (Number(score) >= 90) {
      status = "Excellent";
      statusClass = "good";
    } else if (Number(score) >= 80) {
      status = "Needs attention";
      statusClass = "warning";
    } else {
      status = "Requires action";
      statusClass = "danger";
    }
  }

  return `
    <article class="topic-score-card">
      <div class="topic-score-top">
        <div>
          <p class="eyebrow">${esc(type.label)}</p>
          <strong>${percentage(score)}</strong>
        </div>
        <span class="topic-status ${statusClass}">${status}</span>
      </div>
      <small>${audit ? `Latest audit: ${formatDate(audit.completedDate)}` : "No audit recorded"}</small>
    </article>`;
}

function scheduleFor(officeId, typeId) {
  const type = auditType(typeId);
  const stored =
    schedules.find(s => s.officeId === officeId && s.auditType === typeId);
  const latest = latestAudits(officeId)[typeId];

  const frequency = stored?.frequency || type.frequency;
  const months = {
    monthly: 1,
    quarterly: 3,
    "six-monthly": 6,
    annual: 12
  }[frequency] || type.months;

  const due = stored?.nextDueDate ||
    addMonths(latest?.completedDate || today(), months);

  let status = stored?.status || "scheduled";
  if (status !== "in-progress" && status !== "completed" && due < today()) {
    status = "overdue";
  }

  return {
    id: stored?.id || "",
    officeId,
    typeId,
    frequency,
    nextDueDate: due,
    status,
    lastCompletedDate:
      latest?.completedDate || stored?.lastCompletedDate || ""
  };
}

function renderSchedules(filterOfficeId) {
  const targetOffices =
    filterOfficeId === "all"
      ? offices
      : offices.filter(o => o.id === filterOfficeId);

  const list = [];

  targetOffices.forEach(office => {
    TYPES.forEach(type => {
      const schedule = scheduleFor(office.id, type.id);

      list.push(`
        <article class="schedule-card">
          <div class="schedule-card-main">
            <div>
              <p class="eyebrow">${esc(type.label)}</p>
              <h3>${esc(office.name || office.id)}</h3>
            </div>
            <span class="schedule-status ${esc(schedule.status)}">
              ${esc(schedule.status === "in-progress"
                ? "In progress"
                : schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1))}
            </span>
          </div>

          <div class="schedule-meta">
            <span><b>Frequency</b>${esc(schedule.frequency)}</span>
            <span><b>Next due</b>${schedule.nextDueDate ? formatDate(schedule.nextDueDate) : "—"}</span>
            <span><b>Last completed</b>${schedule.lastCompletedDate ? formatDate(schedule.lastCompletedDate) : "Not yet audited"}</span>
          </div>

          ${profile.role === "franchisor" ? `
            <div class="schedule-actions">
              <button class="btn secondary small"
                data-manage="${esc(office.id)}|${esc(type.id)}|${esc(schedule.id)}">
                Manage
              </button>
              <button class="btn primary small"
                data-add="${esc(office.id)}|${esc(type.id)}">
                Add completed audit
              </button>
            </div>` : ""}
        </article>`;
    });
  });

  if ($("scheduleList")) {
    $("scheduleList").innerHTML =
      list.join("") ||
      `<div class="empty-state">No offices available.</div>`;
  }

  document.querySelectorAll("[data-manage]").forEach(button => {
    button.onclick = () => {
      const [officeId, typeId, scheduleId] =
        button.dataset.manage.split("|");
      openSchedule(officeId, typeId, scheduleId);
    };
  });

  document.querySelectorAll("[data-add]").forEach(button => {
    button.onclick = () => {
      const [officeId, typeId] = button.dataset.add.split("|");
      openCompletedAudit(officeId, typeId);
    };
  });
}

function renderRegister(list) {
  if (!$("auditList")) return;

  $("auditList").innerHTML = list.length
    ? list.map(audit => {
        const type = auditType(audit.auditType);
        const office = offices.find(o => o.id === audit.officeId);

        return `
          <article class="audit-record-card">
            <div class="audit-record-icon">✓</div>
            <div class="audit-record-main">
              <div class="audit-record-heading">
                <div>
                  <p class="eyebrow">${esc(type?.label || audit.auditTypeName || "Audit")}</p>
                  <h3>${esc(office?.name || audit.officeName || "Office")}</h3>
                </div>
                <strong class="audit-score-pill">${percentage(audit.score)}</strong>
              </div>

              <div class="audit-record-meta">
                <span>Completed by <strong>${esc(audit.completedBy || "Not recorded")}</strong></span>
                <span>${formatDate(audit.completedDate)}</span>
                <span class="status-chip completed">Completed</span>
              </div>

              <p class="audit-note-preview">
                ${esc(audit.notes || "No future changes or notes recorded.")}
              </p>

              <button class="btn secondary small" data-view-audit="${esc(audit.id)}">
                View audit details
              </button>
            </div>
          </article>`;
      }).join("")
    : `<div class="empty-state">
         <strong>No completed audits yet.</strong>
         <div>Head Office can use “Add completed audit” to record one.</div>
       </div>`;

  document.querySelectorAll("[data-view-audit]").forEach(button => {
    button.onclick = () => openDetails(button.dataset.viewAudit);
  });
}

function renderHistory() {
  const officeId =
    profile.role === "franchisee"
      ? profile.officeId
      : $("historyOfficeFilter")?.value || "all";

  const list = audits
    .filter(a => officeId === "all" || a.officeId === officeId)
    .sort((a, b) =>
      String(a.completedDate || "").localeCompare(
        String(b.completedDate || "")
      )
    );

  let improved = 0;
  let declined = 0;
  let unchanged = 0;

  TYPES.forEach(type => {
    const topicAudits = list.filter(a => a.auditType === type.id);

    for (let i = 1; i < topicAudits.length; i++) {
      const change =
        Number(topicAudits[i].score) -
        Number(topicAudits[i - 1].score);

      if (change > 0) improved++;
      else if (change < 0) declined++;
      else unchanged++;
    }
  });

  if ($("historyImproved")) $("historyImproved").textContent = improved;
  if ($("historyDeclined")) $("historyDeclined").textContent = declined;
  if ($("historyUnchanged")) $("historyUnchanged").textContent = unchanged;

  const changes = [];
  TYPES.forEach(type => {
    const rows = list.filter(a => a.auditType === type.id);
    for (let i = 1; i < rows.length; i++) {
      changes.push(Number(rows[i].score) - Number(rows[i - 1].score));
    }
  });

  const overall = average(changes);

  if ($("historyOverallChange")) {
    $("historyOverallChange").textContent =
      overall == null
        ? "—"
        : `${overall > 0 ? "+" : ""}${overall.toFixed(1)}%`;
  }

  if ($("historyOverallText")) {
    $("historyOverallText").textContent =
      overall == null
        ? "Complete more audits to measure improvement"
        : overall > 0
          ? "Improved overall"
          : overall < 0
            ? "Declined overall"
            : "No overall change";
  }

  if ($("historyTopicGrid")) {
    $("historyTopicGrid").innerHTML = TYPES.map(type => {
      const rows = list.filter(a => a.auditType === type.id);
      const last = rows.at(-1);
      const previous = rows.at(-2);
      const change =
        last && previous
          ? Number(last.score) - Number(previous.score)
          : null;

      return `
        <article class="history-topic-card">
          <p class="eyebrow">${esc(type.label)}</p>
          <strong>${percentage(last?.score)}</strong>
          <div class="history-compare">
            <span>Previous</span>
            <b>${percentage(previous?.score)}</b>
            <em>${change == null ? "First audit" : `${change > 0 ? "+" : ""}${change}%`}</em>
          </div>
        </article>`;
    }).join("");
  }

  const changesRows = [];

  TYPES.forEach(type => {
    const rows = list.filter(a => a.auditType === type.id);
    for (let i = 1; i < rows.length; i++) {
      changesRows.push({
        current: rows[i],
        previous: rows[i - 1],
        type,
        change: Number(rows[i].score) - Number(rows[i - 1].score)
      });
    }
  });

  changesRows.sort((a, b) =>
    String(b.current.completedDate || "").localeCompare(
      String(a.current.completedDate || "")
    )
  );

  if ($("auditHistoryList")) {
    $("auditHistoryList").innerHTML = changesRows.length
      ? changesRows.map(row => `
          <article class="history-row">
            <div class="history-row-date">
              <strong>${formatDate(row.current.completedDate)}</strong>
              <small>${esc(row.current.officeName || "Office")}</small>
            </div>

            <div class="history-row-topic">
              <p class="eyebrow">${esc(row.type.label)}</p>
              <strong>${percentage(row.current.score)}</strong>
              <span>Previous: ${percentage(row.previous.score)}</span>
            </div>

            <div class="history-row-movement">
              <strong>${row.change > 0
                ? "↑ Improved"
                : row.change < 0
                  ? "↓ Declined"
                  : "→ Unchanged"}</strong>
              <span>${row.change > 0 ? "+" : ""}${row.change}%</span>
            </div>

            <div class="history-row-notes">
              <strong>${esc(row.current.completedBy || "Unknown")}</strong>
              <small>${esc(row.current.notes || "No notes recorded.")}</small>
            </div>
          </article>`).join("")
      : `<div class="empty-state">
           Not enough history yet. A topic needs at least two completed audits to measure improvement.
         </div>`;
  }
}

function renderTrend() {
  const officeId = officeFilterValue();
  const topic = $("trendTopicFilter")?.value || "overall";
  const officesToUse =
    officeId === "all"
      ? offices.map(o => o.id)
      : [officeId];

  const grouped = {};

  audits
    .filter(a => officesToUse.includes(a.officeId))
    .filter(a => topic === "overall" || a.auditType === topic)
    .forEach(a => {
      if (!a.completedDate) return;
      grouped[a.completedDate] ??= [];
      grouped[a.completedDate].push(Number(a.score));
    });

  const points = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      value: average(scores)
    }));

  if ($("trendMeta")) {
    $("trendMeta").innerHTML =
      points.length
        ? `<span><b>${officeId === "all" ? "Heritage Healthcare network" : esc(offices.find(o => o.id === officeId)?.name || "Office")}</b></span>
           <span>${esc(topic === "overall" ? "Overall compliance" : auditType(topic)?.label || topic)}</span>
           <span>Latest <b>${percentage(points.at(-1).value)}</b></span>`
        : "No completed audits yet";
  }

  if (!$("trendChart")) return;

  if (points.length < 2) {
    $("trendChart").innerHTML =
      `<div class="trend-empty">Complete at least two audits to see a trend.</div>`;
    return;
  }

  const width = 900;
  const height = 280;
  const pad = { left: 42, right: 18, top: 18, bottom: 40 };

  const x = i =>
    pad.left +
    i / (points.length - 1) * (width - pad.left - pad.right);

  const y = value =>
    pad.top +
    (100 - value) / 100 * (height - pad.top - pad.bottom);

  $("trendChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}">
      ${[0, 25, 50, 75, 100].map(value => `
        <line class="grid-line"
          x1="${pad.left}" y1="${y(value)}"
          x2="${width - pad.right}" y2="${y(value)}"/>
        <text class="axis-label"
          x="6" y="${y(value) + 4}">${value}%</text>
      `).join("")}

      <polyline class="trend-line"
        points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}"/>

      ${points.map((p, i) => `
        <circle class="trend-point"
          cx="${x(i)}" cy="${y(p.value)}" r="4">
          <title>${formatDate(p.date)}: ${percentage(p.value)}</title>
        </circle>
      `).join("")}
    </svg>`;
}

function openCompletedAudit(officeId = null, typeId = null) {
  if (profile.role !== "franchisor") {
    showMessage("Only Head Office can record completed audits.", true);
    return;
  }

  if (!offices.length) {
    showMessage("Create a franchise office first.", true);
    return;
  }

  if ($("auditOffice")) $("auditOffice").value = officeId || offices[0].id;
  if ($("auditType")) $("auditType").value = typeId || "marketing";
  if ($("completedBy")) $("completedBy").value = profile.name || "";
  if ($("completedDate")) $("completedDate").value = today();
  if ($("auditScore")) $("auditScore").value = 0;
  if ($("auditScoreNumber")) $("auditScoreNumber").value = 0;
  if ($("auditScoreOutput")) $("auditScoreOutput").textContent = "0%";
  if ($("auditFinding")) $("auditFinding").value = "";
  if ($("auditNotes")) $("auditNotes").value = "";

  modal("auditModal", true);
}

function openSchedule(officeId = null, typeId = null, scheduleId = null) {
  if (profile.role !== "franchisor") return;

  const existing =
    schedules.find(s => s.id === scheduleId) ||
    schedules.find(s => s.officeId === officeId && s.auditType === typeId);

  if ($("scheduleId")) $("scheduleId").value = existing?.id || "";
  if ($("scheduleOffice")) $("scheduleOffice").value =
    officeId || existing?.officeId || offices[0]?.id || "";
  if ($("scheduleType")) $("scheduleType").value =
    typeId || existing?.auditType || "marketing";
  if ($("scheduleFrequency")) $("scheduleFrequency").value =
    existing?.frequency || "quarterly";
  if ($("scheduleDueDate")) $("scheduleDueDate").value =
    existing?.nextDueDate || addMonths(today(), 3);
  if ($("scheduleStatus")) $("scheduleStatus").value =
    existing?.status || "scheduled";

  modal("scheduleModal", true);
}

async function saveCompletedAudit(event) {
  event.preventDefault();

  if (profile.role !== "franchisor") {
    showMessage("Only Head Office can record completed audits.", true);
    return;
  }

  const officeId = $("auditOffice")?.value;
  const typeId = $("auditType")?.value;
  const type = auditType(typeId);
  const office = offices.find(o => o.id === officeId);

  if (!office || !type) {
    showMessage("Select an office and audit type.", true);
    return;
  }

  const score = Math.max(
    0,
    Math.min(100, Number($("auditScoreNumber")?.value || 0))
  );

  const data = {
    officeId,
    officeName: office.name || officeId,
    auditType: typeId,
    auditTypeName: type.label,
    title: `${type.label} Audit`,
    completedBy: $("completedBy")?.value.trim() || "",
    completedDate: $("completedDate")?.value || today(),
    score,
    finding: $("auditFinding")?.value.trim() || "",
    notes: $("auditNotes")?.value.trim() || "",
    status: "completed",
    createdBy: auth.currentUser?.uid || "",
    createdAt: serverTimestamp(),
    completedAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "audits"), data);

    const existing =
      schedules.find(s =>
        s.officeId === officeId && s.auditType === typeId
      );

    const frequency = existing?.frequency || type.frequency;

    const months = {
      monthly: 1,
      quarterly: 3,
      "six-monthly": 6,
      annual: 12
    }[frequency] || 3;

    const scheduleData = {
      officeId,
      officeName: office.name || officeId,
      auditType: typeId,
      auditTypeName: type.label,
      frequency,
      lastCompletedDate: data.completedDate,
      nextDueDate: addMonths(data.completedDate, months),
      status: "scheduled",
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || ""
    };

    if (existing) {
      await updateDoc(
        doc(db, "auditSchedules", existing.id),
        scheduleData
      );
    } else {
      await addDoc(collection(db, "auditSchedules"), {
        ...scheduleData,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || ""
      });
    }

    await updateOfficeSummary(officeId);

    modal("auditModal", false);
    await loadAudits();
    await loadSchedules();
    renderAll();

    showMessage(`${type.label} audit saved successfully.`);
  } catch (error) {
    showMessage(`The audit could not be saved: ${error.message}`, true);
  }
}

async function updateOfficeSummary(officeId) {
  const snapshot = await getDocs(
    query(collection(db, "audits"), where("officeId", "==", officeId))
  );

  const completed = snapshot.docs
    .map(d => d.data())
    .filter(a => a.status === "completed")
    .sort((a, b) =>
      String(b.completedDate || "").localeCompare(
        String(a.completedDate || "")
      )
    );

  const latest = {};

  completed.forEach(a => {
    if (!latest[a.auditType]) latest[a.auditType] = a;
  });

  const requiredComplete =
    REQUIRED.filter(id => latest[id]).length;

  await updateDoc(doc(db, "offices", officeId), {
    complianceScore:
      Math.round(average(Object.values(latest).map(a => a.score)) || 0),
    auditCompletion:
      Math.round(requiredComplete / REQUIRED.length * 100),
    completedAudits: completed.length,
    requiredAuditsCompleted: requiredComplete,
    requiredAudits: REQUIRED.length,
    lastAuditDate: completed[0]?.completedDate || null,
    updatedAt: serverTimestamp()
  });
}

async function saveSchedule(event) {
  event.preventDefault();

  if (profile.role !== "franchisor") {
    showMessage("Only Head Office can manage audit schedules.", true);
    return;
  }

  const officeId = $("scheduleOffice")?.value;
  const typeId = $("scheduleType")?.value;
  const type = auditType(typeId);
  const office = offices.find(o => o.id === officeId);

  if (!office || !type) {
    showMessage("Select an office and audit type.", true);
    return;
  }

  const data = {
    officeId,
    officeName: office.name || officeId,
    auditType: typeId,
    auditTypeName: type.label,
    frequency: $("scheduleFrequency")?.value || type.frequency,
    nextDueDate: $("scheduleDueDate")?.value || addMonths(today(), 3),
    status: $("scheduleStatus")?.value || "scheduled",
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || ""
  };

  try {
    const id = $("scheduleId")?.value;

    if (id) {
      await updateDoc(doc(db, "auditSchedules", id), data);
    } else {
      await addDoc(collection(db, "auditSchedules"), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || ""
      });
    }

    modal("scheduleModal", false);
    await loadSchedules();
    renderAll();
    showMessage("Audit schedule saved successfully.");
  } catch (error) {
    showMessage(`The schedule could not be saved: ${error.message}`, true);
  }
}

function openDetails(id) {
  const audit = audits.find(a => a.id === id);
  if (!audit) return;

  const type = auditType(audit.auditType);
  const office = offices.find(o => o.id === audit.officeId);

  if ($("detailsType")) $("detailsType").textContent =
    (type?.label || "Audit").toUpperCase();
  if ($("detailsTitle")) $("detailsTitle").textContent =
    `${type?.label || "Audit"} — ${office?.name || audit.officeName || "Office"}`;
  if ($("detailsScore")) $("detailsScore").textContent =
    percentage(audit.score);
  if ($("detailsOffice")) $("detailsOffice").textContent =
    office?.name || audit.officeName || "—";
  if ($("detailsCompletedBy")) $("detailsCompletedBy").textContent =
    audit.completedBy || "—";
  if ($("detailsDate")) $("detailsDate").textContent =
    formatDate(audit.completedDate);
  if ($("detailsFinding")) $("detailsFinding").textContent =
    audit.finding || "No specific finding recorded.";
  if ($("detailsNotes")) $("detailsNotes").textContent =
    audit.notes || "No future changes or notes recorded.";

  modal("detailsModal", true);
}
