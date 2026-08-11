import { db, auth } from "./firebase.js";
import {
  collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setupShell, esc, formatDate } from "./common.js";

const TYPES = [
  {id:"marketing", label:"Marketing", frequency:"quarterly", months:3},
  {id:"staff", label:"Staff", frequency:"quarterly", months:3},
  {id:"documentation", label:"Documentation", frequency:"quarterly", months:3},
  {id:"compliance", label:"Compliance", frequency:"quarterly", months:3},
  {id:"quality-governance", label:"Quality & Governance", frequency:"annual", months:12}
];
const REQUIRED = ["marketing","staff","documentation","compliance"];
const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);
const average = arr => { const n=arr.map(Number).filter(Number.isFinite); return n.length ? n.reduce((a,b)=>a+b,0)/n.length : null; };
const pct = n => Number.isFinite(Number(n)) ? `${Math.round(Number(n))}%` : "—";
const addMonths = (date, months) => { const d=new Date(`${date}T12:00:00`); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); };
const typeById = id => TYPES.find(t=>t.id===id);
const freqLabel = f => ({monthly:"Monthly",quarterly:"Quarterly","six-monthly":"Every 6 months",annual:"Annual"}[f]||"Quarterly");

let profile=null, offices=[], audits=[], schedules=[], selected=null;

setupShell(null, async p => {
  profile=p;
  bind();
  try {
    await loadOffices();
    await loadData();
    render();
  } catch(err) {
    console.error("AUDITS LOAD ERROR",err);
    showError(`Audits could not load: ${err.message || err}`);
  }
});

function bind(){
  const on=(id,event,fn)=>{const e=$(id);if(e)e.addEventListener(event,fn);};
  on("createAudit","click",()=>openAudit());
  on("scheduleAudit","click",()=>openSchedule());
  on("closeAuditModal","click",()=>toggle("auditModal",false));
  on("cancelAudit","click",()=>toggle("auditModal",false));
  on("closeScheduleModal","click",()=>toggle("scheduleModal",false));
  on("cancelSchedule","click",()=>toggle("scheduleModal",false));
  on("closeDetailsModal","click",()=>toggle("detailsModal",false));
  on("auditForm","submit",saveAudit);
  on("scheduleForm","submit",saveSchedule);
  on("auditScore","input",e=>{if($("auditScoreNumber"))$("auditScoreNumber").value=e.target.value;if($("auditScoreOutput"))$("auditScoreOutput").textContent=`${e.target.value}%`;});
  on("auditScoreNumber","input",e=>{let v=Math.max(0,Math.min(100,Number(e.target.value||0)));e.target.value=v;if($("auditScore"))$("auditScore").value=v;if($("auditScoreOutput"))$("auditScoreOutput").textContent=`${v}%`;});
  on("officeFilter","change",render);
  on("historyOfficeFilter","change",renderHistoryOnly);
  on("scheduleOfficeFilter","change",render);
  on("trendTopicFilter","change",renderTrend);
}

