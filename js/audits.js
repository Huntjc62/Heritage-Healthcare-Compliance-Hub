import {db,auth} from "./firebase.js";
import {collection,getDocs,query,where,doc,getDoc,addDoc,updateDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {setupShell,esc,formatDate,getOfficeName} from "./common.js";
const questions=[
["Documentation","Client records reviewed"],["Documentation","Care plans reviewed"],["Documentation","Risk assessments reviewed"],["Documentation","Reviews completed"],
["Staff","Training records checked"],["Staff","DBS records checked"],["Staff","Supervisions completed"],["Staff","Staff files reviewed"],
["Compliance","Incidents reviewed"],["Compliance","Complaints reviewed"],["Compliance","Safeguarding records checked"],["Compliance","Policies reviewed"],
["Marketing","Website checked"],["Marketing","Google Business Profile checked"],["Marketing","Social media active"],["Marketing","Recruitment advertising checked"]
].map((x,i)=>({id:"q"+(i+1),section:x[0],text:x[1]}));
let profile,currentAudit=null;
setupShell(null,async p=>{profile=p;renderQuestions();document.getElementById("createAudit").addEventListener("click",createAudit);await load();});
async function load(){
 let s=profile.role==="franchisor"?await getDocs(collection(db,"audits")):await getDocs(query(collection(db,"audits"),where("officeId","==",profile.officeId)));
 const audits=s.docs.map(d=>({id:d.id,...d.data()}));
 document.getElementById("auditList").innerHTML=audits.length?audits.map(a=>`<article class="audit-card"><div class="audit-icon">✓</div><div class="audit-card-body"><p class="eyebrow">${esc(a.frequency||"COMPLIANCE")}</p><h3>${esc(a.title||"Monthly Franchise Compliance Audit")}</h3><p>${esc(a.officeName||a.officeId||"Network")}</p><div class="audit-meta"><span>${esc(a.status||"assigned")}</span><span>${a.score!=null?Math.round(a.score)+"%":"Not completed"}</span></div>${profile.role==="franchisee"&&a.status!=="completed"?`<button class="btn primary small start" data-id="${a.id}">Start audit</button>`:""}${profile.role==="franchisor"&&a.status!=="completed"?`<span class="muted small-text">Waiting for franchisee</span>`:""}</div></article>`).join(""):'<div class="empty-state">No audits found. Head Office can create an audit.</div>';
 document.querySelectorAll(".start").forEach(b=>b.addEventListener("click",()=>start(b.dataset.id)));
}
async function start(id){currentAudit=id;document.getElementById("auditBuilder").classList.remove("hidden");document.getElementById("auditBuilder").scrollIntoView({behavior:"smooth"});}
function renderQuestions(){
 const c=document.getElementById("auditQuestions"),groups=[...new Set(questions.map(q=>q.section))];
 c.innerHTML=groups.map(g=>`<div class="audit-section"><p class="eyebrow">${g.toUpperCase()}</p><h3>${g}</h3>${questions.filter(q=>q.section===g).map(q=>`<div class="question"><div><strong>${q.text}</strong><small>Choose the current position.</small></div><div class="answer-options"><label><input required name="${q.id}" value="compliant" type="radio"><span class="answer">Compliant</span></label><label><input name="${q.id}" value="partial" type="radio"><span class="answer">Partial</span></label><label><input name="${q.id}" value="noncompliant" type="radio"><span class="answer">Non-compliant</span></label><label><input name="${q.id}" value="na" type="radio"><span class="answer">N/A</span></label></div></div>`).join("")}</div>`).join("");
 c.querySelectorAll("input").forEach(i=>i.addEventListener("change",score));
}
function calc(){const v=questions.map(q=>document.querySelector(`input[name="${q.id}"]:checked`)?.value).filter(Boolean).filter(v=>v!=="na");return v.length?v.reduce((s,x)=>s+(x==="compliant"?100:x==="partial"?50:0),0)/v.length:0}
function score(){document.getElementById("liveScore").textContent=Math.round(calc())+"%";}
document.getElementById("auditForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!currentAudit)return;const responses={};questions.forEach(q=>responses[q.id]=document.querySelector(`input[name="${q.id}"]:checked`)?.value);
 await updateDoc(doc(db,"audits",currentAudit),{responses,score:calc(),status:"completed",completedAt:serverTimestamp(),completedBy:auth.currentUser.uid});alert("Audit submitted successfully.");document.getElementById("auditBuilder").classList.add("hidden");await load();
});
async function createAudit(){
 const os=await getDocs(collection(db,"offices"));if(os.empty)return alert("Create an office first.");
 const offices=os.docs.map(d=>({id:d.id,...d.data()}));const choice=prompt("Enter the office ID to assign this audit to:\n\n"+offices.map(o=>`${o.id} — ${o.name}`).join("\n"),offices[0].id);if(!choice)return;
 const o=offices.find(x=>x.id===choice);if(!o)return alert("Office ID not found.");
 await addDoc(collection(db,"audits"),{title:"Monthly Franchise Compliance Audit",frequency:"MONTHLY",officeId:o.id,officeName:o.name,status:"assigned",score:null,createdAt:serverTimestamp()});await load();alert("Audit assigned to "+o.name+".");
}