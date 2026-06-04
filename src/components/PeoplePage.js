import { useState, useEffect } from "react";
import { getPeople, getPeopleForPeriod, upsertPerson, deletePerson,
         importPeople, importPeopleForPeriod, getRosterPeriods } from "../api";
import { useToast, useApi } from "../hooks";

const blank = { proj: "", unit: "", pm: "", cn: "", en: "" };
const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];
const YEARS  = ["2025","2026","2027"];

export default function PeoplePage() {
  const [people,         setPeople]        = useState([]);
  const [editing,        setEditing]       = useState(null);
  const [draft,          setDraft]         = useState(blank);
  const [importYear,     setImportYear]    = useState("2026");
  const [importMonth,    setImportMonth]   = useState("");
  const [rosterPeriods,  setRosterPeriods] = useState([]);
  const [viewPeriod,     setViewPeriod]    = useState("");   // "" = global roster
  const [showImportOpts, setShowImportOpts]= useState(false);
  const { show, Toast }  = useToast();
  const { loading, run } = useApi();

  useEffect(() => { load(); loadRosterPeriods(); }, []); // eslint-disable-line

  const load = (period = viewPeriod) => run(
    () => period ? getPeopleForPeriod(period) : getPeople(),
    setPeople,
    e => show(`載入失敗：${e}`, "err")
  );

  const loadRosterPeriods = () => getRosterPeriods()
    .then(r => setRosterPeriods(r.periods || []))
    .catch(() => {});

  const save = () => {
    if (!draft.en.trim()) { show("英文姓名為必填", "err"); return; }
    run(
      () => upsertPerson({ ...draft, id: editing === "new" ? undefined : editing }),
      () => { load(); setEditing(null); setDraft(blank); show("儲存成功"); },
      e => show(`儲存失敗：${e}`, "err")
    );
  };

  const del = (id, name) => {
    if (!window.confirm(`確定刪除 ${name}？`)) return;
    run(() => deletePerson(id), () => { load(); show("已刪除"); }, e => show(e, "err"));
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const period = importMonth ? `${importYear}-${importMonth}` : "";
    const fn = period ? () => importPeopleForPeriod(file, period) : () => importPeople(file);
    run(
      fn,
      res => {
        load();
        loadRosterPeriods();
        setShowImportOpts(false);
        const msg = period
          ? `已為 ${period} 建立專屬名單，共 ${res.imported} 筆`
          : `匯入全域名單成功，共 ${res.imported} 筆`;
        show(msg);
      },
      e => show(`匯入失敗：${e}`, "err")
    );
  };

  // When user switches view period
  const switchView = (p) => {
    setViewPeriod(p);
    load(p);
  };

  return (
    <div className="people-page">
      <div className="people-hd">
        <h2>👥 人員管理</h2>

        {/* Period view selector */}
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
          <span style={{fontSize:11,color:"#8AB2D8"}}>查看名單：</span>
          <button className={`chip${!viewPeriod?" on":""}`}
                  style={{padding:"3px 10px",fontSize:11}}
                  onClick={()=>switchView("")}>全域</button>
          {rosterPeriods.map(p => (
            <button key={p} className={`chip${viewPeriod===p?" on":""}`}
                    style={{padding:"3px 10px",fontSize:11}}
                    onClick={()=>switchView(p)}>{p}</button>
          ))}
        </div>

        {/* Import button with options */}
        <div style={{position:"relative"}}>
          <button className="btn" style={{cursor:"pointer"}}
                  onClick={()=>setShowImportOpts(v=>!v)}>
            📤 匯入 Excel ▾
          </button>
          {showImportOpts && (
            <div style={{position:"absolute",top:"100%",right:0,zIndex:100,
                         background:"var(--card)",border:"1px solid var(--bd)",
                         borderRadius:8,padding:12,minWidth:260,
                         boxShadow:"0 4px 12px rgba(0,0,0,.15)"}}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--b800)",marginBottom:8}}>
                匯入選項
              </div>

              {/* Global or period-specific */}
              <div style={{marginBottom:8}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginBottom:4}}>
                  <input type="radio" name="import_type" value="global"
                         checked={!importMonth}
                         onChange={()=>setImportMonth("")} />
                  <span>覆蓋全域名單（所有月份基準）</span>
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer"}}>
                  <input type="radio" name="import_type" value="period"
                         checked={!!importMonth}
                         onChange={()=>setImportMonth(importMonth||"P05")} />
                  <span>建立特定月份名單</span>
                </label>
              </div>

              {importMonth && (
                <div style={{marginBottom:8,padding:"8px 10px",background:"var(--b50)",
                             border:"1px solid var(--bd)",borderRadius:6}}>
                  <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>選擇月份</div>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                    <select className="di" value={importYear}
                            onChange={e=>setImportYear(e.target.value)}
                            style={{fontSize:11,padding:"3px 6px"}}>
                      {YEARS.map(y=><option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {MONTHS.map(m=>(
                      <button key={m}
                              className={`chip${importMonth===m?" on":""}`}
                              style={{padding:"2px 7px",fontSize:10}}
                              onClick={()=>setImportMonth(m)}>{m}</button>
                    ))}
                  </div>
                  <div style={{marginTop:6,fontSize:11,color:"var(--ok-tx)"}}>
                    將建立 {importYear}-{importMonth} 專屬名單
                  </div>
                </div>
              )}

              <div style={{fontSize:10,color:"#8AB2D8",marginBottom:8,lineHeight:1.5}}>
                {importMonth
                  ? "📌 期別名單獨立存放，不影響其他月份。適合人員有異動（入職/離職）的情況。"
                  : "⚠️ 全域名單為所有月份的預設基準。若某月份沒有獨立名單則使用此基準。"}
              </div>

              <label className="btn blue" style={{cursor:"pointer",display:"block",textAlign:"center",fontSize:12}}>
                選擇 Excel 檔案並匯入
                <input type="file" accept=".xlsx" style={{display:"none"}} onChange={handleImport} />
              </label>
            </div>
          )}
        </div>

        <button className="btn blue" onClick={() => { setEditing("new"); setDraft(blank); }}>＋ 新增人員</button>
      </div>

      {/* View period indicator */}
      {viewPeriod && (
        <div style={{margin:"8px 0",padding:"6px 12px",background:"var(--b50)",
                     border:"1px solid var(--bd)",borderRadius:7,fontSize:12,
                     display:"flex",alignItems:"center",gap:8}}>
          📋 目前查看：<strong>{viewPeriod}</strong> 專屬名單（{people.length} 人）
          <button className="btn sm" style={{fontSize:10,marginLeft:"auto"}}
                  onClick={()=>switchView("")}>← 回全域名單</button>
        </div>
      )}

      <table className="people-table">
        <thead>
          <tr><th>專案</th><th>單位</th><th>PM</th><th>中文姓名</th><th>英文姓名</th><th style={{width:90}}>操作</th></tr>
        </thead>
        <tbody>
          {people.map(p => editing === p.id ? (
            <tr key={p.id}>
              {["proj","unit","pm","cn","en"].map(f => (
                <td key={f}><input className="date-input" style={{width:"100%"}}
                  value={draft[f]} onChange={e => setDraft({...draft,[f]:e.target.value})} /></td>
              ))}
              <td>
                <button className="btn sm blue" onClick={save} disabled={loading}>✓</button>{" "}
                <button className="btn sm" onClick={() => setEditing(null)}>✕</button>
              </td>
            </tr>
          ) : (
            <tr key={p.id}>
              <td><span className="proj-tag">{p.proj}</span></td>
              <td>{p.unit || "—"}</td>
              <td>{p.pm || "—"}</td>
              <td>{p.cn || "—"}</td>
              <td>{p.en}</td>
              <td>
                <button className="btn sm" onClick={() => { setEditing(p.id); setDraft({proj:p.proj,unit:p.unit||"",pm:p.pm||"",cn:p.cn||"",en:p.en}); }}>✎</button>{" "}
                <button className="btn sm danger" onClick={() => del(p.id, p.cn||p.en)}>✕</button>
              </td>
            </tr>
          ))}
          {editing === "new" && (
            <tr>
              {["proj","unit","pm","cn","en"].map(f => (
                <td key={f}><input className="date-input" style={{width:"100%"}}
                  value={draft[f]} onChange={e => setDraft({...draft,[f]:e.target.value})} /></td>
              ))}
              <td>
                <button className="btn sm blue" onClick={save} disabled={loading}>✓</button>{" "}
                <button className="btn sm" onClick={() => setEditing(null)}>✕</button>
              </td>
            </tr>
          )}
          {people.length === 0 && (
            <tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"#888",fontSize:12}}>
              尚無人員資料，請匯入 Excel 或手動新增
            </td></tr>
          )}
        </tbody>
      </table>
      {Toast}
    </div>
  );
}