async function loadOffices(){
  if(profile.role==="franchisor"){
    const s=await getDocs(collection(db,"offices"));
    offices=s.docs.map(d=>({id:d.id,...d.data()}));
  }else if(profile.officeId){
    const s=await getDoc(doc(db,"offices",profile.officeId));
    offices=s.exists()?[{id:s.id,...s.data()}]:[];
  }else offices=[];
  offices.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
  const opts=offices.map(o=>`<option value="${esc(o.id)}">${esc(o.name||o.id)}</option>`).join("");
  if($("auditOffice")) $("auditOffice").innerHTML=opts||'<option value="">No office available</option>';
  if($("scheduleOffice")) $("scheduleOffice").innerHTML=opts||'<option value="">No office available</option>';
  if($("officeFilter")) $("officeFilter").innerHTML=`<option value="all">All offices</option>${opts}`;
  if($("historyOfficeFilter")) $("historyOfficeFilter").innerHTML=`<option value="all">All offices</option>${opts}`;
  if($("scheduleOfficeFilter")) $("scheduleOfficeFilter").innerHTML=`<option value="all">All offices</option>${opts}`;
  if(profile.role==="franchisee"){
    ["auditOffice","scheduleOffice"].forEach(id=>{if($(id))$(id).disabled=true;});
    ["officeFilterWrap","historyOfficeFilterWrap","scheduleOfficeFilterWrap"].forEach(id=>{if($(id))$(id).classList.add("hidden");});
  }else{
    ["officeFilterWrap","historyOfficeFilterWrap","scheduleOfficeFilterWrap"].forEach(id=>{if($(id))$(id).classList.remove("hidden");});
  }
  if($("auditType"))$("auditType").innerHTML=TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join("");
  if($("scheduleType"))$("scheduleType").innerHTML=TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join("");
  if($("scheduleFrequency"))$("scheduleFrequency").innerHTML=`<option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="six-monthly">Every 6 months</option><option value="annual">Annual</option>`;
  if($("scheduleStatus"))$("scheduleStatus").innerHTML=`<option value="scheduled">Scheduled</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option>`;
  if($("completedDate"))$("completedDate").value=today();
  if($("scheduleDueDate"))$("scheduleDueDate").value=addMonths(today(),3);
}

async function loadData(){
  const aq=profile.role==="franchisor"
    ? getDocs(collection(db,"audits"))
    : getDocs(query(collection(db,"audits"),where("officeId","==",profile.officeId)));
  const sq=profile.role==="franchisor"
    ? getDocs(collection(db,"auditSchedules"))
    : getDocs(query(collection(db,"auditSchedules"),where("officeId","==",profile.officeId)));
  const [a,s]=await Promise.all([aq,sq]);
  audits=a.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==="completed");
  schedules=s.docs.map(d=>({id:d.id,...d.data()}));
  audits.sort((a,b)=>String(b.completedDate||"").localeCompare(String(a.completedDate||"")));
}

function selectedOffice(){
  if(profile.role==="franchisee") return profile.officeId||"";
  return $("officeFilter")?.value||"all";
}
function visibleAudits(){
  const id=selectedOffice();
  return id==="all"?audits:audits.filter(a=>a.officeId===id);
}
function latestForOffice(id){
  const result={};
  audits.filter(a=>a.officeId===id).sort((a,b)=>String(b.completedDate||"").localeCompare(String(a.completedDate||""))).forEach(a=>{if(!result[a.auditType])result[a.auditType]=a;});
  return result;
}
function effectiveSchedule(officeId,typeId){
  const type=typeById(typeId), stored=schedules.find(s=>s.officeId===officeId&&s.auditType===typeId), latest=latestForOffice(officeId)[typeId];
  const frequency=stored?.frequency||({months:type.months,id:type.frequency}.id);
  const months=({monthly:1,quarterly:3,"six-monthly":6,annual:12}[frequency]||type.months);
  const next=stored?.nextDueDate||addMonths(latest?.completedDate||today(),months);
  let status=stored?.status||"scheduled";
  if(status!=="in-progress"&&status!=="completed") status=next<today()?"overdue":"scheduled";
  return {id:stored?.id||"",officeId,typeId,frequency,nextDueDate:next,status,lastCompletedDate:latest?.completedDate||stored?.lastCompletedDate||""};
}

