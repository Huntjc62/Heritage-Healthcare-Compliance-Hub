import {auth,db} from "./firebase.js";
import {signInWithEmailAndPassword,sendPasswordResetEmail,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
const form=document.getElementById("loginForm"), error=document.getElementById("loginError"), button=document.getElementById("loginButton");
const show=m=>{error.textContent=m;error.className="alert error"};
onAuthStateChanged(auth,async user=>{
 if(!user)return;
 const s=await getDoc(doc(db,"users",user.uid));
 if(s.exists())location.href="dashboard.html"; else show("Your Firebase account exists, but your Firestore users profile has not been created.");
});
form.addEventListener("submit",async e=>{
 e.preventDefault();error.classList.add("hidden");button.disabled=true;button.textContent="Signing in…";
 try{await signInWithEmailAndPassword(auth,email.value.trim(),password.value)}
 catch(e){show({"auth/invalid-credential":"The email address or password is incorrect.","auth/user-not-found":"No account was found with that email address.","auth/wrong-password":"The email address or password is incorrect.","auth/too-many-requests":"Too many attempts. Please wait and try again."}[e.code]||e.message);button.disabled=false;button.textContent="Sign in"}
});
document.getElementById("forgotPassword").addEventListener("click",async()=>{
 const address=email.value.trim();if(!address)return show("Enter your email address first.");
 try{await sendPasswordResetEmail(auth,address);error.className="alert success";error.textContent="Password reset email sent. Check your inbox."}
 catch(e){show("We could not send a password reset email.")}
});