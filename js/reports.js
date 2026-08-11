import {db} from "./firebase.js";
import {collection,getDocs} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {setupShell,esc,scoreStatus} from "./common.js";
setupShell(null,async profile=>{
 const [os,as,xs]=await Promise.all([getDocs(collection(db,"offices")),getDocs(collection(db,"audits")),getDocs(collection(db,"actions"))]);
 let offices=os.docs.map(d=>({id:d.id,...d.data()}));if(profile.role==="franchisee")offices=offices.filter(o=>o.id===profile.officeId);
 const audits=as.docs.map(d=>d.data()).filter(a=>profile.role==="franchisor"||a.officeId===profile.officeId),actions=xs.docs.map(d=>d.data()).filter(a=>(profile.role==="franchisor"||a.officeId===profile.officeId)&&a.status!=="completed");
 const scores=offices.map(o=>Number(o.complianceScore)).filter(Number.isFinite),avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
 reportScore.textContent=Math.round(avg)+"%";reportOffices.textContent=offices.length;reportAudits.textContent=audits.length;reportActions.textContent=actions.length;
 reportRows.innerHTML=offices.map(o=>`<tr><td><strong>${esc(o.name||o.id)}</strong><small>${esc(o.location||"")}</small></td><td><strong>${Math.round(o.complianceScore||0)}%</strong></td><td>${o.auditCompletion??0}%</td><td>${actions.filter(a=>a.officeId===o.id).length}</td><td>${scoreStatus(o.complianceScore)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty-state">No offices found.</td></tr>';
 printReport.onclick=()=>window.print();
});