function render(){
  const id=selectedOffice(), va=visibleAudits(), latest=id==="all"?null:latestForOffice(id);
  if(profile.role==="franchisor"&&id==="all") renderNetwork(); else renderOffice(latest||{});
  renderSchedules(id);
  renderRegister(va);
  renderHistory();
  renderTrend();
}
function renderOffice(latest){
  const vals=Object.values(latest).map(a=>a.score), req=REQUIRED.filter(x=>latest[x]).length;
  $("overallScore").textContent=pct(average(vals));
  $("overallSubtext").textContent=`Based on ${vals.length} of 5 topic scores`;
  $("completedRequired").textContent=`${req} / 4`; $("completionPercent").textContent=`${Math.round(req/4*100)}% complete`;
  $("topicsScored").textContent=`${Object.keys(latest).length} / 5`;
  $("auditCount").textContent=audits.filter(a=>a.officeId===profile.officeId).length;
  $("topicScoreGrid").innerHTML=TYPES.map(t=>topicCard(t,latest[t.id])).join("");
}
function renderNetwork(){
  const officeAvgs=offices.map(o=>average(Object.values(latestForOffice(o.id)).map(a=>a.score))).filter(Number.isFinite);
  $("overallScore").textContent=pct(average(officeAvgs)); $("overallSubtext").textContent="Average of latest completed topic scores across the network";
  const done=offices.reduce((n,o)=>n+REQUIRED.filter(t=>latestForOffice(o.id)[t]).length,0), possible=Math.max(1,offices.length*4);
  $("completedRequired").textContent=`${done} / ${possible}`; $("completionPercent").textContent=`${Math.round(done/possible*100)}% complete across required audits`;
  $("topicsScored").textContent=`${new Set(audits.map(a=>a.auditType)).size} / 5`; $("auditCount").textContent=audits.length;
  $("topicScoreGrid").innerHTML=TYPES.map(t=>topicCard(t,null)).join("");
}
function topicCard(t,a){
  const score=a?.score, status=score==null?"Not audited":Number(score)>=90?"Excellent":Number(score)>=80?"Needs attention":"Requires action";
  return `<article class="topic-score-card"><div class="topic-score-top"><div><p class="eyebrow">${esc(t.label)}</p><strong>${pct(score)}</strong></div><span class="topic-status ${score==null?"neutral":Number(score)>=90?"good":Number(score)>=80?"warning":"danger"}">${status}</span></div><p>${esc(t.description||"")}</p><small>${a?`Latest audit: ${formatDate(a.completedDate)}`:"No audit recorded"}</small></article>`;
}

function renderSchedules(id){
  const target=id==="all"?offices:offices.filter(o=>o.id===id);
  if($("scheduleSummary"))$("scheduleSummary").innerHTML=target.length?target.map(o=>`<div class="schedule-stat"><span>${esc(o.name||o.id)}</span><strong>${TYPES.filter(t=>effectiveSchedule(o.id,t.id).status==="completed").length}/${TYPES.length} complete</strong></div>`).join(""):"";
  const rows=[];
  target.forEach(o=>TYPES.forEach(t=>{
    const s=effectiveSchedule(o.id,t.id);
    rows.push(`<article class="schedule-card"><div class="schedule-card-main"><div><p class="eyebrow">${t.label}</p><h3>${esc(o.name||o.id)}</h3></div><span class="schedule-status ${s.status}">${s.status==="in-progress"?"In progress":s.status.charAt(0).toUpperCase()+s.status.slice(1)}</span></div><div class="schedule-meta"><span><b>Frequency</b>${freqLabel(s.frequency)}</span><span><b>Next due</b>${s.nextDueDate?formatDate(s.nextDueDate):"—"}</span><span><b>Last completed</b>${s.lastCompletedDate?formatDate(s.lastCompletedDate):"Not yet audited"}</span></div><div class="schedule-actions">${profile.role==="franchisor"?`<button class="btn secondary small" data-manage="${o.id}|${t.id}|${s.id}">Manage</button><button class="btn primary small" data-add="${o.id}|${t.id}">Add completed audit</button>`:""}</div></article>`;
  }));
  $("scheduleList").innerHTML=rows.join("")||'<div class="empty-state">No offices available.</div>';
  document.querySelectorAll("[data-manage]").forEach(b=>b.onclick=()=>{const [o,t,s]=b.dataset.manage.split("|");openSchedule(o,t,s);});
  document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{const [o,t]=b.dataset.add.split("|");openAudit(o,t);});
}

