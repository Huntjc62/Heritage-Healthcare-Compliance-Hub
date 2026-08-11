import { db, auth } from "./firebase.js";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setupShell, esc, scoreStatus, formatDate, isHeadOfficeRole } from "./common.js?v=20260811-final-role-fix";

const REQUIRED = ["marketing", "staff", "documentation", "compliance"];
const TOPICS = ["documentation", "staff", "compliance", "marketing", "quality-governance"];
const TOPIC_LABELS = { marketing: "Marketing", staff: "Staff", documentation: "Documentation", compliance: "Compliance", "quality-governance": "Quality & Governance" };
const DEFAULT_FREQUENCY_MONTHS = { monthly: 1, quarterly: 3, "six-monthly": 6, annual: 12 };
const pct = v => Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : "—";
const statusLabel = s => s === "in-progress" ? "In progress" : s.charAt(0).toUpperCase() + s.slice(1);

setupShell(null, async profile => {
  // Independent role verification: do not rely solely on the shell's
  // normalised role. This prevents a Head Office Staff user from ever
  // falling into the franchisee branch and triggering an officeId error.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No authenticated Firebase user was found.");

  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) {
    throw new Error(`No Firestore users document exists for Firebase UID ${uid}.`);
  }

  const rawRole = userSnap.data().role;
  const headOffice =
    isHeadOfficeRole(rawRole) ||
    ["head office staff", "head office admin", "franchisor"].includes(
      String(rawRole ?? "").trim().toLowerCase()
    );

  // Correct the visible role immediately.
  document.querySelectorAll("[data-user-role]")
    .forEach(el => el.textContent = headOffice ? "Head Office" : "Franchisee");

  if (headOffice) {
    await headOfficeView();
  } else {
    await franchise({ ...profile, role: "franchisee" });
  }
});

function scheduleStatus(s) {
  if (!s) return "scheduled";
  if (s.status === "in-progress" || s.status === "completed") return s.status;
  return s.nextDueDate && s.nextDueDate < new Date().toISOString().slice(0,10) ? "overdue" : "scheduled";
}
function addMonths(dateString, months) { const d = new Date(`${dateString}T12:00:00`); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0,10); }
function frequencyMonths(id) { return DEFAULT_FREQUENCY_MONTHS[id] || 3; }

async function franchise(profile) {
  document.getElementById("franchiseView").classList.remove("hidden");
  if (!profile.officeId) throw new Error("Your user profile needs an officeId.");

  const os = await getDoc(doc(db, "offices", profile.officeId));
  if (!os.exists()) throw new Error("Your assigned office could not be found.");
  const o = os.data();
  document.getElementById("officeName").textContent = o.name || profile.officeId;
  document.getElementById("officeScore").textContent = pct(o.complianceScore);
  ["documentation","staff","compliance","marketing"].forEach(k => document.getElementById(k + "Score").textContent = pct(o.scores?.[k]));
  document.getElementById("qualityScore").textContent = pct(o.scores?.["quality-governance"]);

  const [aSnap, xSnap, sSnap] = await Promise.all([
    getDocs(query(collection(db, "audits"), where("officeId", "==", profile.officeId))),
    getDocs(query(collection(db, "actions"), where("officeId", "==", profile.officeId))),
    getDocs(query(collection(db, "auditSchedules"), where("officeId", "==", profile.officeId)))
  ]);

  const audits = aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status === "completed").sort((a,b) => String(b.completedDate||"").localeCompare(String(a.completedDate||"")) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  const latestByType = {};
  audits.forEach(a => { if (!latestByType[a.auditType]) latestByType[a.auditType] = a; });
  const completedRequired = REQUIRED.filter(t => latestByType[t]).length;
  document.getElementById("dashboardAuditCompletion").textContent = `${completedRequired} / 4`;
  document.getElementById("dashboardAuditProgressBar").style.width = `${completedRequired / 4 * 100}%`;

  const actions = xSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status !== "completed");
  document.getElementById("actionBadge").textContent = actions.length;

  document.getElementById("franchiseAudits").innerHTML = audits.slice(0, 6).map(a => {
    const scoreClass = Number(a.score) >= 90 ? "good" : Number(a.score) >= 80 ? "warning" : "danger";
    return `<div class="list-row"><div><strong>${esc(a.auditTypeName || a.title || "Compliance audit")}</strong><small>${esc(a.completedBy || "Unknown")} · ${formatDate(a.completedDate)}</small></div><span class="status ${scoreClass}">${pct(a.score)}</span></div>`;
  }).join("") || '<div class="empty-state">No completed audits yet.</div>';

  const schedules = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scheduleRows = TOPICS.map(topic => {
    const stored = schedules.find(s => s.auditType === topic);
    const latest = latestByType[topic];
    const freq = stored?.frequency || (topic === "quality-governance" ? "annual" : "quarterly");
    const next = stored?.nextDueDate || (latest?.completedDate ? addMonths(latest.completedDate, frequencyMonths(freq)) : null);
    const status = scheduleStatus(stored || { nextDueDate: next });
    return { topic, next, status };
  }).sort((a,b) => String(a.next||"9999").localeCompare(String(b.next||"9999")));
  document.getElementById("franchiseSchedule").innerHTML = scheduleRows.map(s => `<div class="list-row"><div><strong>${esc(TOPIC_LABELS[s.topic])}</strong><small>${s.next ? `Next due ${formatDate(s.next)}` : "No date scheduled"}</small></div><span class="schedule-status ${s.status}">${statusLabel(s.status)}</span></div>`).join("");

  document.getElementById("franchiseActions").innerHTML = actions.slice(0, 5).map(a => `<div class="list-row"><div><strong>${esc(a.title || "Action")}</strong><small>Due ${esc(a.dueDate || "—")}</small></div><span class="priority ${esc(a.priority || "medium")}">${esc(a.priority || "medium")}</span></div>`).join("") || '<div class="empty-state">No open actions. Great work.</div>';
}

