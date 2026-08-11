import {db} from "./firebase.js";
import {collection,getDocs,query,where,doc,getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {setupShell,esc,scoreStatus,formatDate} from "./common.js";
const pct=v=>typeof v==="number"?Math.round(v)+"%":"—";
setupShell(null,async profile=>{
 if(profile.role==="franchisor") await headOffice(profile); else await franchise(profile);
});
async function franchise(profile){
 document.getElementById("franchiseView").classList.remove("hidden");
 if(!profile.officeId){throw new Error("Your user profile needs an officeId.");}
 const os=await getDoc(doc(db,"offices",profile.officeId)); if(!os.exists())throw new Error("Your assigned office could not be found.");
 const o=os.data(); document.getElementById("officeName").textContent=o.name||profile.officeId;
 document.getElementById("officeScore").textContent=pct(o.complianceScore);
 ["documentation","staff","compliance","marketing"].forEach(k=>document.getElementById(k+"Score").textContent=pct(o.scores?.[k]));
 const [aSnap,xSnap]=await Promise.all([getDocs(query(collection(db,"audits"),where("officeId","==",profile.officeId))),getDocs(query(collection(db,"actions"),where("officeId","==",profile.officeId)))]);
 const audits=aSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,5);
 const actions=xSnap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.status!=="completed").slice(0,5);
 document.getElementById("actionBadge").textContent=actions.length;
 document.getElementById("franchiseAudits").innerHTML=audits.length?audits.map(a=>`<div class="list-row"><div><strong>${esc(a.title||"Compliance audit")}</strong><small>${esc(a.status||"Assigned")} · ${a.score!=null?pct(a.score):"Not completed"}</small></div>${a.status==="completed"?'<span class="status good">Complete</span>':'<span class="status warning">Assigned</span>'}</div>`).join(""):'<div class="empty-state">No audits assigned yet.</div>';
 document.getElementById("franchiseActions").innerHTML=actions.length?actions.map(a=>`<div class="list-row"><div><strong>${esc(a.title||"Action")}</strong><small>Due ${esc(a.dueDate||"—")}</small></div><span class="priority ${esc(a.priority||"medium")}">${esc(a.priority||"medium")}</span></div>`).join(""):'<div class="empty-state">No open actions. Great work.</div>';
}
async function headOffice(){
 document.getElementById("headOfficeView").classList.remove("hidden");
 const [oSnap,uSnap,aSnap]=await Promise.all([getDocs(collection(db,"offices")),getDocs(collection(db,"users")),getDocs(collection(db,"actions"))]);
 const offices=oSnap.docs.map(d=>({id:d.id,...d.data()}));const users=uSnap.docs.map(d=>d.data());const actions=aSnap.docs.map(d=>d.data()).filter(a=>a.status!=="completed");
 const scores=offices.map(o=>Number(o.complianceScore)).filter(Number.isFinite),avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
 document.getElementById("networkScore").textContent=pct(avg);document.getElementById("officeCount").textContent=offices.length;document.getElementById("userCount").textContent=users.length;document.getElementById("openActionCount").textContent=actions.length;
 const today=new Date().toISOString().slice(0,10);document.getElementById("overdueActionCount").textContent=actions.filter(a=>a.dueDate&&a.dueDate<today).length;
 offices.sort((a,b)=>(b.complianceScore||0)-(a.complianceScore||0));
 const rows=[];for(const o of offices){const oa=actions.filter(a=>a.officeId===o.id).length;rows.push(`<tr><td><strong>${esc(o.name||o.id)}</strong><small>${esc(o.location||"")}</small></td><td><strong>${pct(o.complianceScore)}</strong></td><td>${o.auditCompletion??"—"}%</td><td>${oa}</td><td>${scoreStatus(o.complianceScore)}</td></tr>`)}
 document.getElementById("officeTableBody").innerHTML=rows.join("")||'<tr><td colspan="5" class="empty-state">No offices have been added.</td></tr>';
}