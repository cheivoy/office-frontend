import { useState } from "react";
import { batchWriteChtNokia, batchWriteChtDk, batchWriteWipro,
         batchWriteProjectF, batchWriteNokiaCost, downloadBlob } from "../api";
import { useApi } from "../hooks";

const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];

const TARGETS = [
  { id:"cht_nokia",  label:"Nokia 工作天數表",         icon:"📊", desc:"CHT 員工 / 固定範本 / 按 PM 分 11 份", needsFile:false },
  { id:"cht_dk",     label:"CHT DK 工時紀錄表",        icon:"📋", desc:"DK 員工 / 固定範本",                   needsFile:false },
  { id:"wipro",      label:"SNDA Dashboard (Wipro)",   icon:"📈", desc:"Wipro 員工 / 需上傳當月範本",          needsFile:true,  sheetInput:true },
  { id:"project_f",  label:"Project F CNS&MN",         icon:"📁", desc:"所有單位 / 需上傳當月範本",            needsFile:true  },
  { id:"nokia_cost", label:"Nokia 費用統整",            icon:"💰", desc:"所有員工 / 需上傳當月範本",            needsFile:true,  sheetInput:true },
];

export default function WriteModal({ forms, onClose, show }) {
  const [target,  setTarget]  = useState("cht_nokia");
  const [period,  setPeriod]  = useState("P05");
  const [sheet,   setSheet]   = useState("");
  const [file,    setFile]    = useState(null);
  const { loading, run }      = useApi();

  const tgt = TARGETS.find(t => t.id === target);
  const year = new Date().getFullYear();
  const fullPeriod = `${year}-${period}`;

  const doWrite = () => {
    if (tgt.needsFile && !file) { show("請先上傳當月範本", "err"); return; }

    run(async () => {
      let blob;
      if      (target === "cht_nokia")  blob = await batchWriteChtNokia(fullPeriod, forms);
      else if (target === "cht_dk")     blob = await batchWriteChtDk(fullPeriod, forms);
      else if (target === "wipro")      blob = await batchWriteWipro(fullPeriod, sheet, forms, file);
      else if (target === "project_f")  blob = await batchWriteProjectF(fullPeriod, forms, file);
      else if (target === "nokia_cost") blob = await batchWriteNokiaCost(fullPeriod, sheet, forms, file);
      const ext = target === "cht_nokia" ? "zip" : "xlsx";
      downloadBlob(blob, `${target}_${fullPeriod}.${ext}`);
      return "ok";
    },
    () => { show("批量寫入完成，已下載 ✓", "ok"); onClose(); },
    e  => show(`寫入失敗：${e}`, "err")
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-hd-t">📝 批量寫入 Excel</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Month */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>選擇月份</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {MONTHS.map(m => (
                <button key={m}
                        className={`chip ${period===m?"on":""}`}
                        style={{padding:"3px 10px"}}
                        onClick={() => setPeriod(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Target */}
          <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>寫入目標</div>
          {TARGETS.map(t => (
            <label key={t.id} className="radio-row">
              <input type="radio" name="wt" value={t.id} checked={target===t.id}
                     onChange={() => { setTarget(t.id); setFile(null); }} />
              <span style={{fontSize:16}}>{t.icon}</span>
              <span>
                <div style={{fontWeight:500,fontSize:12}}>{t.label}</div>
                <div style={{fontSize:11,color:"#888"}}>{t.desc}</div>
              </span>
            </label>
          ))}

          {/* Sheet name */}
          {tgt.sheetInput && (
            <div style={{marginTop:8}}>
              <div style={{fontSize:11,color:"#8AB2D8",marginBottom:3}}>
                Sheet 名稱（如 P06_26 / 5月費用申請）
              </div>
              <input className="di" style={{width:"100%"}} value={sheet}
                     onChange={e => setSheet(e.target.value)}
                     placeholder={target === "wipro" ? "P06_26" : "5月費用申請"} />
            </div>
          )}

          {/* File upload for monthly templates */}
          {tgt.needsFile && (
            <div className="upload-zone" style={{marginTop:10}}
                 onClick={() => document.getElementById("wm-file").click()}>
              {file
                ? <><div style={{fontSize:20}}>✅</div><div style={{fontWeight:500}}>{file.name}</div></>
                : <><div style={{fontSize:22}}>📂</div>
                  <div>點擊上傳當月範本 .xlsx</div>
                  <div style={{fontSize:11,color:"#aaa"}}>請使用最新版本範本</div></>
              }
            </div>
          )}
          {tgt.needsFile && (
            <input id="wm-file" type="file" accept=".xlsx" style={{display:"none"}}
                   onChange={e => setFile(e.target.files[0])} />
          )}

          {!tgt.needsFile && (
            <div style={{marginTop:10,padding:"8px 10px",background:"var(--ok-bg)",
                         border:"1px solid #90CF60",borderRadius:7,fontSize:11,color:"var(--ok-tx)"}}>
              ✓ 此報表使用伺服器固定範本，無需上傳
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn blue" onClick={doWrite}
                  disabled={loading || (tgt.needsFile && !file)}>
            {loading ? <span className="spinner"/> : "📥"} 批量寫入 {fullPeriod}
          </button>
        </div>
      </div>
    </div>
  );
}
