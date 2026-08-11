import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");
const loginButton = document.getElementById("loginButton");
const forgotPassword = document.getElementById("forgotPassword");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) window.location.href = "dashboard.html";
    else showError("Your account exists, but no Heritage user profile has been created yet. Ask Head Office to finish your setup.");
  } catch (error) {
    showError("We could not load your user profile. Check your Firebase configuration and Firestore rules.");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "The email address or password is incorrect.",
      "auth/user-not-found": "No account was found with that email address.",
      "auth/wrong-password": "The email address or password is incorrect.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again."
    };
    showError(messages[error.code] || "Unable to sign in. Please check your details.");
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
});

forgotPassword.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  if (!email) return showError("Enter your email address first.");
  try {
    await sendPasswordResetEmail(auth, email);
    errorBox.className = "alert success";
    errorBox.textContent = "Password reset email sent. Check your inbox.";
  } catch (error) {
    showError("We could not send a reset email. Check the email address and Firebase setup.");
  }
});
