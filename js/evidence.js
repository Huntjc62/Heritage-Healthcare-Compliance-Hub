import {db,storage} from "./firebase.js";
import {collection,getDocs,query,where,addDoc,updateDoc,doc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {ref,uploadBytes,getDownloadURL} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import {setupShell,esc,formatDate,getOfficeName} from "./common.js";

let profile,all=[];
const $=id=>document.getElementById(id);

setupShell(null,async p=>{
  profile=p;
  $("newEvidence").addEventListener("click",openModal);
  $("closeEvidence").addEventListener("click",closeModal);
  $("evidenceForm").addEventListener("submit",save);
  if(profile.role==="franchisor") await offices();
  else $("newEvidence").textContent="Upload evidence";
  await populateActions(); await load();
});

async function offices(){
  const s=await getDocs(collection(db,"offices"));
  $("evidenceOffice").innerHTML=s.docs.map(d=>`<option value="${d.id}">${esc(d.data().name||d.id)}</option>`).join("");
}
async function populateActions(){
  const s=profile.role==="franchisor"?await getDocs(collection(db,"actions")):await getDocs(query(collection(db,"actions"),where("officeId","==",profile.officeId)));
  $("evidenceAction").innerHTML='<option value="">No linked action</option>'+s.docs.map(d=>{const a=d.data();return `<option value="${d.id}">${esc((a.title||"Action")+" — "+(a.officeName||a.officeId||"Office"))}</option>`}).join("");
}
async function load(){
  let s=profile.role==="franchisor"?await getDocs(collection(db,"evidence")):await getDocs(query(collection(db,"evidence"),where("officeId","==",profile.officeId)));
  all=s.docs.map(d=>({id:d.id,...d.data()}));
  $("evidenceList").innerHTML=all.length?all.map(x=>`<article class="evidence-card">
    <div class="evidence-icon">▣</div><div><p class="eyebrow">${esc(x.category||"OTHER")}</p><h3>${esc(x.title||"Evidence")}</h3>
    <p>${x.downloadURL?`<a href="${esc(x.downloadURL)}" target="_blank" rel="noopener">View / download file</a>`:esc(x.reference||"No reference supplied.")}</p>
    <small>${esc(x.officeName||x.officeId||"Network")} · Uploaded ${formatDate(x.createdAt)} · ${esc(x.status||"awaiting-review")}</small>
    ${x.notes?`<div class="note">${esc(x.notes)}</div>`:""}
    ${profile.role==="franchisor" && x.status==="awaiting-review"?`<div class="action-buttons"><button class="btn primary small evidence-review" data-id="${x.id}" data-status="approved">Approve</button><button class="btn secondary small evidence-review" data-id="${x.id}" data-status="rejected">Re-open</button></div>`:""}
    ${x.status==="approved"?'<span class="status good">Approved</span>':x.status==="rejected"?'<span class="status danger">Re-opened</span>':'<span class="status warning">Awaiting review</span>'}
    </div></article>`).join(""):'<div class="empty-state">No evidence records have been added yet.</div>';
  document.querySelectorAll(".evidence-review").forEach(b=>b.addEventListener("click",()=>review(b.dataset.id,b.dataset.status)));
}
function openModal(){$("evidenceModal").classList.remove("hidden")}
function closeModal(){$("evidenceModal").classList.add("hidden")}
async function save(e){
  e.preventDefault();
  const file=$("evidenceFile").files[0];
  if(!file)return;
  let officeId=profile.officeId;
  if(profile.role==="franchisor") officeId=$("evidenceOffice").value;
  const officeName=await getOfficeName(officeId);
  const actionId=$("evidenceAction").value||"";
  const path=`evidence/${officeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const storageRef=ref(storage,path);
  const button=e.submitter; if(button) {button.disabled=true;button.textContent="Uploading…";}
  try{
    await uploadBytes(storageRef,file,{contentType:file.type||"application/octet-stream"});
    const downloadURL=await getDownloadURL(storageRef);
    await addDoc(collection(db,"evidence"),{
      title:$("evidenceTitle").value.trim()||file.name,category:$("evidenceCategory").value,
      reference:$("evidenceReference").value.trim(),notes:$("evidenceNotes").value.trim(),
      officeId,officeName,actionId,fileName:file.name,filePath:path,downloadURL,
      status:"awaiting-review",createdAt:serverTimestamp(),createdBy:profile.uid
    });
    $("evidenceForm").reset();closeModal();await populateActions();await load();
  }catch(err){alert(`Evidence upload failed: ${err.message}`);}
  finally{if(button){button.disabled=false;button.textContent="Save evidence";}}
}
async function review(id,status){
  if(profile.role!=="franchisor")return;
  await updateDoc(doc(db,"evidence",id),{status,reviewedBy:profile.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await load();
}
