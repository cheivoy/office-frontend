import { useState, useEffect } from "react";
import { getPeople, upsertPerson, deletePerson, importPeople } from "../api";
import { useToast, useApi } from "../hooks";

const blank = { proj: "", unit: "", pm: "", cn: "", en: "" };

export default function PeoplePage() {
  const [people, setPeople]   = useState([]);
  const [editing, setEditing] = useState(null);   // null | "new" | id
  const [draft, setDraft]     = useState(blank);
  const { show, Toast }       = useToast();
  const { loading, run }      = useApi();

  useEffect(() => { load(); }, []); // eslint-disable-line

  const load = () => run(
    () => getPeople(),
    setPeople,
    e => show(`載入失敗：${e}`, "err")
  );

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
    run(
      () => importPeople(file),
      res => { load(); show(`匯入成功，共 ${res.imported} 筆`); },
      e => show(`匯入失敗：${e}`, "err")
    );
  };

  return (
    <div className="people-page">
      <div className="people-hd">
        <h2>👥 人員管理</h2>
        <label className="btn" style={{ cursor: "pointer" }}>
          📤 匯入 Excel
          <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleImport} />
        </label>
        <button className="btn blue" onClick={() => { setEditing("new"); setDraft(blank); }}>＋ 新增人員</button>
      </div>

      <table className="people-table">
        <thead>
          <tr><th>專案</th><th>單位</th><th>PM</th><th>中文姓名</th><th>英文姓名</th><th style={{ width: 90 }}>操作</th></tr>
        </thead>
        <tbody>
          {people.map(p => editing === p.id ? (
            <tr key={p.id}>
              {["proj","unit","pm","cn","en"].map(f => (
                <td key={f}><input className="date-input" style={{ width: "100%" }}
                  value={draft[f]} onChange={e => setDraft({ ...draft, [f]: e.target.value })} /></td>
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
                <button className="btn sm" onClick={() => { setEditing(p.id); setDraft({ ...p }); }}>✏</button>{" "}
                <button className="btn sm danger" onClick={() => del(p.id, p.en)}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing === "new" && (
        <div className="add-form">
          {[["proj","專案","CNS"],["unit","單位","wipro"],["pm","PM","(選填)"],["cn","中文姓名","陳○○"],["en","英文姓名 *","John Chen"]].map(([f, lbl, ph]) => (
            <div key={f} className="fg">
              <label style={{ fontSize: 11, color: "#8AB2D8", display: "block", marginBottom: 2 }}>{lbl}</label>
              <input className="date-input" style={{ width: "100%" }} placeholder={ph}
                     value={draft[f]} onChange={e => setDraft({ ...draft, [f]: e.target.value })} />
            </div>
          ))}
          <button className="btn blue sm" onClick={save} disabled={loading} style={{ alignSelf: "flex-end" }}>
            {loading ? <span className="spinner" /> : "✓ 儲存"}
          </button>
          <button className="btn sm" onClick={() => setEditing(null)} style={{ alignSelf: "flex-end" }}>✕</button>
        </div>
      )}

      {Toast}
    </div>
  );
}
