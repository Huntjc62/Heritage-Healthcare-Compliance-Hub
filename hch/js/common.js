import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

function normaliseRole(value) {
  const role = String(value || "").trim().toLowerCase();

  // All of these are treated as Head Office in the application.
  if (
    role === "franchisor" ||
    role === "head office" ||
    role === "head office admin" ||
    role === "head office staff" ||
    role === "headoffice" ||
    role === "head-office-staff"
  ) return "franchisor";

  if (role === "franchisee") return "franchisee";

  return role;
}

export function setupShell(requiredRole=null, onReady=()=>{}) {
  const loading = document.getElementById("appLoading");
  const app = document.getElementById("app");

  onAuthStateChanged(auth, async user => {
    if (!user) {
      location.href = "index.html";
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));

      if (!snap.exists()) {
        throw new Error("Your account has no matching users document.");
      }

      const rawProfile = {
        uid: user.uid,
        email: user.email,
        ...snap.data()
      };

      // IMPORTANT:
      // The Firestore role remains "Head Office Staff", but the application
      // normalises it to "franchisor", giving it identical access to the
      // existing Head Office Admin/franchisor role.
      const profile = {
        ...rawProfile,
        rawRole: rawProfile.role,
        role: normaliseRole(rawProfile.role)
      };

      if (requiredRole && profile.role !== requiredRole) {
        location.href = "dashboard.html";
        return;
      }

      window.currentUserProfile = profile;

      document.querySelectorAll("[data-user-name]")
        .forEach(e => e.textContent = profile.name || user.email);

      document.querySelectorAll("[data-user-role]")
        .forEach(e => {
          e.textContent =
            profile.role === "franchisor"
              ? "Head Office"
              : "Franchisee";
        });

      document.querySelectorAll("[data-user-avatar]")
        .forEach(e => {
          e.textContent =
            (profile.name || user.email || "H").charAt(0).toUpperCase();
        });

      if (profile.role === "franchisor") {
        document.querySelectorAll(".head-office-only")
          .forEach(e => e.classList.remove("hidden"));
      }

      document.querySelectorAll(".franchisee-only")
        .forEach(e => {
          if (profile.role === "franchisee") {
            e.classList.remove("hidden");
          }
        });

      document.querySelectorAll("[data-logout]")
        .forEach(button => {
          button.addEventListener("click", () => signOut(auth));
        });

      if (loading) loading.classList.add("hidden");
      if (app) app.classList.remove("hidden");

      try {
        await onReady(profile);
      } catch (readyError) {
        console.error("Page initialisation failed:", readyError);

        const box = document.querySelector(".page-error");
        if (box) {
          box.textContent =
            readyError.message || "This page could not be loaded.";
          box.classList.remove("hidden");
        }
      }

    } catch (error) {
      console.error(error);

      if (loading) loading.classList.add("hidden");
      if (app) app.classList.remove("hidden");

      const box = document.querySelector(".page-error");

      if (box) {
        box.textContent =
          error.message || "Your account could not be loaded.";
        box.classList.remove("hidden");
      }
    }
  });
}

export function esc(value="") {
  return String(value).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

export function scoreStatus(score) {
  score = Number(score) || 0;

  return score >= 90
    ? '<span class="status good">Excellent</span>'
    : score >= 80
      ? '<span class="status warning">Needs attention</span>'
      : '<span class="status danger">Requires action</span>';
}

export function formatDate(value) {
  if (!value) return "—";

  try {
    const d = value.toDate ? value.toDate() : new Date(value);

    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

export async function getOfficeName(officeId) {
  if (!officeId) return "Network";

  const s = await getDoc(doc(db, "offices", officeId));

  return s.exists()
    ? s.data().name || officeId
    : officeId;
}
