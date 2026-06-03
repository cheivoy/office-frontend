import React, { useState, useEffect, useCallback } from "react";
import { scanInboxWithPeriod, importFiles, getEmployeeFiles, previewFileUrl, previewEml,
         downloadZip, downloadAllZip, downloadBlob, attachmentUrl } from "../api";
import { useToast, useApi, useDropdown } from "../hooks";
import WriteModal from "./WriteModal";
import DownloadModal from "./DownloadModal";
import VerifyModal from "./VerifyModal";

const COLS=[
  {id:"tr",label:"TR",subs:[{id:"task_report",label:"Task Report"},{id:"tr_approval",label:"TR Approval"}]},
  {id:"ess",label:"ESS",subs:[{id:"ess_approval",label:"ESS Approval"}]},
  {id:"ot",label:"OT",subs:[{id:"ot_approval",label:"OT Approval"}]},
  {id:"ns",label:"NS",subs:[{id:"ns_approval",label:"NS Approval"}]},
  {id:"travel",label:"差旅",subs:[{id:"travel_apply",label:"差旅申請"},{id:"travel_approval",label:"差旅Approval"}]},
  {id:"leave",label:"請假",subs:[{id:"leave_approval",label:"請假Approval"}]},
];
const STATUS_CYCLE=["ok","miss","na"];
const LEAVE_TYPES=["sick leave","personal leave","annual leave","official leave","other"];
const mkForm=()=>({workdays:"",checkedSecs:new Set(["tr"]),ess:[],ot:[],ta:[],leave:[]});

function calcH(ts,te){
  if(!ts||!te)return"";
  const[sh,sm]=ts.split(":").map(Number),[eh,em]=te.split(":").map(Number);
  let d=(eh*60+em)-(sh*60+sm);if(d<0)d+=1440;return(d/60).toFixed(1);
}
function fmtLeave(rows){
  return rows.filter(r=>r.dates).map(r=>{
    const ds=r.dates.trim().split(/\s+/).join(", ");
    const hrs=r.hours?`_${r.hours} `:"_";
    const lbl=r.type==="other"&&r.reason?r.reason:(r.type||"leave");
    return`${ds}${hrs}${lbl}`;
  }).join("  ");
}
function fmtOt(rows){
  return rows.filter(r=>r.date&&r.tstart&&r.tend).map(r=>{
    const mm=r.date.slice(5).replace("-","");
    return`${mm}_${r.tstart.replace(":","")}-${r.tend.replace(":","")}`+(r.hours?`_${r.hours}hrs`:"");
  }).join("  ");
}

