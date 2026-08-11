import {db} from "./firebase.js";
import {collection,getDocs,query,where,addDoc,updateDoc,doc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {setupShell,esc,formatDate,getOfficeName} from "./common.js";

let profile,all=[];
const $=id=>document.getElementById(id);

setupShell(null,async p=>{
  profile=p;
  $("newAction").addEventListener("click",openModal);
  $("closeAction").addEventListener("click",closeModal);
  $("actionForm").addEventListener("submit",createAction);
  $("statusFilter").addEventListener("change",render);
  $("priorityFilter").addEventListener("change",render);
  if(profile.role==="franchisor") { await populateOffices(); await populateAudits(); }
  else $("newAction").classList.add("hidden");
  await load();
});

async function populateOffices(){
  const s=await getDocs(collection(db,"offices"));
  $("actionOffice").innerHTML=s.docs.map(d=>`<option value="${d.id}">${esc(d.data().name||d.id)}</option>`).join("");
}

async function populateAudits(){
  const s=await getDocs(collection(db,"audits"));
  $("actionAudit").innerHTML='<option value="">No linked audit</option>'+s.docs.map(d=>{const a=d.data();return `<option value="${d.id}" data-type="${esc(a.auditTypeName||a.auditType||"")}">${esc((a.auditTypeName||"Audit")+" — "+(a.officeName||a.officeId||"Office")+" — "+(a.completedDate||""))}</option>`}).join("");
}
async function load(){
  let s=profile.role==="franchisor"
    ? await getDocs(collection(db,"actions"))
    : await getDocs(query(collection(db,"actions"),where("officeId","==",profile.officeId)));
  all=s.docs.map(d=>({id:d.id,...d.data()}));
  render();
}
function statusLabel(v){return ({open:"Open","in-progress":"In progress","awaiting-review":"Awaiting review",completed:"Completed",rejected:"Re-opened"})[v]||v;}
function render(){
  const st=$("statusFilter").value,pr=$("priorityFilter").value;
  let list=all.filter(a=>(st==="all"||a.status===st)&&(pr==="all"||a.priority===pr));
  list.sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  $("actionBadge").textContent=all.filter(a=>!["completed"].includes(a.status)).length;
  $("actionList").innerHTML=list.length?list.map(a=>{
    const canComplete=profile.role==="franchisee" && ["open","in-progress","rejected"].includes(a.status);
    const canVerify=profile.role==="franchisor" && a.status==="awaiting-review";
    return `<article class="action-card">
      <div class="action-main">
        <div class="action-title-row"><h3>${esc(a.title||"Action")}</h3><span class="priority ${esc(a.priority||"medium")}">${esc(a.priority||"medium")}</span></div>
        ${a.finding?`<div class="finding-inline"><strong>Finding:</strong> ${esc(a.finding)}</div>`:""}
        <p>${esc(a.description||"No action description provided.")}</p>
        <div class="action-meta"><span>Due: ${esc(a.dueDate||"—")}</span><span>Office: ${esc(a.officeName||a.officeId||"—")}</span><span>Status: ${esc(statusLabel(a.status||"open"))}</span>${a.auditTypeName?`<span>Audit: ${esc(a.auditTypeName)}</span>`:""}</div>
        ${a.owner?`<small>Owner: ${esc(a.owner)}</small>`:""}
      </div>
      <div class="action-buttons">
        ${canComplete?`<button class="btn secondary small complete-action" data-id="${a.id}">Submit complete</button>`:""}
        ${canVerify?`<button class="btn primary small approve-action" data-id="${a.id}">Approve</button><button class="btn secondary small reject-action" data-id="${a.id}">Re-open</button>`:""}
        ${a.status==="completed"?'<span class="status good">Approved</span>':a.status==="awaiting-review"?'<span class="status warning">Awaiting review</span>':""}
      </div>
    </article>`;
  }).join(""):'<div class="empty-state">No actions match your filters.</div>';
  document.querySelectorAll(".complete-action").forEach(b=>b.addEventListener("click",()=>submitComplete(b.dataset.id)));
  document.querySelectorAll(".approve-action").forEach(b=>b.addEventListener("click",()=>verify(b.dataset.id,"completed")));
  document.querySelectorAll(".reject-action").forEach(b=>b.addEventListener("click",()=>verify(b.dataset.id,"rejected")));
}
async function submitComplete(id){
  await updateDoc(doc(db,"actions",id),{status:"awaiting-review",completedAt:serverTimestamp(),completedBy:profile.uid,updatedAt:serverTimestamp()});
  await load();
}
async function verify(id,status){
  await updateDoc(doc(db,"actions",id),{status,verifiedBy:profile.uid,verifiedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await load();
}
function openModal(){if(profile.role!=="franchisor")return; $("actionModal").classList.remove("hidden");}
function closeModal(){$("actionModal").classList.add("hidden");}
async function createAction(e){
  e.preventDefault();
  if(profile.role!=="franchisor")return;
  let officeId=$("actionOffice").value;
  const officeName=await getOfficeName(officeId);
  const auditId=$("actionAudit").value||"";
  const auditTypeName=$("actionAudit").selectedOptions[0]?.dataset?.type||"";
  await addDoc(collection(db,"actions"),{
    title:$("actionTitle").value.trim(),
    description:$("actionDescription").value.trim(),
    finding:$("actionFinding").value.trim(),
    dueDate:$("actionDueDate").value||"",
    priority:$("actionPriority").value,
    owner:$("actionOwner").value.trim(),
    status:"open",officeId,officeName,auditId,auditTypeName,
    createdAt:serverTimestamp(),createdBy:profile.uid
  });
  $("actionForm").reset();closeModal();await load();
}