function renderRegister(list){
  $("auditList").innerHTML=list.length?list.map(a=>{
    const t=typeById(a.auditType),o=offices.find(x=>x.id===a.officeId);
    return `<article class="audit-record-card"><div class="audit-record-icon">✓</div><div class="audit-record-main"><div class="audit-record-heading"><div><p class="eyebrow">${esc(t?.label||a.auditTypeName||"Audit")}</p><h3>${esc(o?.name||a.officeName||"Office")}</h3></div><strong class="audit-score-pill">${pct(a.score)}</strong></div><div class="audit-record-meta"><span>Completed by <strong>${esc(a.completedBy||"Not recorded")}</strong></span><span>${formatDate(a.completedDate)}</span><span class="status-chip completed">Completed</span></div><p class="audit-note-preview">${esc(a.notes||"No future changes or notes recorded.")}</p><button class="btn secondary small" data-view="${a.id}">View audit details</button></div></article>`;
  }).join(""):'<div class="empty-state"><strong>No completed audits yet.</strong><div>Head Office can use “Add a completed audit” to record one.</div></div>';
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>openDetails(b.dataset.view));
}

function renderTrend(){
  const id=selectedOffice(), topic=$("trendTopicFilter")?.value||"overall", ids=id==="all"?offices.map(o=>o.id):[id];
  const groups={};
  audits.filter(a=>ids.includes(a.officeId)).forEach(a=>{
    if(topic!=="overall"&&a.auditType!==topic)return;
    const d=a.completedDate;if(!d)return;
    if(!groups[d])groups[d]=[];groups[d].push(Number(a.score));
  });
  const pts=Object.entries(groups).sort().map(([date,v])=>({date,value:average(v)}));
  $("trendMeta").innerHTML=pts.length?`<span><b>${id==="all"?"Heritage Healthcare network":esc(offices.find(o=>o.id===id)?.name||"Office")}</b></span><span>${esc(topic==="overall"?"Overall compliance":typeById(topic)?.label||topic)}</span><span>Latest <b>${pct(pts.at(-1).value)}</b></span>`:"No completed audits yet";
  if(pts.length<2){$("trendChart").innerHTML='<div class="trend-empty">Complete at least two audits to see a trend.</div>';return;}
  const w=900,h=280,p={l:42,r:18,t:18,b:40},x=i=>p.l+i/(pts.length-1)*(w-p.l-p.r),y=v=>p.t+(100-v)/100*(h-p.t-p.b);
  $("trendChart").innerHTML=`<svg viewBox="0 0 ${w} ${h}">${[0,25,50,75,100].map(v=>`<line class="grid-line" x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}"/><text class="axis-label" x="6" y="${y(v)+4}">${v}%</text>`).join("")}<polyline class="trend-line" points="${pts.map((q,i)=>`${x(i)},${y(q.value)}`).join(" ")}"/>${pts.map((q,i)=>`<circle class="trend-point" cx="${x(i)}" cy="${y(q.value)}" r="4"><title>${formatDate(q.date)}: ${pct(q.value)}</title></circle>`).join("")}</svg>`;
}

