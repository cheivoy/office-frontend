import { useState } from "react";
import { verifyAll } from "../api";
import { useApi } from "../hooks";

const VERIFY_ITEMS = [
  { id: "travel", label: "Travel 差旅",  icon: "✈️", fileLabel: "SNDA Travel DataSheet" },
  { id: "ot",     label: "OT 加班",      icon: "⏰", fileLabel: "SNDA OT/Shift Form" },
  { id: "ns",     label: "NS 夜班",      icon: "🌙", fileLabel: "SNDA OT/Shift Form（同上）" },
  { id: "ess",    label: "ESS 排班費",   icon: "📅", fileLabel: "ESS_ROTA_2026_費用統計" },
];

export default function VerifyModal({ emp, form, onClose, show }) {
  const [travelFile, setTravelFile] = useState(null);
  const [otFile,     setOtFile]     = useState(null);
  const [essFile,    setEssFile]    = useState(null);
  const [results,    setResults]    = useState(null);
  const { loading, run }            = useApi();

  const doVerify = () => {
    if (!travelFile && !otFile && !essFile) {
      show("請至少上傳一個核對檔案", "err");
      return;
    }
    run(
      () => verifyAll(emp.en, form, travelFile, otFile, essFile),
      (res) => { setResults(res); show("核對完成", "ok"); },
      (e)   => show(`核對失敗：${e}`, "err")
    );
  };

  const statusIcon = (r) => {
    if (!r) return null;
    if (r.status === "not_found") return <span style={{color:"#888"}}>⚪ 找不到紀錄</span>;
    if (r.status === "ok")        return <span style={{color:"#2E6B14"}}>✅ 核對正常</span>;
    return <span style={{color:"#A32D2D"}}>❌ 有異常</span>;
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-hd">
          <span className="modal-hd-t">🔍 核對 — {emp.cn || emp.en}</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!results ? (
            <>
              <p style={{fontSize:12,color:"#888",marginBottom:12}}>上傳需要核對的 Approval 檔案：</p>

              <FileUploadRow label="Travel DataSheet"     hint="SNDA_CNS_Taiwan_Travel_DataSheet"
                             file={travelFile} onChange={setTravelFile} id="v-travel" />
              <FileUploadRow label="OT / NS Form"         hint="SNDA_CNS_Taiwan_OT_OR_Shift_Request_Form"
                             file={otFile}     onChange={setOtFile}     id="v-ot"
                             note="OT 和 NS 核對使用同一個檔案" />
              <FileUploadRow label="ESS ROTA 費用統計"     hint="Wipro_ESS_ROTA_2026_費用統計"
                             file={essFile}    onChange={setEssFile}    id="v-ess" />

              <div style={{marginTop:12,padding:"8px 10px",background:"var(--b50)",
                           border:"1px solid var(--bd)",borderRadius:7,fontSize:11,color:"#888"}}>
                💡 系統只核對 Approved 狀態的紀錄，相同日期+時間視為同一筆
              </div>
            </>
          ) : (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:500,color:"var(--b800)"}}>核對結果</span>
                <button className="btn sm" onClick={()=>setResults(null)}>重新核對</button>
              </div>

              {VERIFY_ITEMS.map(item => {
                const r = results[item.id];
                if (!r) return null;
                return (
                  <div key={item.id} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span>{item.icon}</span>
                      <span style={{fontWeight:500,fontSize:12}}>{item.label}</span>
                      {statusIcon(r)}
                      <span style={{fontSize:11,color:"#888",marginLeft:"auto"}}>
                        比對 {r.matched_rows} 筆
                      </span>
                    </div>
                    {r.anomalies && r.anomalies.length > 0 ? (
                      <div className="verify-err">
                        {r.anomalies.map((a, i) => (
                          <div key={i} className={i>0?"verify-item":""}>
                            <div style={{fontWeight:500}}>⚠ {a.field}</div>
                            <div>預期：{a.expected}</div>
                            <div>實際：{a.found}</div>
                            {a.note && <div style={{color:"#888",marginTop:2}}>備註：{a.note}</div>}
                          </div>
                        ))}
                      </div>
                    ) : r.status === "ok" ? (
                      <div className="verify-ok">✓ 所有紀錄核對正常</div>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}
        </div>
        {!results && (
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn blue" onClick={doVerify} disabled={loading}>
              {loading ? <span className="spinner" /> : "🔍"} 開始核對
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileUploadRow({ label, hint, file, onChange, id, note }) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:500,color:"var(--b800)",marginBottom:3}}>{label}</div>
      {note && <div style={{fontSize:10,color:"#8AB2D8",marginBottom:3}}>{note}</div>}
      <label style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                     border:"1px dashed var(--bd2)",borderRadius:7,cursor:"pointer",
                     background: file ? "var(--ok-bg)" : "var(--b50)",fontSize:12}}>
        <span>{file ? "✅" : "📂"}</span>
        <span style={{flex:1,color: file ? "var(--ok-tx)" : "#888"}}>
          {file ? file.name : `選擇 ${hint}…`}
        </span>
        <input id={id} type="file" accept=".xlsx" style={{display:"none"}}
               onChange={e => onChange(e.target.files[0])} />
      </label>
    </div>
  );
}
