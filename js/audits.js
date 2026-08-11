import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const loading = document.getElementById("appLoading");
const app = document.getElementById("app");
const errorBox = document.getElementById("auditError");
let profile;

const questions = [
  { id:"q1", section:"Documentation", text:"Client records reviewed" },
  { id:"q2", section:"Documentation", text:"Care plans reviewed" },
  { id:"q3", section:"Documentation", text:"Risk assessments reviewed" },
  { id:"q4", section:"Documentation", text:"Reviews completed" },
  { id:"q5", section:"Staff", text:"Training records checked" },
  { id:"q6", section:"Staff", text:"DBS records checked" },
  { id:"q7", section:"Staff", text:"Supervisions completed" },
  { id:"q8", section:"Staff", text:"Staff files reviewed" },
  { id:"q9", section:"Compliance", text:"Incidents reviewed" },
  { id:"q10", section:"Compliance", text:"Complaints reviewed" },
  { id:"q11", section:"Compliance", text:"Safeguarding records checked" },
  { id:"q12", section:"Compliance", text:"Policies reviewed" },
  { id:"q13", section:"Marketing", text:"Website checked" },
  { id:"q14", section:"Marketing", text:"Google Business Profile checked" },
  { id:"q15", section:"Marketing", text:"Social media active" },
  { id:"q16", section:"Marketing", text:"Recruitment advertising checked" }
];

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

document.getElementById("logoutButton").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (!user) return window.location.href = "index.html";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) throw new Error("Missing users document");
    profile = snap.data();

    document.getElementById("userName").textContent = profile.name || user.email;
    document.getElementById("userRole").textContent = profile.role === "franchisor" ? "Head Office" : "Franchisee";
    document.getElementById("userAvatar").textContent = (profile.name || user.email).charAt(0).toUpperCase();

    if (profile.role === "franchisor") {
      document.getElementById("seedAuditButton").classList.remove("hidden");
      document.getElementById("seedAuditButton").addEventListener("click", createDemoAudit);
    }

    await loadAudits();
    renderQuestions();

    loading.classList.add("hidden");
    app.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showError("Audits could not load. Check your Firebase setup.");
    loading.classList.add("hidden"); app.classList.remove("hidden");
  }
});

async function loadAudits() {
  let snap;
  if (profile.role === "franchisor") {
    snap = await getDocs(collection(db, "audits"));
  } else {
    snap = await getDocs(query(collection(db, "audits"), where("officeId", "==", profile.officeId)));
  }

  const audits = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  document.getElementById("auditList").innerHTML = audits.length ? audits.map(a => `
    <article class="audit-card">
      <div class="audit-icon">✓</div>
      <div class="audit-card-body">
        <p class="eyebrow">${a.frequency || "COMPLIANCE"}</p>
        <h3>${a.title || "Monthly Franchise Compliance Audit"}</h3>
        <p>${a.officeName || a.officeId || "Network audit"}</p>
        <div class="audit-meta"><span>${a.status || "assigned"}</span><span>${a.score != null ? `${Math.round(a.score)}%` : "Not completed"}</span></div>
        ${a.status !== "completed" && profile.role === "franchisee" ? `<button class="btn primary small start-audit" data-id="${a.id}">Start audit</button>` : ""}
      </div>
    </article>
  `).join("") : '<div class="empty-state">No audits found. A Head Office user can create a demo audit for testing.</div>';

  document.querySelectorAll(".start-audit").forEach(btn => btn.addEventListener("click", () => {
    document.getElementById("auditBuilder").classList.remove("hidden");
    document.getElementById("auditBuilder").scrollIntoView({behavior:"smooth"});
    document.getElementById("auditBuilder").dataset.auditId = btn.dataset.id;
  }));
}

function renderQuestions() {
  const container = document.getElementById("auditQuestions");
  const groups = [...new Set(questions.map(q => q.section))];

  container.innerHTML = groups.map(section => `
    <div class="audit-section">
      <div class="section-title"><p class="eyebrow">${section.toUpperCase()}</p><h3>${section}</h3></div>
      ${questions.filter(q => q.section === section).map(q => `
        <div class="question">
          <div><strong>${q.text}</strong><small>Choose the current position.</small></div>
          <div class="answer-options">
            <label><input type="radio" name="${q.id}" value="compliant" required><span class="answer good">Compliant</span></label>
            <label><input type="radio" name="${q.id}" value="partial"><span class="answer warning">Partial</span></label>
            <label><input type="radio" name="${q.id}" value="noncompliant"><span class="answer danger">Non-compliant</span></label>
            <label><input type="radio" name="${q.id}" value="na"><span class="answer">N/A</span></label>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");

  container.querySelectorAll("input").forEach(i => i.addEventListener("change", updateLiveScore));
}

function calculateScore() {
  const values = questions.map(q => document.querySelector(`input[name="${q.id}"]:checked`)?.value).filter(Boolean);
  const applicable = values.filter(v => v !== "na");
  if (!applicable.length) return 0;
  const points = applicable.reduce((sum, v) => sum + (v === "compliant" ? 100 : v === "partial" ? 50 : 0), 0);
  return points / applicable.length;
}

function updateLiveScore() {
  document.getElementById("liveScore").textContent = `${Math.round(calculateScore())}%`;
}

document.getElementById("auditForm").addEventListener("submit", async event => {
  event.preventDefault();
  const auditId = document.getElementById("auditBuilder").dataset.auditId;
  if (!auditId) return;

  const responses = {};
  questions.forEach(q => {
    responses[q.id] = document.querySelector(`input[name="${q.id}"]:checked`)?.value || null;
  });

  try {
    await updateDoc(doc(db, "audits", auditId), {
      responses,
      score: calculateScore(),
      status: "completed",
      completedAt: serverTimestamp(),
      completedBy: auth.currentUser.uid
    });

    alert("Audit submitted successfully.");
    document.getElementById("auditBuilder").classList.add("hidden");
    await loadAudits();
  } catch (error) {
    console.error(error);
    showError("The audit could not be submitted. Check your Firestore Security Rules.");
  }
});

async function createDemoAudit() {
  const officeSnap = await getDocs(collection(db, "offices"));
  const firstOffice = officeSnap.docs[0];
  if (!firstOffice) return showError("Create at least one office in Firestore first.");

  const office = firstOffice.data();
  await addDoc(collection(db, "audits"), {
    title: "Monthly Franchise Compliance Audit",
    frequency: "MONTHLY",
    officeId: firstOffice.id,
    officeName: office.name || firstOffice.id,
    status: "assigned",
    score: null,
    createdAt: serverTimestamp()
  });

  alert("Demo audit created.");
  await loadAudits();
}