async function headOfficeView() {
  document.getElementById("headOfficeView").classList.remove("hidden");
  const [oSnap, uSnap, aSnap, xSnap, sSnap] = await Promise.all([
    getDocs(collection(db, "offices")), getDocs(collection(db, "users")), getDocs(collection(db, "audits")),
    getDocs(collection(db, "actions")), getDocs(collection(db, "auditSchedules"))
  ]);
  const offices = oSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const users = uSnap.docs.map(d => d.data());
  const audits = aSnap.docs.map(d => d.data()).filter(a => a.status === "completed");
  const actions = xSnap.docs.map(d => d.data()).filter(a => a.status !== "completed");
  const schedules = sSnap.docs.map(d => d.data());

  const scores = offices.map(o => Number(o.complianceScore)).filter(Number.isFinite);
  const avg = scores.length ? scores.reduce((a,b) => a+b,0) / scores.length : 0;
  document.getElementById("networkScore").textContent = pct(avg);
  document.getElementById("officeCount").textContent = offices.length;
  document.getElementById("userCount").textContent = users.length;
  document.getElementById("openActionCount").textContent = actions.length;

  const today = new Date().toISOString().slice(0,10);
  const overdueAudits = schedules.filter(s => scheduleStatus(s) === "overdue").length;
  document.getElementById("overdueAuditCount").textContent = overdueAudits;

  offices.sort((a,b) => (b.complianceScore || 0) - (a.complianceScore || 0));
  const rows = [];
  for (const o of offices) {
    const oa = actions.filter(a => a.officeId === o.id).length;
    const completed = Number(o.requiredAuditsCompleted || 0);
    const completion = o.auditCompletion ?? Math.round(completed / 4 * 100);
    rows.push(`<tr><td><strong>${esc(o.name || o.id)}</strong><small>${esc(o.location || "")}</small></td><td><strong>${pct(o.complianceScore)}</strong></td><td>${completion}%</td><td>${oa}</td><td>${scoreStatus(o.complianceScore)}</td></tr>`);
  }
  document.getElementById("officeTableBody").innerHTML = rows.join("") || '<tr><td colspan="5" class="empty-state">No offices have been added.</td></tr>';

  const statusCounts = { scheduled: 0, "in-progress": 0, completed: 0, overdue: 0 };
  schedules.forEach(s => { const status = scheduleStatus(s); statusCounts[status] = (statusCounts[status] || 0) + 1; });
  document.getElementById("networkAuditSchedule").innerHTML = Object.entries(statusCounts).map(([key,value]) => `<div class="schedule-dashboard-stat"><span>${statusLabel(key)}</span><strong>${value}</strong><small>Audit schedules</small></div>`).join("");
}
