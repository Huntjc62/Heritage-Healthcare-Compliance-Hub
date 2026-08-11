import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const loading = document.getElementById("appLoading");
const app = document.getElementById("app");
const errorBox = document.getElementById("dashboardError");

let currentUser;
let profile;

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function pct(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "—";
}

function status(score) {
  if (score >= 90) return '<span class="status good">Excellent</span>';
  if (score >= 80) return '<span class="status warning">Needs attention</span>';
  return '<span class="status danger">Requires action</span>';
}

document.getElementById("logoutButton").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html";
  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      showError("Your Firebase Authentication account has no matching users document.");
      loading.classList.add("hidden"); app.classList.remove("hidden"); return;
    }

    profile = userSnap.data();
    document.getElementById("userName").textContent = profile.name || user.email;
    document.getElementById("userRole").textContent = profile.role === "franchisor" ? "Head Office" : "Franchisee";
    document.getElementById("userAvatar").textContent = (profile.name || user.email).charAt(0).toUpperCase();
    document.getElementById("roleLabel").textContent = profile.role === "franchisor" ? "HEAD OFFICE" : "FRANCHISE DASHBOARD";
    document.getElementById("pageTitle").textContent = profile.role === "franchisor" ? "Network overview" : "Your compliance dashboard";

    if (profile.role === "franchisor") await loadHeadOffice();
    else await loadFranchise();

    loading.classList.add("hidden");
    app.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showError("Dashboard could not load. Check your Firestore data and Security Rules.");
    loading.classList.add("hidden"); app.classList.remove("hidden");
  }
});

async function loadFranchise() {
  document.getElementById("franchiseView").classList.remove("hidden");

  const officeId = profile.officeId;
  if (!officeId) {
    showError("Your user profile needs an officeId.");
    return;
  }

  const officeSnap = await getDoc(doc(db, "offices", officeId));
  if (!officeSnap.exists()) {
    showError("Your assigned office could not be found.");
    return;
  }

  const office = officeSnap.data();
  document.getElementById("officeName").textContent = office.name || "Your Franchise";
  document.getElementById("officeScore").textContent = pct(office.complianceScore);
  document.getElementById("documentationScore").textContent = pct(office.scores?.documentation);
  document.getElementById("staffScore").textContent = pct(office.scores?.staff);
  document.getElementById("complianceScore").textContent = pct(office.scores?.compliance);
  document.getElementById("marketingScore").textContent = pct(office.scores?.marketing);

  const auditQuery = query(collection(db, "audits"), where("officeId", "==", officeId));
  const auditSnap = await getDocs(auditQuery);
  const audits = auditSnap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 5);

  document.getElementById("franchiseAudits").innerHTML = audits.length
    ? audits.map(a => `<div class="list-row"><div><strong>${a.title || "Compliance audit"}</strong><small>${a.status || "Assigned"} · ${a.score != null ? pct(a.score) : "Not completed"}</small></div><span class="status ${a.status === "completed" ? "good" : "warning"}">${a.status || "assigned"}</span></div>`).join("")
    : '<div class="empty-state">No audits have been assigned yet.</div>';

  const actionQuery = query(collection(db, "actions"), where("officeId", "==", officeId));
  const actionSnap = await getDocs(actionQuery);
  const actions = actionSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status !== "completed").slice(0, 5);
  document.getElementById("actionBadge").textContent = actions.length;

  document.getElementById("franchiseActions").innerHTML = actions.length
    ? actions.map(a => `<div class="list-row"><div><strong>${a.title || "Action"}</strong><small>Due ${a.dueDate || "—"}</small></div><span class="priority ${a.priority || "medium"}">${a.priority || "medium"}</span></div>`).join("")
    : '<div class="empty-state">No open actions. Great work.</div>';
}

async function loadHeadOffice() {
  document.getElementById("headOfficeView").classList.remove("hidden");
  document.getElementById("officesNav").classList.remove("hidden");
  document.getElementById("usersNav").classList.remove("hidden");

  const [officeSnap, userSnap, actionSnap] = await Promise.all([
    getDocs(collection(db, "offices")),
    getDocs(collection(db, "users")),
    getDocs(query(collection(db, "actions"), where("status", "!=", "completed")))
  ]);

  const offices = officeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const actions = actionSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const scores = offices.map(o => Number(o.complianceScore)).filter(n => !Number.isNaN(n));
  const average = scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0;

  document.getElementById("networkScore").textContent = pct(average);
  document.getElementById("officeCount").textContent = offices.length;
  document.getElementById("userCount").textContent = users.length;
  document.getElementById("openActionCount").textContent = actions.length;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("overdueActionCount").textContent = actions.filter(a => a.dueDate && a.dueDate < today).length;

  offices.sort((a,b) => (b.complianceScore || 0) - (a.complianceScore || 0));

  const tbody = document.getElementById("officeTableBody");
  tbody.innerHTML = offices.length ? offices.map(o => `
    <tr>
      <td><strong>${o.name || "Unnamed office"}</strong><small>${o.location || ""}</small></td>
      <td><strong>${pct(o.complianceScore)}</strong></td>
      <td>${o.auditCompletion ?? "—"}%</td>
      <td>${o.openActions ?? "—"}</td>
      <td>${status(o.complianceScore || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="empty-state">No offices have been added yet.</td></tr>`;
}