function renderHistory(){
  const id=profile.role==="franchisee"?profile.officeId:$("historyOfficeFilter")?.value||"all";
  const list=audits.filter(a=>id==="all"||a.officeId===id).sort((a,b)=>String(a.completedDate).localeCompare(String(b.completedDate)));
  let improved=0,declined=0,unchanged=0,rows=[];
  TYPES.forEach(t=>{
    const relevant=list.filter(a=>a.auditType===t.id);
    for(let i=1;i<relevant.length;i++){const change=Number(relevant[i].score)-Number(relevant[i-1].score);if(change>0)improved++;else if(change<0)declined++;else unchanged++;rows.push({a:relevant[i],p:relevant[i-1],change,t});}
  });
  $("historyImproved").textContent=improved;$("historyDeclined").textContent=declined;$("historyUnchanged").textContent=unchanged;
  const changes=rows.map(r=>r.change), overall=average(changes);
  $("historyOverallChange").textContent=overall==null?"—":`${overall>0?"+":""}${overall.toFixed(1)}%`;
  $("historyOverallText").textContent=overall==null?"Complete more audits to measure improvement":overall>0?"Improved overall":overall<0?"Declined overall":"No overall change";
  $("historyTopicGrid").innerHTML=TYPES.map(t=>{
    const r=list.filter(a=>a.auditType===t.id),last=r.at(-1),prev=r.at(-2),c=last&&prev?Number(last.score)-Number(prev.score):null;
    return `<article class="history-topic-card"><p class="eyebrow">${t.label}</p><strong>${pct(last?.score)}</strong><div class="history-compare"><span>Previous</span><b>${pct(prev?.score)}</b><em>${c==null?"First audit":`${c>0?"+":""}${c}%`}</em></div></article>`;
  }).join("");
  rows.sort((a,b)=>String(b.a.completedDate).localeCompare(String(a.a.completedDate)));
  $("auditHistoryList").innerHTML=rows.length?rows.map(r=>`<article class="history-row"><div class="history-row-date"><strong>${formatDate(r.a.completedDate)}</strong><small>${esc(r.a.officeName||"Office")}</small></div><div class="history-row-topic"><p class="eyebrow">${r.t.label}</p><strong>${pct(r.a.score)}</strong><span>Previous: ${pct(r.p.score)}</span></div><div class="history-row-movement"><strong>${r.change>0?"↑ Improved":r.change<0?"↓ Declined":"→ Unchanged"}</strong><span>${r.change>0?"+":""}${r.change}%</span></div><div class="history-row-notes"><strong>${esc(r.a.completedBy||"Unknown")}</strong><small>${esc(r.a.notes||"No notes recorded.")}</small></div></article>`).join(""):'<div class="empty-state">Not enough history yet. A topic needs at least two completed audits to measure improvement.</div>';
}
function renderHistoryOnly(){renderHistory();}