export default function Kanban(){
  const[kanban,setKanban]=useState([]);
  const[activeG,setActiveG]=useState(new Set(["tr"]));
  const[tst,setTst]=useState({});
  const[filt,setFilt]=useState({proj:null,unit:null,pm:null});
  const[q,setQ]=useState("");
  const[sortMode,setSortMode]=useState("name");
  const[df,setDf]=useState(""); // month period filter
  // eslint-disable-next-line no-unused-vars
  const[dt,setDt]=useState("");
  const[selId,setSelId]=useState(null);
  const[curRT,setCurRT]=useState("files");
  const[forms,setForms]=useState({});
  const[statuses,setStatuses]=useState({});
  const[files,setFiles]=useState([]);
  const[modal,setModal]=useState(null);
  const[rpOpen,setRpOpen]=useState(false);
  const[period,setPeriod]=useState("P05");
  const{show,Toast}=useToast();
  const{loading,run}=useApi();
  const writeDD=useDropdown();
  const verifyDD=useDropdown();

  useEffect(()=>{handleScan();},[]);// eslint-disable-line

  const handleScan=()=>run(
    ()=>scanInboxWithPeriod(`${new Date().getFullYear()}-${period}`),
    res=>{setKanban(res.kanban||[]);show("掃描完成","ok");},
    e=>show(`掃描失敗：${e}`,"err")
  );

  const handleImport=(e)=>{
    const fs=[...e.target.files];if(!fs.length)return;
    run(()=>importFiles(fs),res=>show(`已導入 ${res.count} 個檔案`,"ok"),e=>show(`導入失敗：${e}`,"err"));
  };

  const getFlat=useCallback(()=>{
    const r=[];COLS.forEach(g=>{if(activeG.has(g.id))r.push(...g.subs)});return r;
  },[activeG]);

  const getList=useCallback(()=>{
    let list=kanban.slice();
    if(filt.proj)list=list.filter(e=>e.proj===filt.proj);
    if(filt.unit)list=list.filter(e=>(e.unit||"—")===filt.unit);
    if(filt.pm)list=list.filter(e=>e.pm===filt.pm);
    if(q){const ql=q.toLowerCase();list=list.filter(e=>(e.cn+e.en).toLowerCase().includes(ql));}
    // df is now used as period filter (e.g. "P05")
    if(df)list=list.filter(e=>(e.periods||[]).some(p=>p.endsWith(df)));
    if(sortMode==="name")list.sort((a,b)=>(a.cn||a.en).localeCompare(b.cn||b.en,"zh"));
    else if(sortMode==="date-asc")list.sort((a,b)=>(a.uploadDate||"").localeCompare(b.uploadDate||""));
    else list.sort((a,b)=>(b.uploadDate||"").localeCompare(a.uploadDate||""));
    return list;
  },[kanban,filt,q,df,sortMode]);

  const tree={};
  kanban.forEach(e=>{
    if(!tree[e.proj])tree[e.proj]={};
    const u=e.unit||"—";
    if(!tree[e.proj][u])tree[e.proj][u]=new Set();
    if(e.pm)tree[e.proj][u].add(e.pm);
  });

  const cycleStatus=(ev,eid,col)=>{
    ev.stopPropagation();
    setStatuses(prev=>{
      const emp=kanban.find(x=>x.id===eid);
      const cur=(prev[eid]||emp?.status||{})[col]||"na";
      const next=STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur)+1)%STATUS_CYCLE.length];
      return{...prev,[eid]:{...(prev[eid]||emp?.status||{}),[col]:next}};
    });
  };
  const getStatus=(emp,col)=>(statuses[emp.id]||emp.status||{})[col]||"na";
  const selEmp=kanban.find(e=>e.id===selId);
  const getForm=(eid)=>forms[eid]||mkForm();
  const setForm=(eid,f)=>setForms(p=>({...p,[eid]:f}));

  const onSelectEmp=(id)=>{
    setSelId(id);setRpOpen(true);
    const emp=kanban.find(e=>e.id===id);
    if(emp)run(()=>getEmployeeFiles(emp.en),r=>setFiles(r.files||[]),()=>setFiles([]));
  };

  const flat=getFlat(),list=getList();
  const okCount=list.reduce((a,e)=>a+flat.filter(s=>getStatus(e,s.id)==="ok").length,0);
  const missCount=list.reduce((a,e)=>a+flat.filter(s=>getStatus(e,s.id)==="miss").length,0);

  const clickP=(proj)=>{setTst(p=>({...p,[proj]:!p[proj]}));setFilt({proj,unit:null,pm:null});};
  const clickU=(proj,unit,e)=>{e.stopPropagation();setTst(p=>({...p,[`${proj}:${unit}`]:!p[`${proj}:${unit}`]}));setFilt({proj,unit,pm:null});};
  const clickPM=(proj,unit,pm,e)=>{e.stopPropagation();setFilt({proj,unit,pm});};

  const updRow=(eid,key,idx,field,val)=>{
    const f=getForm(eid);const rows=[...(f[key]||[])];
    rows[idx]={...rows[idx],[field]:val};
    if((field==="tstart"||field==="tend")&&(key==="ess"||key==="ot"))
      rows[idx].hours=calcH(rows[idx].tstart,rows[idx].tend);
    setForm(eid,{...f,[key]:rows});
  };
  const addRow=(eid,key,def={})=>{const f=getForm(eid);setForm(eid,{...f,[key]:[...(f[key]||[]),def]});};
  const rmRow=(eid,key,idx)=>{const f=getForm(eid);setForm(eid,{...f,[key]:f[key].filter((_,i)=>i!==idx)});};
  const toggleSec=(eid,id)=>{
    const f=getForm(eid);const s=new Set(f.checkedSecs||[]);
    s.has(id)?s.delete(id):s.add(id);setForm(eid,{...f,checkedSecs:s});
  };

  const openFile=async(f)=>{
    if(!selEmp)return;
    if(f.type==="eml"){
      try{const d=await previewEml(selEmp.en,f.name);setModal({type:"eml",name:f.name,data:d});}
      catch{show("無法預覽此 eml","err");}
    }else if(f.type==="pdf"){
      setModal({type:"pdf",name:f.name,url:previewFileUrl(selEmp.en,f.name)});
    }else{
      setModal({type:"xlsx",name:f.name,url:previewFileUrl(selEmp.en,f.name)});
    }
  };

  const grouped=!filt.unit&&!filt.pm&&!q&&!df&&!dt;

  return(
    <div>
      {/* NAV ACTIONS */}
      <div style={{position:"fixed",top:0,right:0,height:"var(--nav-h)",display:"flex",
                   alignItems:"center",gap:5,paddingRight:12,zIndex:201}}>
        {/* Period selector */}
        <select className="di" value={period} onChange={e=>setPeriod(e.target.value)}
                style={{background:"rgba(255,255,255,.15)",borderColor:"rgba(255,255,255,.3)",
                        color:"#D6EAFB",fontSize:11,padding:"3px 6px"}}>
          {["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"].map(m=>(
            <option key={m} value={m} style={{background:"var(--b800)"}}>{m}</option>
          ))}
        </select>
        <label className="btn ghost" style={{cursor:"pointer"}}>
          📂 <span>多檔</span>
          <input type="file" multiple style={{display:"none"}} onChange={handleImport}/>
        </label>
        <label className="btn ghost" style={{cursor:"pointer"}}>
          🗂 <span>資料夾</span>
          <input type="file" style={{display:"none"}} webkitdirectory="" onChange={handleImport}/>
        </label>
        <button className="btn ghost" onClick={handleScan} disabled={loading}>
          {loading?<span className="spinner"/>:"🔄"}<span>掃描</span>
        </button>
        <button className="btn ghost" onClick={()=>setModal({type:"download"})}>
          ⬇ <span>下載</span>
        </button>

        <div className="dropdown" ref={writeDD.ref}>
          <button className="btn ghost" onClick={()=>writeDD.setOpen(o=>!o)}>
            📝 <span>寫入</span> ▾
          </button>
          <div className={`dropdown-menu ${writeDD.open?"open":""}`}>
            <div className="dropdown-label">選擇寫入目標</div>
            <button className="dropdown-item" onClick={()=>{writeDD.setOpen(false);setModal({type:"write"});}}>📊 Nokia 工作天數表</button>
            <button className="dropdown-item" onClick={()=>{writeDD.setOpen(false);setModal({type:"write"});}}>📋 Project F CNS&MN</button>
            <button className="dropdown-item" onClick={()=>{writeDD.setOpen(false);setModal({type:"write"});}}>📈 SNDA Dashboard</button>
            <button className="dropdown-item" onClick={()=>{writeDD.setOpen(false);setModal({type:"write"});}}>💰 Nokia 費用統整</button>
          </div>
        </div>

        <div className="dropdown" ref={verifyDD.ref}>
          <button className="btn ghost" onClick={()=>verifyDD.setOpen(o=>!o)}>
            🔍 <span>核對</span> ▾
          </button>
          <div className={`dropdown-menu ${verifyDD.open?"open":""}`}>
            <div className="dropdown-label">選擇核對項目</div>
            <button className="dropdown-item" onClick={()=>{verifyDD.setOpen(false);setModal({type:"verify",item:"travel"});}}>✈️ Travel</button>
            <button className="dropdown-item" onClick={()=>{verifyDD.setOpen(false);setModal({type:"verify",item:"ot"});}}>⏰ OT</button>
            <button className="dropdown-item" onClick={()=>{verifyDD.setOpen(false);setModal({type:"verify",item:"ns"});}}>🌙 NS</button>
            <button className="dropdown-item" onClick={()=>{verifyDD.setOpen(false);setModal({type:"verify",item:"ess"});}}>📅 ESS</button>
            <div className="dropdown-sep"/>
            <button className="dropdown-item" onClick={()=>{verifyDD.setOpen(false);setModal({type:"verify",item:"all"});}}>🔍 全部核對</button>
          </div>
        </div>
      </div>

      <div className="kanban-layout">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="search-wrap">
            <span className="si">🔍</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜尋姓名…"/>
          </div>
          <div className="tree">
            {Object.keys(tree).map(proj=>(
              <React.Fragment key={proj}>
                <div className={`tree-proj ${filt.proj===proj&&!filt.unit?"sel":""}`} onClick={()=>clickP(proj)}>
                  <span className={`chv ${tst[proj]?"open":""}`}>▶</span>📁 {proj}
                </div>
                {tst[proj]&&Object.keys(tree[proj]).map(u=>(
                  <React.Fragment key={u}>
                    <div className={`tree-unit ${filt.proj===proj&&filt.unit===u&&!filt.pm?"sel":""}`}
                         onClick={e=>clickU(proj,u,e)}>
                      {[...tree[proj][u]].length>0&&<span className={`chv ${tst[`${proj}:${u}`]?"open":""}`}>▶</span>}
                      🏢 {u}
                    </div>
                    {tst[`${proj}:${u}`]&&[...tree[proj][u]].map(pm=>(
                      <div key={pm} className={`tree-pm ${filt.pm===pm?"sel":""}`}
                           onClick={e=>clickPM(proj,u,pm,e)}>👤 {pm}</div>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* MAIN */}
        <div className="main-area">
          <div className="toolbar">
            <span className="toolbar-title">
              {filt.pm?`${filt.pm} (${filt.unit})`:filt.unit?`${filt.proj}/${filt.unit}`:filt.proj||"全部員工"}
              （{list.length}人）
            </span>
            <span className="pill">{okCount} 已繳</span>
            <span className="pill r">{missCount} 缺件</span>
          </div>
          <div className="colbar">
            <span style={{fontSize:11,color:"#8AB2D8",flexShrink:0}}>顯示欄位：</span>
            {COLS.map(g=>(
              <span key={g.id} className={`chip ${activeG.has(g.id)?"on":""}`}
                    onClick={()=>setActiveG(prev=>{const s=new Set(prev);s.has(g.id)?(s.size>1&&s.delete(g.id)):s.add(g.id);return s;})}>
                {g.label}
              </span>
            ))}
          </div>
          <div className="sortbar">
            <span style={{fontSize:11,color:"#8AB2D8"}}>排序：</span>
            {[["name","姓名"],["date-asc","日期↑"],["date-desc","日期↓"]].map(([m,l])=>(
              <button key={m} className={`sort-btn ${sortMode===m?"on":""}`} onClick={()=>setSortMode(m)}>{l}</button>
            ))}
            <div className="vsep"/>
            <span style={{fontSize:11,color:"#8AB2D8"}}>月份篩選：</span>
            <button className={`sort-btn ${!df?"on":""}`} onClick={()=>setDf("")}>全部</button>
            {["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"].map(m=>(
              <button key={m} className={`sort-btn ${df===m?"on":""}`}
                      onClick={()=>setDf(df===m?"":m)} style={{padding:"2px 6px"}}>{m}</button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th className="nc">姓名</th>
                <th className="dc">上傳日期</th>
                {flat.map(s=><th key={s.id} style={{width:Math.max(60,110/flat.length|0)}}>{s.label}</th>)}
              </tr></thead>
              <tbody>
                {grouped?buildGrouped(list,flat,selId,getStatus,cycleStatus,onSelectEmp)
                        :list.map(e=>empRow(e,flat,selId,getStatus,cycleStatus,onSelectEmp))}
                {list.length===0&&<tr><td colSpan={flat.length+2}
                  style={{textAlign:"center",padding:20,color:"#888",fontSize:12}}>查無符合條件的員工</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className={`right-panel ${rpOpen?"open":""}`}>
          <div className="sheet-handle" onClick={()=>setRpOpen(false)} style={{cursor:"pointer"}}/>
          <div className="rtabs">
            <div className={`rtab ${curRT==="files"?"on":""}`} onClick={()=>setCurRT("files")}>📁 檔案</div>
            <div className={`rtab ${curRT==="form"?"on":""}`} onClick={()=>setCurRT("form")}>✏️ 填寫</div>
          </div>
          <div className="rpanel">
            {!selEmp
              ?<div className="empty-state">👆<br/>點選員工<br/>查看資料</div>
              :curRT==="files"
                ?<FilesTab emp={selEmp} files={files} onOpen={openFile}
                    onDlZip={()=>run(()=>downloadZip(selEmp.en),b=>downloadBlob(b,`${selEmp.en}.zip`),e=>show(e,"err"))}
                    onDlAll={()=>run(()=>downloadAllZip(),b=>downloadBlob(b,"all.zip"),e=>show(e,"err"))}/>
                :<FormTab emp={selEmp} form={getForm(selEmp.id)} activeG={activeG}
                    onToggleSec={id=>toggleSec(selEmp.id,id)}
                    onAddRow={(k,d)=>addRow(selEmp.id,k,d)}
                    onRmRow={(k,i)=>rmRow(selEmp.id,k,i)}
                    onUpdRow={(k,i,f,v)=>updRow(selEmp.id,k,i,f,v)}
                    onSetWD={v=>setForm(selEmp.id,{...getForm(selEmp.id),workdays:v})}/>
            }
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="mob-bottom-nav">
        <button className={`mob-nav-btn ${!rpOpen?"active":""}`} onClick={()=>setRpOpen(false)}>
          <span>📋</span><span>看板</span>
        </button>
        <button className={`mob-nav-btn ${rpOpen&&curRT==="files"?"active":""}`}
                onClick={()=>{setCurRT("files");setRpOpen(true);}}>
          <span>📁</span><span>檔案</span>
        </button>
        <button className={`mob-nav-btn ${rpOpen&&curRT==="form"?"active":""}`}
                onClick={()=>{setCurRT("form");setRpOpen(true);}}>
          <span>✏️</span><span>填寫</span>
        </button>
      </div>

      {/* MODALS */}
      {modal?.type==="write"&&<WriteModal forms={Object.fromEntries(kanban.map(e=>[e.en,forms[e.id]||mkForm()]))} onClose={()=>setModal(null)} show={show}/>}
      {modal?.type==="download"&&<DownloadModal allEmps={kanban} onClose={()=>setModal(null)} show={show}/>}
      {modal?.type==="verify"&&selEmp&&<VerifyModal emp={selEmp} form={getForm(selEmp.id)} onClose={()=>setModal(null)} show={show}/>}
      {modal?.type==="pdf"&&(
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal wide" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-hd-t">{modal.name}</span>
              <button className="btn sm" onClick={()=>setModal(null)}>✕</button></div>
            <div className="modal-body"><iframe src={modal.url} title={modal.name}/></div>
          </div>
        </div>
      )}
      {modal?.type==="eml"&&modal.data&&(
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-hd-t">{modal.name}</span>
              <button className="btn sm" onClick={()=>setModal(null)}>✕</button></div>
            <div className="modal-body">
              {[["From",modal.data.from],["To",modal.data.to],["Subject",modal.data.subject],["Date",modal.data.date]].map(([l,v])=>(
                <div key={l} style={{marginBottom:4,fontSize:12}}><strong style={{color:"var(--b800)"}}>{l}:</strong> {v}</div>
              ))}
              <div style={{marginTop:10,whiteSpace:"pre-wrap",borderTop:"1px solid var(--bd)",paddingTop:10,fontSize:12,maxHeight:200,overflow:"auto"}}>{modal.data.body}</div>
              {modal.data.attachments?.length>0&&(
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,fontWeight:500,color:"var(--b800)",marginBottom:4}}>附件：</div>
                  {modal.data.attachments.map(a=>(
                    <a key={a.filename} href={attachmentUrl(selEmp?.en||"",modal.name,a.filename)}
                       download={a.filename} style={{display:"block",fontSize:11,color:"var(--b600)",marginBottom:2}}>
                      📎 {a.filename} ({(a.size/1024).toFixed(1)} KB)
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {Toast}
    </div>
  );
}

function buildGrouped(list,flat,selId,getStatus,cycleStatus,onSelect){
  const grps={};
  list.forEach(e=>{
    const k=`${e.proj}||${e.unit||"—"}||${e.pm||""}`;
    if(!grps[k])grps[k]={proj:e.proj,unit:e.unit||"—",pm:e.pm||"",emps:[]};
    grps[k].emps.push(e);
  });
  let lp="",lu="";
  return Object.values(grps).flatMap(g=>{
    const rows=[];
    if(g.proj!==lp){rows.push(<tr key={`gp-${g.proj}`} className="gp"><td colSpan={flat.length+2}>📁 {g.proj}</td></tr>);lp=g.proj;lu="";}
    if(g.unit!==lu){rows.push(<tr key={`gu-${g.proj}-${g.unit}`} className="gu"><td colSpan={flat.length+2}>└ {g.unit}</td></tr>);lu=g.unit;}
    if(g.pm)rows.push(<tr key={`gpm-${g.pm}-${g.proj}`} className="gpm"><td colSpan={flat.length+2}>· PM: {g.pm}</td></tr>);
    g.emps.forEach(e=>rows.push(empRow(e,flat,selId,getStatus,cycleStatus,onSelect)));
    return rows;
  });
}

function empRow(e,flat,selId,getStatus,cycleStatus,onSelect){
  return(
    <tr key={e.id} className={`er ${selId===e.id?"sel":""}`} onClick={()=>onSelect(e.id)}>
      <td className="nc"><div className="ecn">{e.cn||e.en}</div>{e.cn&&e.en&&<div className="een">{e.en}</div>}</td>
      <td style={{fontSize:11,color:"#888",textAlign:"center"}}>{e.uploadDate}</td>
      {flat.map(s=>{const st=getStatus(e,s.id);return(
        <td key={s.id}><span className={`bdg ${st}`} onClick={ev=>cycleStatus(ev,e.id,s.id)}>
          <span className={`dot ${st}`}/>{st==="ok"?"已繳":st==="miss"?"缺件":"—"}
        </span></td>
      );})}
    </tr>
  );
}

function FilesTab({emp,files,onOpen,onDlZip,onDlAll}){
  return(
    <>
      <div className="rhd">{emp.cn||emp.en}
        {emp.cn&&emp.en&&<span style={{fontSize:11,fontWeight:400,color:"#888",marginLeft:5}}>{emp.en}</span>}
      </div>
      {files.length===0?<div style={{fontSize:12,color:"#888",padding:"8px 0"}}>暫無歸檔檔案</div>
        :files.map(f=>(
          <div key={f.name} className="file-row" onClick={()=>onOpen(f)}>
            <span className={`ftype ${f.type}`}>{f.type.toUpperCase()}</span>
            <span className="fname">{f.name}</span><span>👁</span>
          </div>
        ))}
      <div style={{display:"flex",gap:5,marginTop:8}}>
        <button className="btn sm" style={{flex:1,justifyContent:"center"}} onClick={onDlZip}>⬇ zip</button>
        <button className="btn sm" style={{flex:1,justifyContent:"center"}} onClick={onDlAll}>📦 全部</button>
      </div>
    </>
  );
}

function FormTab({emp,form,activeG,onToggleSec,onAddRow,onRmRow,onUpdRow,onSetWD}){
  const checked=form.checkedSecs||new Set(["tr"]);
  const essTotal=form.ess.reduce((a,r)=>a+(parseFloat(r.amount)||0),0);
  const nsTotal=form.ess.reduce((a,r)=>a+(parseFloat(r.ns_amount)||0),0);
  const taTotal=form.ta.reduce((a,r)=>a+(parseFloat(r.amount)||0),0);
  const warns=[];
  if(activeG.has("ess")&&checked.has("ess")&&!form.ess.length)warns.push("ESS 已勾選但未填寫");
  if(activeG.has("ot")&&checked.has("ot")&&!form.ot.length)warns.push("OT 已勾選但未填寫");
  if(activeG.has("travel")&&checked.has("travel")&&!form.ta.length)warns.push("差旅已勾選但未填寫");
  if(activeG.has("leave")&&checked.has("leave")&&!form.leave.length)warns.push("請假已勾選但未填寫");
  return(
    <>
      <div className="rhd">{emp.cn||emp.en}</div>
      {warns.length>0&&<div className="warn-box">⚠️ <strong>勾選但未填寫：</strong><br/>{warns.map(w=><div key={w}>· {w}</div>)}</div>}
      <div className="wd-row">
        <label>📅 Work Days</label>
        <input type="number" min="0" max="31" step="0.5" value={form.workdays} onChange={e=>onSetWD(e.target.value)}/>
        <span style={{fontSize:11,color:"#8AB2D8"}}>天</span>
      </div>
      <SecBlock id="ess" title="ESS / Night Shift" checked={checked.has("ess")} onToggle={()=>onToggleSec("ess")} onAdd={()=>onAddRow("ess")} badge={checked.has("ess")?(form.ess.length>0?`ESS ${Math.round(essTotal).toLocaleString()} / NS ${Math.round(nsTotal).toLocaleString()}`:"待填"):null}>
        {form.ess.map((r,i)=>(
          <div key={i} className="entry"><button className="rm-btn" onClick={()=>onRmRow("ess",i)}>×</button>
            <div className="fl">
              <div className="fg"><label>日期</label><input type="date" value={r.date||""} onChange={e=>onUpdRow("ess",i,"date",e.target.value)}/></div>
              <div className="fg"><label>開始</label><input type="time" value={r.tstart||""} onChange={e=>onUpdRow("ess",i,"tstart",e.target.value)}/></div>
              <div className="fg"><label>結束</label><input type="time" value={r.tend||""} onChange={e=>onUpdRow("ess",i,"tend",e.target.value)}/></div>
            </div>
            <div className="fl">
              <div className="fg"><label>時數</label><input readOnly value={r.hours||""} placeholder="自動"/></div>
              <div className="fg"><label>ESS金額</label><input type="number" value={r.amount||""} onChange={e=>onUpdRow("ess",i,"amount",e.target.value)}/></div>
              <div className="fg"><label>NS金額</label><input type="number" value={r.ns_amount||""} onChange={e=>onUpdRow("ess",i,"ns_amount",e.target.value)}/></div>
            </div>
          </div>
        ))}
        {form.ess.length>0&&<div className="subtotal">ESS NT${Math.round(essTotal).toLocaleString()}　NS NT${Math.round(nsTotal).toLocaleString()}</div>}
      </SecBlock>
      <SecBlock id="ot" title="OT 加班" checked={checked.has("ot")} onToggle={()=>onToggleSec("ot")} onAdd={()=>onAddRow("ot")} badge={checked.has("ot")?(form.ot.length>0?`${form.ot.length}筆`:"待填"):null}>
        {form.ot.map((r,i)=>(
          <div key={i} className="entry"><button className="rm-btn" onClick={()=>onRmRow("ot",i)}>×</button>
            <div className="fl">
              <div className="fg"><label>日期</label><input type="date" value={r.date||""} onChange={e=>onUpdRow("ot",i,"date",e.target.value)}/></div>
              <div className="fg"><label>開始</label><input type="time" value={r.tstart||""} onChange={e=>onUpdRow("ot",i,"tstart",e.target.value)}/></div>
              <div className="fg"><label>結束</label><input type="time" value={r.tend||""} onChange={e=>onUpdRow("ot",i,"tend",e.target.value)}/></div>
            </div>
            <div className="fl">
              <div className="fg"><label>時數</label><input readOnly value={r.hours||""} placeholder="自動"/></div>
              <div className="fg"><label>金額(選填)</label><input type="number" value={r.amount||""} onChange={e=>onUpdRow("ot",i,"amount",e.target.value)}/></div>
            </div>
          </div>
        ))}
        {form.ot.length>0&&<div className="outfmt">{fmtOt(form.ot)}</div>}
      </SecBlock>
      <SecBlock id="travel" title="差旅 TA" checked={checked.has("travel")} onToggle={()=>onToggleSec("travel")} onAdd={()=>onAddRow("ta")} badge={checked.has("travel")?(form.ta.length>0?`NT$${Math.round(taTotal).toLocaleString()}`:"待填"):null}>
        {form.ta.map((r,i)=>(
          <div key={i} className="entry"><button className="rm-btn" onClick={()=>onRmRow("ta",i)}>×</button>
            <div className="fl">
              <div className="fg"><label>開始日期</label><input type="date" value={r.from_date||""} onChange={e=>onUpdRow("ta",i,"from_date",e.target.value)}/></div>
              <div className="fg"><label>結束日期</label><input type="date" value={r.to_date||""} onChange={e=>onUpdRow("ta",i,"to_date",e.target.value)}/></div>
            </div>
            <div className="fl"><div className="fg"><label>金額</label><input type="number" value={r.amount||""} onChange={e=>onUpdRow("ta",i,"amount",e.target.value)}/></div></div>
          </div>
        ))}
        {form.ta.length>0&&<div className="subtotal">差旅小計 NT${Math.round(taTotal).toLocaleString()}</div>}
      </SecBlock>
      <SecBlock id="leave" title="請假" checked={checked.has("leave")} onToggle={()=>onToggleSec("leave")} onAdd={()=>onAddRow("leave",{type:"sick leave"})} badge={checked.has("leave")?(form.leave.length>0?`${form.leave.length}筆`:"待填"):null}>
        {form.leave.map((r,i)=>(
          <div key={i} className="entry"><button className="rm-btn" onClick={()=>onRmRow("leave",i)}>×</button>
            <div className="fl"><div className="fg" style={{flex:2}}><label>日期（空格分隔多日）</label>
              <input type="text" value={r.dates||""} placeholder="0504 0514 0526" onChange={e=>onUpdRow("leave",i,"dates",e.target.value)}/>
            </div></div>
            <div className="fl">
              <div className="fg"><label>假別</label>
                <select value={r.type||"sick leave"} onChange={e=>onUpdRow("leave",i,"type",e.target.value)}>
                  {LEAVE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="fg"><label>時數(選填)</label><input type="text" value={r.hours||""} placeholder="3hrs" onChange={e=>onUpdRow("leave",i,"hours",e.target.value)}/></div>
            </div>
            {r.type==="other"&&<div className="fl"><div className="fg" style={{flex:1}}><label>原因</label>
              <input type="text" value={r.reason||""} placeholder="請說明原因" onChange={e=>onUpdRow("leave",i,"reason",e.target.value)}/>
            </div></div>}
          </div>
        ))}
        {form.leave.length>0&&<div className="outfmt" style={{whiteSpace:"normal",wordBreak:"break-all"}}>{fmtLeave(form.leave)}</div>}
      </SecBlock>
    </>
  );
}

function SecBlock({id,title,checked,onToggle,onAdd,badge,children}){
  return(
    <div className="sec-block">
      <div className="sec-hd" onClick={onToggle}>
        <input type="checkbox" className="sec-check" checked={checked} onChange={onToggle} onClick={e=>e.stopPropagation()}/>
        <span className="sec-title">{title}</span>
        {badge&&<span className={badge.includes("待填")?"warn-badge":"ok-badge"}>{badge}</span>}
        {checked&&<button className="sec-add" onClick={e=>{e.stopPropagation();onAdd();}}>＋</button>}
      </div>
      {checked&&<div className="sec-body">{children}</div>}
    </div>
  );
}