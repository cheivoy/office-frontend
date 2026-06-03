import { useState } from "react";
import { importFiles, scanInboxWithPeriod } from "../api";
import { useApi } from "../hooks";

const BASE = process.env.REACT_APP_API_URL || "";
const YEARS = ["2025", "2026", "2027"];
const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];

export default function ImportModal({ onClose, show, onScanDone }) {
  const [year,       setYear]       = useState("2026");
  const [month,      setMonth]      = useState("P05");
  const [step,       setStep]       = useState("select");   // select | importing | unmatched | scanning | done
  const [result,     setResult]     = useState(null);       // {saved, skipped, count}
  const [unmatched,  setUnmatched]  = useState([]);
  const [assigns,    setAssigns]    = useState({});          // {inbox_path: emp_name}
  const [people,     setPeople]     = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const { loading, run }            = useApi();

  const period = `${year}-${month}`;

  const loadPeople = async () => {
    try {
      const res = await fetch(`${BASE}/api/people`);
      const data = await res.json();
      setPeople(data);
    } catch {}
  };

  const doImport = async (files) => {
    if (!files.length) return;
    setStep("importing");
    run(
      () => importFiles([...files]),
      res => {
        setResult(res);
        // After import, scan immediately
        doScan(res);
      },
      e => { show(`導入失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const doScan = (importRes = null) => {
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
    // Send all manual assignments
    const promises = Object.entries(assigns)
      .filter(([, emp]) => emp)
      .map(([inbox_path, emp_name]) => {
        const fd = new FormData();
        fd.append("inbox_path", inbox_path);
        fd.append("emp_name", emp_name);
        fd.append("period", period);
        return fetch(`${BASE}/api/assign-manual`, { method: "POST", body: fd });
      });
    await Promise.all(promises);
    setStep("done");
    onScanDone && onScanDone(scanResult);
    show(`手動指定完成`, "ok");
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-hd-t">📂 導入檔案</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Step: select */}
          {step === "select" && <>
            {/* Year + Month */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>選擇月份（歸檔用）</div>
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
                          style={{padding:"3px 10px"}} onClick={()=>setMonth(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <div style={{marginTop:6,fontSize:11,color:"var(--ok-tx)",background:"var(--ok-bg)",
                           border:"1px solid #90CF60",borderRadius:6,padding:"4px 8px",display:"inline-block"}}>
                歸檔至：{period}
              </div>
            </div>

            {/* Upload zones */}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>📄</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇多個檔案</div>
                <div style={{fontSize:11}}>支援 PDF / xlsx / eml</div>
                <input type="file" multiple style={{display:"none"}}
                       onChange={e=>doImport(e.target.files)}/>
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
            <div style={{fontSize:11,color:"#888",padding:"6px 8px",background:"var(--b50)",
                         borderRadius:6,border:"1px solid var(--bd)"}}>
              💡 導入後自動掃描歸檔。無法識別員工的檔案可手動指定。
            </div>
          </>}

          {/* Step: importing */}
          {step === "importing" && <LoadingStep msg="正在導入檔案到 Inbox…" sub="請稍候"/>}

          {/* Step: scanning */}
          {step === "scanning" && <LoadingStep msg={`正在掃描並歸檔到 ${period}…`} sub="比對員工姓名中"/>}

          {/* Step: unmatched */}
          {step === "unmatched" && <>
            <div style={{fontSize:12,color:"var(--warn-tx)",background:"var(--warn-bg)",
                         border:"1px solid #F0D080",borderRadius:7,padding:"8px 10px",marginBottom:10}}>
              ⚠️ 以下 {unmatched.length} 個檔案無法自動識別員工，請手動指定：
            </div>
            <div style={{maxHeight:280,overflow:"auto"}}>
              {unmatched.map((u,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                                     padding:"6px 0",borderBottom:"1px solid var(--bd)"}}>
                  <div style={{flex:1,fontSize:11,wordBreak:"break-all",lineHeight:1.4,
                               color:"var(--b800)",padding:"2px 0"}}
                       title={u.file}>
                    📄 {u.file}
                  </div>
                  <select className="di" style={{width:140,fontSize:11}}
                          value={assigns[u.inbox_path]||""}
                          onChange={e=>setAssigns(p=>({...p,[u.inbox_path]:e.target.value}))}>
                    <option value="">— 選擇員工 —</option>
                    {people.map(p=>(
                      <option key={p.en} value={p.en}>
                        {p.cn?`${p.cn} ${p.en}`:p.en}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,fontSize:11,color:"#888"}}>
              未指定的檔案將留在 Inbox，之後可重新掃描。
            </div>
          </>}

          {/* Step: done */}
          {step === "done" && <>
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--b800)",marginBottom:8}}>
                導入完成
              </div>
              {result && <div style={{fontSize:12,color:"#555",marginBottom:4}}>
                已導入 {result.count} 個檔案
                {result.skipped?.length > 0 && `，跳過 ${result.skipped.length} 個重複`}
              </div>}
              {scanResult && <div style={{fontSize:12,color:"#555"}}>
                已歸檔 {scanResult.moved?.length || 0} 個
                {scanResult.unmatched?.length > 0 && `，${scanResult.unmatched.length} 個待手動指定`}
              </div>}
            </div>
          </>}

        </div>

        <div className="modal-footer">
          {step === "unmatched" && <>
            <button className="btn" onClick={()=>{ setStep("done"); onScanDone&&onScanDone(scanResult); }}>
              稍後處理
            </button>
            <button className="btn blue" onClick={doManualAssign} disabled={loading}>
              {loading?<span className="spinner"/>:"✓"} 確認指定
            </button>
          </>}
          {step === "done" && (
            <button className="btn blue" onClick={onClose}>關閉</button>
          )}
          {(step === "select") && (
            <button className="btn" onClick={onClose}>取消</button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingStep({ msg, sub }) {
  return (
    <div style={{textAlign:"center",padding:"32px 16px"}}>
      <div style={{marginBottom:16}}>
        <div style={{display:"inline-block",width:40,height:40,
                     border:"3px solid var(--b100)",borderTopColor:"var(--b600)",
                     borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      </div>
      <div style={{fontSize:13,fontWeight:500,color:"var(--b800)",marginBottom:4}}>{msg}</div>
      <div style={{fontSize:11,color:"#8AB2D8"}}>{sub}</div>
    </div>
  );
}