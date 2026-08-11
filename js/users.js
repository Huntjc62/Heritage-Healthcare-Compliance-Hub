import {db} from "./firebase.js";
import {collection,getDocs,setDoc,doc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {setupShell,esc} from "./common.js";
let profiles=[];
setupShell("franchisor",async()=>{newUser.onclick=open;closeUser.onclick=close;userForm.addEventListener("submit",save);await offices();await load();});
async function offices(){const s=await getDocs(collection(db,"offices"));profileOffice.innerHTML='<option value="">Head Office / none</option>'+s.docs.map(d=>`<option value="${d.id}">${esc(d.data().name||d.id)}</option>`).join("");}
async function load(){const s=await getDocs(collection(db,"users"));profiles=s.docs.map(d=>({id:d.id,...d.data()}));userTable.innerHTML=`<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Office</th><th>UID</th></tr></thead><tbody>${profiles.map(p=>`<tr><td><strong>${esc(p.name||"—")}</strong></td><td>${esc(p.email||"—")}</td><td><span class="status ${p.role==="franchisor"?"good":"warning"}">${esc(p.role||"—")}</span></td><td>${esc(p.officeId||"Head Office")}</td><td><code>${esc(p.id)}</code></td></tr>`).join("")}</tbody></table>`}
function open(){userModal.classList.remove("hidden");userForm.reset()}
function close(){userModal.classList.add("hidden")}
async function save(e){e.preventDefault();const role=profileRole.value;await setDoc(doc(db,"users",userUid.value.trim()),{name:profileName.value.trim(),email:profileEmail.value.trim(),role,officeId:role==="franchisee"?profileOffice.value:null,updatedAt:serverTimestamp()},{merge:true});close();await load();}
