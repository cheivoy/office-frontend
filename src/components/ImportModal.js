import { useState } from "react";
import { importFiles, importFilesForce, scanInboxWithPeriod } from "../api";
import { useApi } from "../hooks";

const BASE = process.env.REACT_APP_API_URL || "";
const YEARS  = ["2025","2026","2027"];
const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];

export default function ImportModal({ onClose, show, onScanDone }) {
  const [year,       setYear]       = useState("2026");
  const [month,      setMonth]      = useState("P05");
  const [step,       setStep]       = useState("select");
  const [result,     setResult]     = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [pendingFiles,setPending]   = useState([]);
  const [unmatched,  setUnmatched]  = useState([]);
  const [assigns,    setAssigns]    = useState({});
  const [people,     setPeople]     = useState([]);
  const [empSearch,  setEmpSearch]  = useState({});
  const [scanResult, setScanResult] = useState(null);
  const { loading, run }            = useApi();

  const period = `${year}-${month}`;

  const loadPeople = async () => {
    try {
      const res = await fetch(`${BASE}/api/people`);
      setPeople(await res.json());
    } catch {}
  };

  const doImport = async (files) => {
    if (!files.length) return;
    setStep("importing");
    const fileArr = [...files];
    run(
      () => importFiles(fileArr),
      res => {
        setResult(res);
        if (res.duplicates && res.duplicates.length > 0) {
          setDuplicates(res.duplicates);
          setPending(fileArr.filter(f =>
            res.duplicates.some(d => d.filename === f.webkitRelativePath || d.filename === f.name)
          ));
          setStep("duplicates");
        } else {
          doScan();
        }
      },
      e => { show(`導入失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const forceImportDuplicates = () => {
    if (!pendingFiles.length) { doScan(); return; }
    run(
      () => importFilesForce(pendingFiles),
      () => doScan(),
      e => { show(`強制導入失敗：${e}`, "err"); }
    );
  };

  const doScan = () => {
    setStep("scanning");
    run(
      () => scanInboxWithPeriod(period),
      res => {
        setScanResult(res);
        if (res.unmatched && res.unmatched.length > 0) {
          setUnmatched(res.unmatched);
          loadPeople();
          setStep("unmatched");
        } else {
          setStep("done");
          onScanDone && onScanDone(res);
        }
      },
      e => { show(`掃描失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const doManualAssign = async () => {
    const promises = Object.entries(assigns)
      .filter(([,emp]) => emp)
      .map(([inbox_path, emp_name]) => {
        const fd = new FormData();
        fd.append("inbox_path", inbox_path);
        fd.append("emp_name", emp_name);
        fd.append("period", period);
        return fetch(`${BASE}/api/assign-manual`, { method:"POST", body:fd });
      });
    await Promise.all(promises);
    setStep("done");
    onScanDone && onScanDone(scanResult);
    show("手動指定完成", "ok");
  };

  // Group people by proj > unit for dropdown
  const groupedPeople = people.reduce((acc, p) => {
    const key = `${p.proj||"其他"} / ${p.unit||"—"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const EmpSelect = ({ inboxPath }) => {
    const sq = (empSearch[inboxPath]||"").toLowerCase();
    return (
      <div style={{flex:"0 0 220px"}}>
        <input
          type="text"
          placeholder="🔍 搜尋員工…"
          value={empSearch[inboxPath]||""}
          onChange={e => setEmpSearch(p=>({...p,[inboxPath]:e.target.value}))}
          style={{width:"100%",fontSize:11,padding:"3px 6px",border:"1px solid var(--bd2)",
                  borderRadius:"4px 4px 0 0",outline:"none",borderBottom:"none"}}
        />
        <select
          className="di"
          style={{width:"100%",fontSize:11,borderRadius:"0 0 4px 4px",height:80,
                  overflowY:"auto"}}
          size={4}
          value={assigns[inboxPath]||""}
          onChange={e => setAssigns(p=>({...p,[inboxPath]:e.target.value}))}
        >
          <option value="">— 選擇員工 —</option>
          {Object.entries(groupedPeople).map(([grp, emps]) => {
            const filtered = emps.filter(p =>
              !sq || (p.cn+p.en).toLowerCase().includes(sq)
            );
            if (!filtered.length) return null;
            return (
              <optgroup key={grp} label={grp}>
                {filtered.map(p => (
                  <option key={p.en} value={p.en}>
                    {p.cn ? `${p.cn} ${p.en}` : p.en}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-hd-t">📂 導入檔案</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* SELECT */}
          {step==="select" && <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>選擇月份</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <select className="di" value={year} onChange={e=>setYear(e.target.value)}
                        style={{fontSize:12,padding:"4px 8px"}}>
                  {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <span style={{fontSize:12,color:"#8AB2D8"}}>年</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {MONTHS.map(m=>(
                  <button key={m} className={`chip ${month===m?"on":""}`}
                          style={{padding:"3px 10px"}} onClick={()=>setMonth(m)}>{m}</button>
                ))}
              </div>
              <div style={{marginTop:6,fontSize:11,color:"var(--ok-tx)",background:"var(--ok-bg)",
                           border:"1px solid #90CF60",borderRadius:6,padding:"4px 8px",display:"inline-block"}}>
                歸檔至：{period}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>📄</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇多個檔案</div>
                <div style={{fontSize:11}}>支援 PDF / xlsx / eml</div>
                <input type="file" multiple style={{display:"none"}} onChange={e=>doImport(e.target.files)}/>
              </label>
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>🗂</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇資料夾</div>
                <div style={{fontSize:11}}>資料夾名稱用於比對員工</div>
                <input type="file" style={{display:"none"}} webkitdirectory=""
                       onChange={e=>doImport(e.target.files)}/>
              </label>
            </div>
            <div style={{marginTop:8,fontSize:11,color:"#888",padding:"6px 8px",
                         background:"var(--b50)",borderRadius:6,border:"1px solid var(--bd)"}}>
              💡 導入後自動掃描歸檔。無法識別員工的檔案可手動指定。
            </div>
          </>}

          {/* IMPORTING */}
          {step==="importing" && <Loading msg="正在導入檔案到 Inbox…" sub="請稍候"/>}

          {/* DUPLICATES */}
          {step==="duplicates" && <>
            <div style={{fontSize:12,color:"var(--warn-tx)",background:"var(--warn-bg)",
                         border:"1px solid #F0D080",borderRadius:7,padding:"8px 10px",marginBottom:10}}>
              ⚠️ 以下 {duplicates.length} 個檔案已存在，確定要覆蓋嗎？
            </div>
            <div style={{maxHeight:200,overflow:"auto",marginBottom:8}}>
              {duplicates.map((d,i)=>(
                <div key={i} style={{fontSize:11,padding:"4px 6px",
                                     borderBottom:"1px solid var(--bd)",
                                     wordBreak:"break-all",lineHeight:1.5}}>
                  📄 {d.filename}
                  {d.size_match && <span style={{color:"#8AB2D8",marginLeft:6}}>(內容相同)</span>}
                </div>
              ))}
            </div>
          </>}

          {/* SCANNING */}
          {step==="scanning" && <Loading msg={`掃描並歸檔到 ${period}…`} sub="比對員工姓名中"/>}

          {/* UNMATCHED */}
          {step==="unmatched" && <>
            <div style={{fontSize:12,color:"var(--warn-tx)",background:"var(--warn-bg)",
                         border:"1px solid #F0D080",borderRadius:7,padding:"8px 10px",marginBottom:10}}>
              ⚠️ {unmatched.length} 個檔案無法自動識別員工，請手動指定：
            </div>
            <div style={{maxHeight:320,overflow:"auto"}}>
              {unmatched.map((u,i)=>(
                <div key={i} style={{marginBottom:10,padding:"8px",
                                     background:"var(--b50)",border:"1px solid var(--bd)",borderRadius:7}}>
                  <div style={{fontSize:11,wordBreak:"break-all",lineHeight:1.5,
                               marginBottom:6,color:"var(--b800)"}}>
                    📄 {u.file}
                  </div>
                  <EmpSelect inboxPath={u.inbox_path}/>
                </div>
              ))}
            </div>
            <div style={{marginTop:6,fontSize:11,color:"#888"}}>
              未指定的檔案留在 Inbox，之後可重新掃描。
            </div>
          </>}

          {/* DONE */}
          {step==="done" && <>
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--b800)",marginBottom:8}}>導入完成</div>
              {result && <div style={{fontSize:12,color:"#555",marginBottom:4}}>
                已導入 {result.count} 個檔案
                {result.skipped?.length>0 && `，跳過 ${result.skipped.length} 個重複`}
              </div>}
              {scanResult && <div style={{fontSize:12,color:"#555"}}>
                已歸檔 {scanResult.moved?.length||0} 個
                {scanResult.unmatched?.length>0 && `，${scanResult.unmatched.length} 個待手動指定`}
              </div>}
            </div>
          </>}

        </div>

        <div className="modal-footer">
          {step==="select"     && <button className="btn" onClick={onClose}>取消</button>}
          {step==="duplicates" && <>
            <button className="btn" onClick={()=>{setDuplicates([]);setPending([]);doScan();}}>
              跳過重複，繼續
            </button>
            <button className="btn blue" onClick={forceImportDuplicates} disabled={loading}>
              {loading?<span className="spinner"/>:"⚠️"} 覆蓋並繼續
            </button>
          </>}
          {step==="unmatched"  && <>
            <button className="btn" onClick={()=>{setStep("done");onScanDone&&onScanDone(scanResult);}}>
              稍後處理
            </button>
            <button className="btn blue" onClick={doManualAssign} disabled={loading}>
              {loading?<span className="spinner"/>:"✓"} 確認指定
            </button>
          </>}
          {step==="done"       && <button className="btn blue" onClick={onClose}>關閉</button>}
        </div>
      </div>
    </div>
  );
}

function Loading({ msg, sub }) {
  return (
    <div style={{textAlign:"center",padding:"32px 16px"}}>
      <div style={{marginBottom:16}}>
        <div style={{display:"inline-block",width:40,height:40,border:"3px solid var(--b100)",
                     borderTopColor:"var(--b600)",borderRadius:"50%",
                     animation:"spin .8s linear infinite"}}/>
      </div>
      <div style={{fontSize:13,fontWeight:500,color:"var(--b800)",marginBottom:4}}>{msg}</div>
      <div style={{fontSize:11,color:"#8AB2D8"}}>{sub}</div>
    </div>
  );
}
