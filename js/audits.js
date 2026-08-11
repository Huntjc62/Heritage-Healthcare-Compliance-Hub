import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
  setupShell,
  esc,
  formatDate
} from "./common.js?v=20260811-final-role-fix";

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

function average(values) {
  const numbers = values
    .map(Number)
    .filter(value => Number.isFinite(value));

  if (!numbers.length) return null;

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function percentage(value) {
  return Number.isFinite(Number(value))
    ? `${Math.round(Number(value))}%`
    : "—";
}

function auditType(id) {
  return TYPES.find(type => type.id === id);
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function isHeadOffice() {
  return profile?.role === "franchisor";
}

function showError(message) {
  console.error("Audits:", message);

  const loading = $("appLoading");
  const app = $("app");

  if (loading) loading.classList.add("hidden");
  if (app) app.classList.remove("hidden");

  const error = document.querySelector(".page-error");

  if (error) {
    error.textContent = message;
    error.classList.remove("hidden");
  }
}

function message(text, isError = false) {
  const box = $("auditMessage");

  if (!box) return;

  box.textContent = text;
  box.classList.remove("hidden", "success", "error");
  box.classList.add(isError ? "error" : "success");

  setTimeout(() => box.classList.add("hidden"), 4000);
}

function openModal(id) {
  $(id)?.classList.remove("hidden");
}

function closeModal(id) {
  $(id)?.classList.add("hidden");
}

setupShell(null, async userProfile => {
  profile = userProfile;

  try {
    bindEvents();
    await loadOffices();
    await loadAudits();
    await loadSchedules();

    populateSelects();
    renderOverview();
    renderSchedules();
    renderAudits();

  } catch (error) {
    showError(
      `The Audits page could not load: ${error?.message || error}`
    );
  }
});

function bindEvents() {

  $("createAudit")?.addEventListener("click", () => {
    if (!isHeadOffice()) return;
    openAuditModal();
  });

  $("scheduleAudit")?.addEventListener("click", () => {
    if (!isHeadOffice()) return;
    openScheduleModal();
  });

  $("closeAuditModal")?.addEventListener("click", () =>
    closeModal("auditModal")
  );

  $("cancelAudit")?.addEventListener("click", () =>
    closeModal("auditModal")
  );

  $("closeScheduleModal")?.addEventListener("click", () =>
    closeModal("scheduleModal")
  );

  $("cancelSchedule")?.addEventListener("click", () =>
    closeModal("scheduleModal")
  );

  $("closeDetailsModal")?.addEventListener("click", () =>
    closeModal("detailsModal")
  );

  $("auditForm")?.addEventListener("submit", saveAudit);

  $("scheduleForm")?.addEventListener("submit", saveSchedule);

  $("auditScore")?.addEventListener("input", event => {
    const value = Number(event.target.value);

    $("auditScoreNumber").value = value;
    $("auditScoreOutput").textContent = `${value}%`;
  });

  $("auditScoreNumber")?.addEventListener("input", event => {
    const value = Math.max(
      0,
      Math.min(100, Number(event.target.value || 0))
    );

    $("auditScore").value = value;
    $("auditScoreOutput").textContent = `${value}%`;
  });

  $("officeFilter")?.addEventListener("change", renderAudits);

  $("scheduleOfficeFilter")?.addEventListener(
    "change",
    renderSchedules
  );
}

async function loadOffices() {

  if (isHeadOffice()) {

    const snapshot = await getDocs(
      collection(db, "offices")
    );

    offices = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

  } else if (profile.officeId) {

    const snapshot = await getDoc(
      doc(db, "offices", profile.officeId)
    );

    offices = snapshot.exists()
      ? [{ id: snapshot.id, ...snapshot.data() }]
      : [];

  } else {

    offices = [];
  }

  offices.sort((a, b) =>
    String(a.name || a.id).localeCompare(
      String(b.name || b.id)
    )
  );
}

async function loadAudits() {

  if (isHeadOffice()) {

    const snapshot = await getDocs(
      collection(db, "audits")
    );

    audits = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

  } else if (profile.officeId) {

    const snapshot = await getDocs(
      query(
        collection(db, "audits"),
        where("officeId", "==", profile.officeId)
      )
    );

    audits = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

  } else {

    audits = [];
  }

  audits = audits
    .filter(audit => audit.status === "completed")
    .sort((a, b) =>
      String(b.completedDate || "").localeCompare(
        String(a.completedDate || "")
      )
    );
}

async function loadSchedules() {

  if (isHeadOffice()) {

    const snapshot = await getDocs(
      collection(db, "auditSchedules")
    );

    schedules = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

  } else if (profile.officeId) {

    const snapshot = await getDocs(
      query(
        collection(db, "auditSchedules"),
        where("officeId", "==", profile.officeId)
      )
    );

    schedules = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

  } else {

    schedules = [];
  }
}

function populateSelects() {

  const officeOptions = offices
    .map(office =>
      `<option value="${esc(office.id)}">
        ${esc(office.name || office.id)}
      </option>`
    )
    .join("");

  if ($("auditOffice")) {
    $("auditOffice").innerHTML =
      officeOptions ||
      `<option value="">No offices available</option>`;
  }

  if ($("scheduleOffice")) {
    $("scheduleOffice").innerHTML =
      officeOptions ||
      `<option value="">No offices available</option>`;
  }

  const typeOptions = TYPES
    .map(type =>
      `<option value="${esc(type.id)}">
        ${esc(type.label)}
      </option>`
    )
    .join("");

  if ($("auditType")) $("auditType").innerHTML = typeOptions;
  if ($("scheduleType")) $("scheduleType").innerHTML = typeOptions;

  const filterOptions =
    `<option value="all">All offices</option>${officeOptions}`;

  if ($("officeFilter")) {
    $("officeFilter").innerHTML = filterOptions;

    if (!isHeadOffice()) {
      $("officeFilter").value = profile.officeId || "all";
    }
  }

  if ($("scheduleOfficeFilter")) {
    $("scheduleOfficeFilter").innerHTML = filterOptions;

    if (!isHeadOffice()) {
      $("scheduleOfficeFilter").value =
        profile.officeId || "all";
    }
  }
}

function latestForOffice(officeId) {

  const result = {};

  audits
    .filter(audit => audit.officeId === officeId)
    .sort((a, b) =>
      String(b.completedDate || "").localeCompare(
        String(a.completedDate || "")
      )
    )
    .forEach(audit => {

      if (!result[audit.auditType]) {
        result[audit.auditType] = audit;
      }

    });

  return result;
}

function selectedOfficeId() {

  if (!isHeadOffice()) {
    return profile.officeId || null;
  }

  return $("officeFilter")?.value || "all";
}

function renderOverview() {

  let latestAudits = {};

  if (isHeadOffice()) {

    const selected = selectedOfficeId();

    if (selected !== "all") {
      latestAudits = latestForOffice(selected);
    }

  } else {

    latestAudits = latestForOffice(profile.officeId);
  }

  if (isHeadOffice() && selectedOfficeId() === "all") {

    const officeScores = offices
      .map(office =>
        average(
          Object.values(latestForOffice(office.id))
            .map(audit => audit.score)
        )
      )
      .filter(value => value !== null);

    $("overallScore").textContent =
      percentage(average(officeScores));

    $("overallSubtext").textContent =
      "Average across franchise offices";

    const completedRequired = offices.reduce(
      (total, office) =>
        total +
        REQUIRED.filter(
          type => latestForOffice(office.id)[type]
        ).length,
      0
    );

    const possible = offices.length * REQUIRED.length;

    $("completedRequired").textContent =
      `${completedRequired} / ${possible || 0}`;

    $("completionPercent").textContent =
      possible
        ? `${Math.round(completedRequired / possible * 100)}% complete`
        : "0% complete";

    $("topicsScored").textContent =
      `${new Set(audits.map(audit => audit.auditType)).size} / 5`;

    $("auditCount").textContent = audits.length;

    renderTopicCards({});

    return;
  }

  const scores = Object.values(latestAudits)
    .map(audit => audit.score);

  const required = REQUIRED.filter(
    type => latestAudits[type]
  ).length;

  $("overallScore").textContent =
    percentage(average(scores));

  $("overallSubtext").textContent =
    "Based on latest completed audit scores";

  $("completedRequired").textContent =
    `${required} / 4`;

  $("completionPercent").textContent =
    `${Math.round(required / 4 * 100)}% complete`;

  $("topicsScored").textContent =
    `${Object.keys(latestAudits).length} / 5`;

  $("auditCount").textContent =
    audits.filter(
      audit => audit.officeId === profile.officeId
    ).length;

  renderTopicCards(latestAudits);
}

function renderTopicCards(latest) {

  $("topicScoreGrid").innerHTML =
    TYPES.map(type => {

      const audit = latest[type.id];
      const score = audit?.score;

      let status = "Not audited";

      if (score != null) {

        if (score >= 90) {
          status = "Excellent";
        } else if (score >= 80) {
          status = "Needs attention";
        } else {
          status = "Requires action";
        }
      }

      return `
        <article class="topic-score-card">
          <div class="topic-score-top">
            <div>
              <p class="eyebrow">${esc(type.label)}</p>
              <strong>${percentage(score)}</strong>
            </div>
            <span class="topic-status">
              ${status}
            </span>
          </div>

          <small>
            ${
              audit
                ? `Latest audit: ${formatDate(audit.completedDate)}`
                : "No completed audit"
            }
          </small>
        </article>
      `;

    }).join("");
}

function renderSchedules() {

  const filter =
    isHeadOffice()
      ? ($("scheduleOfficeFilter")?.value || "all")
      : profile.officeId;

  const visible = schedules
    .filter(schedule =>
      filter === "all" ||
      schedule.officeId === filter
    )
    .sort((a, b) =>
      String(a.nextDueDate || "").localeCompare(
        String(b.nextDueDate || "")
      )
    );

  if (!$("scheduleList")) return;

  if (!visible.length) {

    $("scheduleList").innerHTML = `
      <div class="empty-state">
        <strong>No audits scheduled.</strong>
        <div>Scheduled audits will appear here.</div>
      </div>
    `;

    return;
  }

  $("scheduleList").innerHTML =
    visible.map(schedule => {

      const office =
        offices.find(
          item => item.id === schedule.officeId
        );

      const type =
        auditType(schedule.auditType);

      const due = schedule.nextDueDate;
      const overdue =
        due && due < today();

      return `
        <article class="schedule-card">

          <div class="schedule-card-main">

            <div>
              <p class="eyebrow">
                ${esc(type?.label || schedule.auditTypeName || "Audit")}
              </p>

              <h3>
                ${esc(office?.name || schedule.officeName || "Office")}
              </h3>
            </div>

            <span class="schedule-status ${overdue ? "overdue" : "scheduled"}">
              ${overdue ? "Overdue" : "Scheduled"}
            </span>

          </div>

          <div class="schedule-meta">

            <span>
              <b>Due</b>
              ${due ? formatDate(due) : "—"}
            </span>

            <span>
              <b>Frequency</b>
              ${esc(schedule.frequency || "—")}
            </span>

          </div>

          ${
            isHeadOffice()
              ? `
                <div class="schedule-actions">
                  <button
                    class="btn secondary small"
                    data-edit-schedule="${esc(schedule.id)}">
                    Manage
                  </button>

                  <button
                    class="btn primary small"
                    data-complete-schedule="${esc(schedule.officeId)}|${esc(schedule.auditType)}">
                    Add completed audit
                  </button>
                </div>
              `
              : ""
          }

        </article>
      `;

    }).join("");

  document
    .querySelectorAll("[data-edit-schedule]")
    .forEach(button => {

      button.addEventListener("click", () => {
        openScheduleModal(button.dataset.editSchedule);
      });

    });

  document
    .querySelectorAll("[data-complete-schedule]")
    .forEach(button => {

      button.addEventListener("click", () => {

        const [officeId, typeId] =
          button.dataset.completeSchedule.split("|");

        openAuditModal(officeId, typeId);
      });

    });
}

function renderAudits() {

  const filter =
    isHeadOffice()
      ? ($("officeFilter")?.value || "all")
      : profile.officeId;

  const visible = audits.filter(audit =>
    filter === "all" ||
    audit.officeId === filter
  );

  if (!visible.length) {

    $("auditList").innerHTML = `
      <div class="empty-state">
        <strong>No completed audits yet.</strong>
        <div>Completed audits will appear here.</div>
      </div>
    `;

    return;
  }

  $("auditList").innerHTML =
    visible.map(audit => {

      const office =
        offices.find(
          item => item.id === audit.officeId
        );

      const type =
        auditType(audit.auditType);

      return `
        <article class="audit-record-card">

          <div class="audit-record-icon">✓</div>

          <div class="audit-record-main">

            <div class="audit-record-heading">

              <div>
                <p class="eyebrow">
                  ${esc(type?.label || audit.auditTypeName || "Audit")}
                </p>

                <h3>
                  ${esc(office?.name || audit.officeName || "Office")}
                </h3>
              </div>

              <strong class="audit-score-pill">
                ${percentage(audit.score)}
              </strong>

            </div>

            <div class="audit-record-meta">

              <span>
                Completed by
                <strong>${esc(audit.completedBy || "Not recorded")}</strong>
              </span>

              <span>
                ${formatDate(audit.completedDate)}
              </span>

            </div>

            <button
              class="btn secondary small"
              data-view-audit="${esc(audit.id)}">
              View audit
            </button>

          </div>

        </article>
      `;

    }).join("");

  document
    .querySelectorAll("[data-view-audit]")
    .forEach(button => {

      button.addEventListener("click", () => {
        viewAudit(button.dataset.viewAudit);
      });

    });
}

function openAuditModal(officeId = null, typeId = null) {

  if (!isHeadOffice()) return;

  $("auditOffice").value =
    officeId || offices[0]?.id || "";

  $("auditType").value =
    typeId || "marketing";

  $("completedBy").value =
    profile.name || "";

  $("completedDate").value =
    today();

  $("auditScore").value = 0;
  $("auditScoreNumber").value = 0;
  $("auditScoreOutput").textContent = "0%";

  $("auditNotes").value = "";

  openModal("auditModal");
}

function openScheduleModal(scheduleId = null) {

  if (!isHeadOffice()) return;

  const schedule =
    schedules.find(
      item => item.id === scheduleId
    );

  $("scheduleId").value =
    schedule?.id || "";

  $("scheduleOffice").value =
    schedule?.officeId ||
    offices[0]?.id ||
    "";

  $("scheduleType").value =
    schedule?.auditType ||
    "marketing";

  $("scheduleFrequency").value =
    schedule?.frequency ||
    auditType($("scheduleType").value)?.frequency ||
    "quarterly";

  $("scheduleDueDate").value =
    schedule?.nextDueDate ||
    addMonths(
      today(),
      auditType($("scheduleType").value)?.months || 3
    );

  openModal("scheduleModal");
}

async function saveAudit(event) {

  event.preventDefault();

  if (!isHeadOffice()) {
    message(
      "Only Head Office can add completed audits.",
      true
    );
    return;
  }

  const officeId =
    $("auditOffice").value;

  const typeId =
    $("auditType").value;

  const office =
    offices.find(
      item => item.id === officeId
    );

  const type =
    auditType(typeId);

  if (!office || !type) {
    message(
      "Please select an office and audit type.",
      true
    );
    return;
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Number($("auditScoreNumber").value || 0)
      )
    );

  const data = {
    officeId,
    officeName: office.name || officeId,
    auditType: typeId,
    auditTypeName: type.label,
    completedBy: $("completedBy").value.trim(),
    completedDate: $("completedDate").value || today(),
    score,
    notes: $("auditNotes").value.trim(),
    status: "completed",
    createdBy: auth.currentUser?.uid || "",
    createdAt: serverTimestamp(),
    completedAt: serverTimestamp()
  };

  try {

    await addDoc(
      collection(db, "audits"),
      data
    );

    await updateOfficeProfile(officeId);

    // Automatically move the schedule forward after completion.
    const existing =
      schedules.find(
        schedule =>
          schedule.officeId === officeId &&
          schedule.auditType === typeId
      );

    const frequency =
      existing?.frequency ||
      type.frequency;

    const months =
      frequency === "monthly"
        ? 1
        : frequency === "six-monthly"
          ? 6
          : frequency === "annual"
            ? 12
            : 3;

    const scheduleData = {
      officeId,
      officeName: office.name || officeId,
      auditType: typeId,
      auditTypeName: type.label,
      frequency,
      lastCompletedDate: data.completedDate,
      nextDueDate: addMonths(
        data.completedDate,
        months
      ),
      status: "scheduled",
      updatedAt: serverTimestamp()
    };

    if (existing) {

      await updateDoc(
        doc(db, "auditSchedules", existing.id),
        scheduleData
      );

    } else {

      await addDoc(
        collection(db, "auditSchedules"),
        {
          ...scheduleData,
          createdAt: serverTimestamp()
        }
      );

    }

    closeModal("auditModal");

    await loadAudits();
    await loadSchedules();

    renderOverview();
    renderSchedules();
    renderAudits();

    message("Completed audit saved successfully.");

  } catch (error) {

    console.error(error);

    message(
      `The audit could not be saved: ${error.message}`,
      true
    );
  }
}

async function updateOfficeProfile(officeId) {

  const snapshot =
    await getDocs(
      query(
        collection(db, "audits"),
        where("officeId", "==", officeId)
      )
    );

  const completed =
    snapshot.docs
      .map(docSnap => docSnap.data())
      .filter(audit => audit.status === "completed")
      .sort((a, b) =>
        String(b.completedDate || "").localeCompare(
          String(a.completedDate || "")
        )
      );

  const latest = {};

  completed.forEach(audit => {

    if (!latest[audit.auditType]) {
      latest[audit.auditType] = audit;
    }

  });

  const requiredCompleted =
    REQUIRED.filter(
      type => latest[type]
    ).length;

  const complianceScore =
    Math.round(
      average(
        Object.values(latest)
          .map(audit => audit.score)
      ) || 0
    );

  await updateDoc(
    doc(db, "offices", officeId),
    {
      complianceScore,
      auditCompletion:
        Math.round(
          requiredCompleted /
          REQUIRED.length *
          100
        ),
      completedAudits: completed.length,
      requiredAuditsCompleted: requiredCompleted,
      requiredAudits: REQUIRED.length,
      lastAuditDate:
        completed[0]?.completedDate || null,
      updatedAt: serverTimestamp()
    }
  );
}

async function saveSchedule(event) {

  event.preventDefault();

  if (!isHeadOffice()) {
    message(
      "Only Head Office can schedule audits.",
      true
    );
    return;
  }

  const id =
    $("scheduleId").value;

  const officeId =
    $("scheduleOffice").value;

  const typeId =
    $("scheduleType").value;

  const office =
    offices.find(
      item => item.id === officeId
    );

  const type =
    auditType(typeId);

  if (!office || !type) {
    message(
      "Please select an office and audit type.",
      true
    );
    return;
  }

  const data = {
    officeId,
    officeName: office.name || officeId,
    auditType: typeId,
    auditTypeName: type.label,
    frequency: $("scheduleFrequency").value,
    nextDueDate: $("scheduleDueDate").value,
    status: "scheduled",
    updatedAt: serverTimestamp()
  };

  try {

    if (id) {

      await updateDoc(
        doc(db, "auditSchedules", id),
        data
      );

    } else {

      await addDoc(
        collection(db, "auditSchedules"),
        {
          ...data,
          createdAt: serverTimestamp()
        }
      );

    }

    closeModal("scheduleModal");

    await loadSchedules();

    renderSchedules();

    message("Audit schedule saved successfully.");

  } catch (error) {

    console.error(error);

    message(
      `The schedule could not be saved: ${error.message}`,
      true
    );
  }
}

function viewAudit(id) {

  const audit =
    audits.find(
      item => item.id === id
    );

  if (!audit) return;

  const type =
    auditType(audit.auditType);

  const office =
    offices.find(
      item => item.id === audit.officeId
    );

  $("detailsType").textContent =
    (type?.label || "Audit").toUpperCase();

  $("detailsTitle").textContent =
    `${type?.label || "Audit"} — ${
      office?.name ||
      audit.officeName ||
      "Office"
    }`;

  $("detailsScore").textContent =
    percentage(audit.score);

  $("detailsOffice").textContent =
    office?.name ||
    audit.officeName ||
    "—";

  $("detailsCompletedBy").textContent =
    audit.completedBy ||
    "—";

  $("detailsDate").textContent =
    formatDate(audit.completedDate);

  $("detailsNotes").textContent =
    audit.notes ||
    "No future changes or notes recorded.";

  openModal("detailsModal");
}