function openAudit(officeId=null,typeId=null){
  if(profile.role!=="franchisor")return;
  $("auditOffice").value=officeId||offices[0]?.id||"";
  $("auditType").value=typeId||"marketing";
  $("completedBy").value=profile.name||"";
  $("completedDate").value=today();
  $("auditScore").value=0;$("auditScoreNumber").value=0;$("auditScoreOutput").textContent="0%";
  $("auditFinding").value="";$("auditNotes").value="";
  toggle("auditModal",true);
}
function openSchedule(officeId=null,typeId=null,scheduleId=null){
  if(profile.role!=="franchisor")return;
  const existing=schedules.find(s=>s.id===scheduleId)||schedules.find(s=>s.officeId===officeId&&s.auditType===typeId);
  $("scheduleId").value=existing?.id||"";
  $("scheduleOffice").value=officeId||existing?.officeId||offices[0]?.id||"";
  $("scheduleType").value=typeId||existing?.auditType||"marketing";
  $("scheduleFrequency").value=existing?.frequency||typeById($("scheduleType").value)?.frequency||"quarterly";
  $("scheduleDueDate").value=existing?.nextDueDate||addMonths(today(),3);
  $("scheduleStatus").value=existing?.status||"scheduled";
  toggle("scheduleModal",true);
}
async function saveAudit(e){
  e.preventDefault();if(profile.role!=="franchisor")return;
  const officeId=$("auditOffice").value,typeId=$("auditType").value,t=typeById(typeId),o=offices.find(x=>x.id===officeId);
  if(!o||!t)return show("Select an office and audit type.",true);
  const data={officeId,officeName:o.name||officeId,auditType:typeId,auditTypeName:t.label,title:`${t.label} Audit`,completedBy:$("completedBy").value.trim(),completedDate:$("completedDate").value,score:Number($("auditScoreNumber").value||0),finding:$("auditFinding").value.trim(),notes:$("auditNotes").value.trim(),status:"completed",createdBy:auth.currentUser?.uid||"",createdAt:serverTimestamp(),completedAt:serverTimestamp()};
  try{
    await addDoc(collection(db,"audits"),data);
    const existing=schedules.find(s=>s.officeId===officeId&&s.auditType===typeId);
    const payload={officeId,officeName:o.name||officeId,auditType:typeId,auditTypeName:t.label,frequency:existing?.frequency||t.frequency,lastCompletedDate:data.completedDate,nextDueDate:addMonths(data.completedDate,existing?.frequency==="monthly"?1:existing?.frequency==="six-monthly"?6:existing?.frequency==="annual"?12:3),status:"scheduled",updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||""};
    if(existing)await updateDoc(doc(db,"auditSchedules",existing.id),payload);else await addDoc(collection(db,"auditSchedules"),{...payload,createdAt:serverTimestamp(),createdBy:auth.currentUser?.uid||""});
    await updateOffice(officeId);toggle("auditModal",false);await loadData();render();show(`${t.label} audit saved.`);
  }catch(err){console.error(err);show(`The audit could not be saved: ${err.message}`,true);}
}
async function updateOffice(officeId){
  const snap=await getDocs(query(collection(db,"audits"),where("officeId","==",officeId)));
  const done=snap.docs.map(d=>d.data()).filter(a=>a.status==="completed");
  const latest={};done.sort((a,b)=>String(b.completedDate).localeCompare(String(a.completedDate))).forEach(a=>{if(!latest[a.auditType])latest[a.auditType]=a;});
  const scores=Object.fromEntries(TYPES.map(t=>[t.id,latest[t.id]?Number(latest[t.id].score):null]));
  const req=REQUIRED.filter(t=>latest[t]).length;
  await updateDoc(doc(db,"offices",officeId),{complianceScore:Math.round(average(Object.values(latest).map(a=>a.score))||0),auditCompletion:Math.round(req/4*100),completedAudits:done.length,requiredAuditsCompleted:req,requiredAudits:4,scores,lastAuditDate:done[0]?.completedDate||null,updatedAt:serverTimestamp()});
}
async function saveSchedule(e){
  e.preventDefault();if(profile.role!=="franchisor")return;
  const o=$("scheduleOffice").value,t=$("scheduleType").value,type=typeById(t),office=offices.find(x=>x.id===o);
  const payload={officeId:o,officeName:office.name||o,auditType:t,auditTypeName:type.label,frequency:$("scheduleFrequency").value,nextDueDate:$("scheduleDueDate").value,status:$("scheduleStatus").value,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||""};
  try{const id=$("scheduleId").value;if(id)await updateDoc(doc(db,"auditSchedules",id),payload);else await addDoc(collection(db,"auditSchedules"),{...payload,createdAt:serverTimestamp(),createdBy:auth.currentUser?.uid||""});toggle("scheduleModal",false);await loadData();render();show("Audit schedule saved.");}catch(err){show(`Schedule could not be saved: ${err.message}`,true);}
}
async function openDetails(id){
  selected=audits.find(a=>a.id===id);if(!selected)return;
  const t=typeById(selected.auditType),o=offices.find(x=>x.id===selected.officeId);
  $("detailsType").textContent=(t?.label||"Audit").toUpperCase();$("detailsTitle").textContent=`${t?.label||"Audit"} — ${o?.name||selected.officeName||"Office"}`;$("detailsScore").textContent=pct(selected.score);$("detailsOffice").textContent=o?.name||selected.officeName||"—";$("detailsCompletedBy").textContent=selected.completedBy||"—";$("detailsDate").textContent=formatDate(selected.completedDate);$("detailsFinding").textContent=selected.finding||"No specific finding recorded.";$("detailsNotes").textContent=selected.notes||"No future changes or notes recorded.";
  toggle("detailsModal",true);
}
function toggle(id,on){const e=$(id);if(e)e.classList.toggle("hidden",!on);}
function show(msg,error=false){const b=$("auditMessage");if(!b)return;b.textContent=msg;b.classList.toggle("error",error);b.classList.toggle("success",!error);b.classList.remove("hidden");setTimeout(()=>b.classList.add("hidden"),5000);}
function showError(msg){const b=document.querySelector(".page-error");if(b){b.textContent=msg;b.classList.remove("hidden");}const l=$("appLoading");if(l)l.classList.add("hidden");const a=$("app");if(a)a.classList.remove("hidden");}
