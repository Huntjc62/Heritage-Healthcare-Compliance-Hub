import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export function setupShell(requiredRole=null, onReady=()=>{}) {
  const loading=document.getElementById("appLoading"), app=document.getElementById("app");
  onAuthStateChanged(auth, async user=>{
    if(!user){ location.href="index.html"; return; }
    try{
      const snap=await getDoc(doc(db,"users",user.uid));
      if(!snap.exists()) throw new Error("Your account has no matching users document.");
      const profile={uid:user.uid,email:user.email,...snap.data()};
      if(requiredRole && profile.role!==requiredRole) {
        if(profile.role==="franchisee") location.href="dashboard.html";
        else location.href="dashboard.html";
        return;
      }
      window.currentUserProfile=profile;
      document.querySelectorAll("[data-user-name]").forEach(e=>e.textContent=profile.name||user.email);
      document.querySelectorAll("[data-user-role]").forEach(e=>e.textContent=profile.role==="franchisor"?"Head Office":"Franchisee");
      document.querySelectorAll("[data-user-avatar]").forEach(e=>e.textContent=(profile.name||user.email||"H").charAt(0).toUpperCase());
      if(profile.role==="franchisor") document.querySelectorAll(".head-office-only").forEach(e=>e.classList.remove("hidden"));
      document.querySelectorAll(".franchisee-only").forEach(e=>{if(profile.role==="franchisee")e.classList.remove("hidden")});
      document.querySelectorAll("[data-logout]").forEach(b=>b.addEventListener("click",()=>signOut(auth)));
      if(loading) loading.classList.add("hidden");
      if(app) app.classList.remove("hidden");
      await onReady(profile);
    }catch(e){
      console.error(e);
      if(loading) loading.classList.add("hidden");
      if(app) app.classList.remove("hidden");
      const box=document.querySelector(".page-error");
      if(box){box.textContent=e.message;box.classList.remove("hidden");}
    }
  });
}
export function esc(value=""){return String(value).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
export function scoreStatus(score){score=Number(score)||0;return score>=90?'<span class="status good">Excellent</span>':score>=80?'<span class="status warning">Needs attention</span>':'<span class="status danger">Requires action</span>';}
export function formatDate(value){if(!value)return "—";try{const d=value.toDate?value.toDate():new Date(value);return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}catch{return "—"}}
export async function getOfficeName(officeId){if(!officeId)return "Network";const s=await getDoc(doc(db,"offices",officeId));return s.exists()?s.data().name||officeId:officeId;}