import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  scanInboxWithPeriod, getEmployeeFiles, previewFileUrl, previewEml,
  downloadZip, downloadAllZip, downloadBlob, attachmentUrl,
  clearAll, clearInbox, clearDepartments, deleteFile,
  moveFile, uploadToEmployee,
  getAllForms, saveForm, saveFormsBulk,
  getAllProgress, saveProgressBulk, warmup
} from "../api";
import { readWorkbook, verifyEmployee } from "../verify";
import { useToast, useApi, useDropdown } from "../hooks";
import WriteModal from "./WriteModal";
import DownloadModal from "./DownloadModal";
import ImportModal from "./ImportModal";

const COLS = [
  { id: "tr", label: "TR", subs: [{ id: "task_report", label: "Task Report" }, { id: "tr_approval", label: "TR Approval" }] },
  { id: "ess", label: "ESS", subs: [{ id: "ess_approval", label: "ESS Approval" }] },
  { id: "ot", label: "OT", subs: [{ id: "ot_approval", label: "OT Approval" }] },
  { id: "ns", label: "NS", subs: [{ id: "ns_approval", label: "NS Approval" }] },
  { id: "travel", label: "差旅", subs: [{ id: "travel_apply", label: "差旅申請" }, { id: "travel_approval", label: "差旅Approval" }] },
  { id: "leave", label: "請假", subs: [{ id: "leave_approval", label: "請假Approval" }] },
];
const STATUS_CYCLE = ["ok", "miss", "na"];
const LEAVE_TYPES = ["sick leave", "personal leave", "annual leave", "official leave", "other"];
const mkForm = () => ({ workdays: "", checkedSecs: new Set(["tr"]), ess: [], ns: [], ot: [], ta: [], leave: [] });

// ── Progress tracking definitions ──────────────────────────────────────────
const PROGRESS_DEFS = {
  wipro: {
    label: "Wipro",
    branches: [
      {
        id: "service",
        label: "Service Fee",
        steps: [
          { id: "tr_collect", label: "TR收集中" },
          {
            id: "verify_group", label: "核對", parallel: [
              { id: "verify_ess", label: "核對ESS" },
              { id: "verify_ot_ns", label: "核對OT/NS" },
              { id: "verify_leave", label: "核對請假" },
            ]
          },
          { id: "claim_service", label: "已提出請款 (service fee)", note: true },
          { id: "approval_service", label: "取得approval (service fee)", upload: true },
          { id: "invoice_service", label: "開票中 (service fee)", note: true },
          { id: "sent_service", label: "寄出發票", upload: true },
        ]
      },
      {
        id: "ta",
        label: "TA Fee",
        steps: [
          { id: "verify_ta", label: "核對TA（含差旅費申請）" },
          { id: "claim_ta", label: "已提出請款 (TA fee)", note: true },
          { id: "approval_ta", label: "取得approval (TA fee)", upload: true },
          { id: "invoice_ta", label: "開票中 (TA fee)", note: true },
          { id: "sent_ta", label: "寄出發票", upload: true },
        ]
      }
    ]
  },
  cnsf: {
    label: "CNSF",
    branches: [{
      id: "main",
      label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "travel_apply", label: "差旅費申請" },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
  ni: {
    label: "NI",
    branches: [{
      id: "main", label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "travel_apply", label: "差旅費申請" },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
  cht: {
    label: "CHT",
    branches: [{
      id: "main", label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "travel_apply", label: "差旅費申請" },
        {
          id: "pm_approve", label: "PM Approve（11名PM）",
          pmApprovals: [
            "Jessica Lu","David Chen","Kevin Lin","Amy Wang","Brian Chang",
            "Cindy Wu","Eric Huang","Fiona Lee","George Liu","Helen Tsai","Ivan Yang"
          ]
        },
        { id: "dk_confirm", label: "DK確認", upload: true },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
  twm: {
    label: "TWM",
    branches: [{
      id: "main", label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "upload_pdf", label: "上傳Ann整理pdf", upload: true },
        { id: "travel_apply", label: "差旅費申請" },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
  mo: {
    label: "MO",
    branches: [{
      id: "main", label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "travel_apply", label: "差旅費申請" },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
  cost_center: {
    label: "Cost Center",
    branches: [{
      id: "main", label: "",
      steps: [
        { id: "tr_collect", label: "TR收集中" },
        { id: "travel_apply", label: "差旅費申請" },
        { id: "claiming", label: "請款中", note: true },
        { id: "invoicing", label: "開票中", note: true },
        { id: "sent", label: "寄出發票", upload: true },
      ]
    }]
  },
};

// Map unit names to progress def keys
function getProgressKey(proj, unit) {
  const u = (unit || "").toLowerCase();
  if (u.includes("wipro")) return "wipro";
  if (u.includes("cnsf")) return "cnsf";
  if (u.includes("twm")) return "twm";
  if (u.includes("mo") || u === "mo") return "mo";
  if (u.includes("cht")) return "cht";
  if (proj === "NI") return "ni";
  if (u.includes("cost")) return "cost_center";
  return null;
}

// ── Form helpers ─────────────────────────────────────────────────────────────
function calcH(ts, te) {
  if (!ts || !te) return "";
  const [sh, sm] = ts.split(":").map(Number), [eh, em] = te.split(":").map(Number);
  let d = (eh * 60 + em) - (sh * 60 + sm); if (d < 0) d += 1440; return (d / 60).toFixed(1);
}
function calcLeaveH(tstart, tend) {
  if (!tstart || !tend) return null;
  const [sh, sm] = tstart.split(":").map(Number), [eh, em] = tend.split(":").map(Number);
  let d = (eh * 60 + em) - (sh * 60 + sm); if (d < 0) d += 1440;
  return d / 60;
}
function expandDateRange(from_date, to_date) {
  if (!from_date) return [];
  const fd = r => r.slice(5).replace("-", "");
  if (!to_date || to_date === from_date) return [fd(from_date)];
  const dates = []; const cur = new Date(from_date); const end = new Date(to_date);
  while (cur <= end) { dates.push(cur.toISOString().slice(5, 10).replace("-", "")); cur.setDate(cur.getDate() + 1); }
  return dates;
}
function fmtLeave(rows) {
  return rows.filter(r => r.from_date).map(r => {
    const dates = expandDateRange(r.from_date, r.to_date); const ds = dates.join(", ");
    const h = calcLeaveH(r.tstart, r.tend);
    const lbl = r.type === "other" && r.reason ? r.reason : (r.type || "leave");
    let hrsPart = h !== null ? (h >= 8 ? "_" : `_${parseFloat(h.toFixed(1))}hrs `) : "_";
    return `${ds}${hrsPart}${lbl}`;
  }).join("  ");
}
function fmtOt(rows) {
  return rows.filter(r => r.date && r.tstart && r.tend).map(r => {
    const mm = r.date.slice(5).replace("-", "");
    return `${mm}_${r.tstart.replace(":", "")}-${r.tend.replace(":", "")}` + (r.hours ? `_${r.hours}hrs` : "");
  }).join("  ");
}

// ── Serialization helpers ────────────────────────────────────────────────────
// Forms use Set for checkedSecs — must convert before JSON
// key: emp.id (number), value: form data  →  serialized key: emp.en (string)
function serializeForms(forms, kanban) {
  const out = {};
  Object.keys(forms).forEach(id => {
    // id may be numeric emp.id; look up en from kanban
    const emp = kanban ? kanban.find(e => String(e.id) === String(id)) : null;
    const key = emp ? emp.en : id;
    out[key] = { ...forms[id], checkedSecs: [...(forms[id].checkedSecs || [])] };
  });
  return out;
}
// Deserialize from backend (key = emp.en string) → React state (key = emp.id)
function deserializeFormsWithKanban(raw, kanban) {
  const out = {};
  Object.keys(raw).forEach(empEn => {
    const emp = kanban ? kanban.find(e => e.en === empEn) : null;
    const key = emp ? emp.id : empEn;
    out[key] = {
      ...raw[empEn],
      checkedSecs: Array.isArray(raw[empEn].checkedSecs)
        ? new Set(raw[empEn].checkedSecs)
        : new Set(["tr"]),
    };
  });
  return out;
}
// Pure deserialization (key stays as-is, used for cache read before kanban loads)
function deserializeForms(raw) {
  const out = {};
  Object.keys(raw).forEach(id => {
    out[id] = {
      ...raw[id],
      checkedSecs: Array.isArray(raw[id].checkedSecs)
        ? new Set(raw[id].checkedSecs)
        : new Set(["tr"]),
    };
  });
  return out;
}

// ── localStorage cache helpers ────────────────────────────────────────────────
const LS_FORMS    = "kanban_forms_v2";
const LS_PROGRESS = "kanban_progress_v2";
const LS_STATUSES = "kanban_statuses_v2";

function cacheReadForms() {
  try { return JSON.parse(localStorage.getItem(LS_FORMS) || "{}"); } catch { return {}; }
}
function cacheWriteForms(serialized) {
  try { localStorage.setItem(LS_FORMS, JSON.stringify(serialized)); } catch {}
}
function cacheReadProgress() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}"); } catch { return {}; }
}
function cacheWriteProgress(data) {
  try { localStorage.setItem(LS_PROGRESS, JSON.stringify(data)); } catch {}
}
function cacheReadStatuses() {
  try { return JSON.parse(localStorage.getItem(LS_STATUSES) || "{}"); } catch { return {}; }
}
function cacheWriteStatuses(data) {
  try { localStorage.setItem(LS_STATUSES, JSON.stringify(data)); } catch {}
}
// Merge: take whichever entry has the newer updated_at
function mergeByTimestamp(local, remote) {
  const merged = { ...local };
  Object.keys(remote).forEach(key => {
    const localTs  = local[key]?.updated_at  || "";
    const remoteTs = remote[key]?.updated_at || "";
    if (remoteTs >= localTs) merged[key] = remote[key];
  });
  return merged;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Kanban() {
  const [kanban, setKanban] = useState([]);
  const [activeG, setActiveG] = useState(new Set(["tr", "ess", "ot", "ns", "travel", "leave"]));
  const [tst, setTst] = useState({});  // tree open state
  const [filt, setFilt] = useState({ proj: null, unit: null, pm: null });
  const [q, setQ] = useState("");
  const [sortMode, setSortMode] = useState("name");
  const [df, setDf] = useState("");
  const [selId, setSelId] = useState(null);
  const [curRT, setCurRT] = useState("files");
  const [forms, setForms] = useState({});
  const [statuses, setStatuses] = useState({});
  const [files, setFiles] = useState([]);
  const [modal, setModal] = useState(null);
  const [rpOpen, setRpOpen] = useState(false);
  const [mobilePage, setMobilePage] = useState("kanban"); // "kanban" | "more"
  const [period] = useState("P05");
  const [year, setYear] = useState("2026");
  const [progress, setProgress] = useState({});
  // Sync status tracking
  const [dirtyForms, setDirtyForms] = useState(new Set());    // emp_en with unsaved changes
  const [dirtyProgress, setDirtyProgress] = useState(false);  // any progress unsaved
  const [syncLoading, setSyncLoading] = useState(false);
  const fullPeriod = `${year}-${period}`;
  const { show, Toast } = useToast();
  const { loading, run } = useApi();
  const writeDD = useDropdown();
  const verifyDD = useDropdown();

  // ── Data loading ──────────────────────────────────────────────────────────
  // Step 1: immediately load from localStorage cache (0ms, instant display)
  useEffect(() => {
    const cachedForms    = cacheReadForms();
    const cachedProgress = cacheReadProgress();
    if (Object.keys(cachedForms).length)    setForms(deserializeForms(cachedForms));
    if (Object.keys(cachedProgress).length) setProgress(cachedProgress);
  }, []); // eslint-disable-line

  // Step 1b: once kanban (emp list) is available, restore statuses from cache.
  // Cache is keyed by emp.en; state is keyed by emp.id — map en→id here.
  useEffect(() => {
    if (!kanban.length) return;
    const byEn = cacheReadStatuses();
    if (!Object.keys(byEn).length) return;
    const byId = {};
    kanban.forEach(e => { if (byEn[e.en]) byId[e.id] = byEn[e.en]; });
    if (Object.keys(byId).length) setStatuses(prev => ({ ...byId, ...prev }));
  }, [kanban.length]); // eslint-disable-line

  // Step 2: after kanban loads (has emp list), fetch backend data for current period
  // and merge with local cache — remote wins if newer timestamp
  useEffect(() => {
    if (!kanban.length) return;
    getAllForms(fullPeriod)
      .then(remote => {
        if (!remote || typeof remote !== "object") return;
        const localRaw = cacheReadForms();
        const merged   = mergeByTimestamp(localRaw, remote);
        cacheWriteForms(merged);
        setForms(deserializeFormsWithKanban(merged, kanban));
        // Re-mark any local entry not yet persisted (missing on server, or local newer)
        // as dirty, so a page refresh doesn't silently drop unsynced data.
        const pending = new Set();
        Object.keys(localRaw).forEach(empEn => {
          const localTs  = localRaw[empEn]?.updated_at || "";
          const remoteTs = remote[empEn]?.updated_at   || "";
          if (!remote[empEn] || localTs > remoteTs) pending.add(empEn);
        });
        if (pending.size) setDirtyForms(prev => new Set([...prev, ...pending]));
      })
      .catch(() => {
        // Backend unreachable — treat all cached forms as dirty so nothing is lost
        const localRaw = cacheReadForms();
        const keys = Object.keys(localRaw);
        if (keys.length) setDirtyForms(prev => new Set([...prev, ...keys]));
      });
    getAllProgress()
      .then(remote => {
        if (!remote || typeof remote !== "object") return;
        const localProg = cacheReadProgress();
        const merged    = mergeByTimestamp(localProg, remote);
        cacheWriteProgress(merged);
        // Pull manual statuses back out (stored under reserved __statuses key)
        const remoteStatuses = merged["__statuses"];
        if (remoteStatuses && typeof remoteStatuses === "object") {
          const localByEn = cacheReadStatuses();
          const byId = {};
          kanban.forEach(e => {
            const v = remoteStatuses[e.en];
            // Local edits win if present (avoids clobbering unsynced clicks)
            if (localByEn[e.en]) byId[e.id] = localByEn[e.en];
            else if (v && typeof v === "object") byId[e.id] = v;
          });
          if (Object.keys(byId).length) setStatuses(prev => ({ ...byId, ...prev }));
        }
        // Don't render the reserved key as a real progress unit
        const progressOnly = { ...merged };
        delete progressOnly["__statuses"];
        setProgress(progressOnly);
      })
      .catch(() => {});
  }, [kanban.length]); // eslint-disable-line

  useEffect(() => { warmup(); handleScan(); }, []);// eslint-disable-line

  const handleScan = () => run(
    () => scanInboxWithPeriod(fullPeriod),
    res => { setKanban(res.kanban || []); show("掃描完成", "ok"); },
    e => show(`掃描失敗：${e}`, "err")
  );

  // ── Sync functions ────────────────────────────────────────────────────────
  // Stamp current time on a form entry before sync
  const stampNow = () => new Date().toISOString().slice(0, 19);

  // Single employee form sync
  const syncOneForm = async (empEn) => {
    const emp = kanban.find(e => e.en === empEn);
    if (!emp) return;
    const raw = serializeForms({ [emp.id]: forms[emp.id] || mkForm() }, kanban);
    const entry = { ...raw[empEn], updated_at: stampNow() };
    try {
      const saved = await saveForm(empEn, entry);
      // Update cache with server-confirmed data
      const cached = cacheReadForms();
      cached[empEn] = saved;
      cacheWriteForms(cached);
      setDirtyForms(prev => { const s = new Set(prev); s.delete(empEn); return s; });
      show(`${emp.cn || empEn} 已同步 ✓`, "ok");
    } catch (e) {
      if (e.message?.includes("409") || e.message?.includes("Conflict")) {
        // Server has newer data — pull it first
        show(`${emp.cn || empEn} 有衝突，已從後端更新，請再同步一次`, "info");
        const fresh = await getAllForms(fullPeriod);
        if (fresh[empEn]) {
          const cached = cacheReadForms();
          cached[empEn] = fresh[empEn];
          cacheWriteForms(cached);
          setForms(prev => ({ ...prev, [emp.id]: {
            ...fresh[empEn],
            checkedSecs: Array.isArray(fresh[empEn].checkedSecs)
              ? new Set(fresh[empEn].checkedSecs) : new Set(["tr"])
          }}));
        }
      } else {
        show(`同步失敗：${e.message}`, "err");
      }
    }
  };

  // Sync all dirty forms + all progress at once.
  // Optimistic: local cache is already written on every edit, so we give instant
  // feedback and run the network calls in the background without freezing the UI.
  const syncAll = async () => {
    const hasForms = dirtyForms.size > 0;
    const hasProgress = dirtyProgress;
    if (!hasForms && !hasProgress) { show("沒有需要同步的變更", "info"); return; }

    // Snapshot what we're about to send (so later edits during the request aren't lost)
    const ts = stampNow();
    const formsToSend = new Set(dirtyForms);

    setSyncLoading(true);
    show("同步中…（資料已先存在本機）", "info");

    // Build forms payload
    const buildFormsPayload = () => {
      const p = {};
      formsToSend.forEach(empEn => {
        const emp = kanban.find(e => e.en === empEn);
        if (!emp) return;
        const raw = serializeForms({ [emp.id]: forms[emp.id] || mkForm() }, kanban);
        p[empEn] = { ...raw[empEn], updated_at: ts };
      });
      return p;
    };

    // Build progress + statuses payload
    const buildProgressPayload = () => {
      const stamped = {};
      Object.keys(progress).forEach(k => { stamped[k] = { ...progress[k], updated_at: ts }; });
      const statusByEn = {};
      Object.keys(statuses).forEach(id => {
        const e = kanban.find(x => String(x.id) === String(id));
        if (e) statusByEn[e.en] = statuses[id];
      });
      if (Object.keys(statusByEn).length) stamped["__statuses"] = { ...statusByEn, updated_at: ts };
      return stamped;
    };

    // Fire both bulk calls in parallel
    const formsPayload = hasForms ? buildFormsPayload() : null;
    const progressPayload = hasProgress ? buildProgressPayload() : null;

    const tasks = [];
    tasks.push(formsPayload && Object.keys(formsPayload).length
      ? saveFormsBulk(formsPayload) : Promise.resolve(null));
    tasks.push(progressPayload && Object.keys(progressPayload).length
      ? saveProgressBulk(progressPayload) : Promise.resolve(null));

    try {
      const [fResult, pResult] = await Promise.all(tasks);

      // Forms result
      let savedCount = 0, skipped = [];
      if (fResult) {
        savedCount = fResult.saved_count || 0;
        skipped = fResult.skipped || [];
        const cached = cacheReadForms();
        (fResult.saved || []).forEach(en => { if (formsPayload[en]) cached[en] = formsPayload[en]; });
        cacheWriteForms(cached);
        setDirtyForms(prev => {
          const s = new Set(prev);
          (fResult.saved || []).forEach(en => s.delete(en));
          return s;
        });
      }

      // Progress result
      let progressMsg = "";
      if (pResult) {
        cacheWriteProgress(progressPayload);
        setDirtyProgress(false);
        progressMsg = `，進度/狀態 ${pResult.saved_count || 0} 筆`;
      }

      // Handle conflicts (rare) — pull fresh in background
      if (skipped.length > 0) {
        getAllForms(fullPeriod).then(fresh => {
          const newForms = { ...forms }, newCache = cacheReadForms();
          skipped.forEach(en => {
            if (fresh[en]) {
              const emp = kanban.find(e => e.en === en);
              if (emp) newForms[emp.id] = {
                ...fresh[en],
                checkedSecs: Array.isArray(fresh[en].checkedSecs) ? new Set(fresh[en].checkedSecs) : new Set(["tr"])
              };
              newCache[en] = fresh[en];
            }
          });
          setForms(newForms); cacheWriteForms(newCache);
        }).catch(() => {});
      }

      const skipMsg = skipped.length > 0 ? `（${skipped.length} 筆有衝突已更新）` : "";
      show(`✅ 同步完成：表單 ${savedCount} 筆${progressMsg} ${skipMsg}`, "ok");
    } catch (e) {
      // Local data is safe; dirty flags stay set so user can retry
      show(`同步失敗（資料已存本機，稍後可重試）：${e.message}`, "err");
    } finally {
      setSyncLoading(false);
    }
  };

  // Wrap setProgress to mark dirty + update cache immediately
  const setProgressDirty = (updater) => {
    setProgress(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      cacheWriteProgress(next);   // write cache immediately
      return next;
    });
    setDirtyProgress(true);
  };

  const getFlat = useCallback(() => {
    const r = []; COLS.forEach(g => { if (activeG.has(g.id)) r.push(...g.subs) }); return r;
  }, [activeG]);

  const getList = useCallback(() => {
    let list = kanban.slice();
    if (filt.proj) list = list.filter(e => e.proj === filt.proj);
    if (filt.unit) list = list.filter(e => (e.unit || "—") === filt.unit);
    if (filt.pm) list = list.filter(e => e.pm === filt.pm);
    if (q) { const ql = q.toLowerCase(); list = list.filter(e => (e.cn + e.en).toLowerCase().includes(ql)); }
    // Issue 5 fix: do NOT filter out employees when period is selected
    // Instead, show all employees and reflect their status for that period
    if (sortMode === "name") list.sort((a, b) => (a.cn || a.en).localeCompare(b.cn || b.en, "zh"));
    else if (sortMode === "date-asc") list.sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""));
    else list.sort((a, b) => (b.uploadDate || "").localeCompare(a.uploadDate || ""));
    return list;
  }, [kanban, filt, q, df, sortMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = {};
  kanban.forEach(e => {
    if (!tree[e.proj]) tree[e.proj] = {};
    const u = e.unit || "—";
    if (!tree[e.proj][u]) tree[e.proj][u] = new Set();
    if (e.pm) tree[e.proj][u].add(e.pm);
  });

  // Fix: toggle tree open/close independently from filter selection
  const clickP = (proj) => {
    setTst(p => ({ ...p, [proj]: !p[proj] }));
    setFilt(prev => prev.proj === proj && !prev.unit ? { proj: null, unit: null, pm: null } : { proj, unit: null, pm: null });
  };
  const clickU = (proj, unit, e) => {
    e.stopPropagation();
    setTst(p => ({ ...p, [`${proj}:${unit}`]: !p[`${proj}:${unit}`] }));
    setFilt(prev => prev.proj === proj && prev.unit === unit && !prev.pm ? { proj, unit: null, pm: null } : { proj, unit, pm: null });
  };
  const clickPM = (proj, unit, pm, e) => {
    e.stopPropagation();
    setFilt(prev => prev.pm === pm ? { proj, unit, pm: null } : { proj, unit, pm });
  };

  const cycleStatus = (ev, eid, col) => {
    ev.stopPropagation();
    setStatuses(prev => {
      const emp = kanban.find(x => x.id === eid);
      const cur = (prev[eid] || emp?.status || {})[col] || "na";
      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
      const updated = { ...prev, [eid]: { ...(prev[eid] || emp?.status || {}), [col]: next } };
      // Persist immediately to localStorage (survives refresh) keyed by emp.en
      const byEn = {};
      Object.keys(updated).forEach(id => {
        const e = kanban.find(x => String(x.id) === String(id));
        if (e) byEn[e.en] = updated[id];
      });
      cacheWriteStatuses(byEn);
      return updated;
    });
    // Mark dirty so it syncs to backend with the next 同步全部
    setDirtyProgress(true);
  };
  // Issue 5 fix: when a period is selected (df), read status from periodStatus[df]
  // This way employees with NO files for that period still appear (as "na" / missing)
  const getStatus = (emp, col) => {
    // Manual overrides (clicked in UI) always take precedence
    if (statuses[emp.id] && statuses[emp.id][col] !== undefined) {
      return statuses[emp.id][col];
    }
    if (df && emp.periodStatus) {
      // Use per-period status from backend
      const pStat = emp.periodStatus[df] || {};
      return pStat[col] || "na";
    }
    return (emp.status || {})[col] || "na";
  };
  const selEmp = kanban.find(e => e.id === selId);
  const getForm = (eid) => forms[eid] || mkForm();
  const setForm = (eid, f) => {
    setForms(p => {
      const next = { ...p, [eid]: f };
      // Write to localStorage cache immediately — fast local persistence
      const emp = kanban.find(e => e.id === eid);
      if (emp) {
        const cached = cacheReadForms();
        cached[emp.en] = { ...f, checkedSecs: [...(f.checkedSecs || [])], updated_at: new Date().toISOString().slice(0, 19) };
        cacheWriteForms(cached);
      }
      return next;
    });
    // Mark dirty (needs backend sync)
    const emp = kanban.find(e => e.id === eid);
    if (emp) setDirtyForms(prev => new Set([...prev, emp.en]));
  };

  const onSelectEmp = (id) => {
    setSelId(id); setRpOpen(true);
    const emp = kanban.find(e => e.id === id);
    if (emp) run(() => getEmployeeFiles(emp.en, fullPeriod), r => setFiles(r.files || []), () => setFiles([]));
  };

  const updRow = (eid, key, idx, field, val) => {
    const f = getForm(eid); const rows = [...(f[key] || [])];
    rows[idx] = { ...rows[idx], [field]: val };
    if ((field === "tstart" || field === "tend") && (key === "ess" || key === "ot" || key === "ns"))
      rows[idx].hours = calcH(rows[idx].tstart, rows[idx].tend);
    setForm(eid, { ...f, [key]: rows });
  };
  const addRow = (eid, key, def = {}) => { const f = getForm(eid); setForm(eid, { ...f, [key]: [...(f[key] || []), def] }); };
  const rmRow = (eid, key, idx) => { const f = getForm(eid); setForm(eid, { ...f, [key]: f[key].filter((_, i) => i !== idx) }); };
  const toggleSec = (eid, id) => {
    const f = getForm(eid); const s = new Set(f.checkedSecs || []);
    s.has(id) ? s.delete(id) : s.add(id); setForm(eid, { ...f, checkedSecs: s });
  };

  const openFile = async (f) => {
    if (!selEmp) return;
    const fp = f.path || f.name;
    if (f.type === "eml") {
      try { const d = await previewEml(selEmp.en, fp); setModal({ type: "eml", name: f.name, data: d }); }
      catch { show("無法預覽此 eml", "err"); }
    } else if (f.type === "pdf") {
      setModal({ type: "pdf", name: f.name, url: previewFileUrl(selEmp.en, fp) });
    } else {
      setModal({ type: "xlsx", name: f.name, url: previewFileUrl(selEmp.en, fp) });
    }
  };

  const flat = getFlat(), list = getList();
  const okCount = list.reduce((a, e) => a + flat.filter(s => getStatus(e, s.id) === "ok").length, 0);
  const missCount = list.reduce((a, e) => a + flat.filter(s => getStatus(e, s.id) === "miss").length, 0);
  const grouped = !filt.unit && !filt.pm && !q && !df;

  // Group list by unit for progress bars
  const unitGroups = {};
  list.forEach(e => {
    const key = `${e.proj}||${e.unit || "—"}`;
    if (!unitGroups[key]) unitGroups[key] = { proj: e.proj, unit: e.unit || "—", emps: [] };
    unitGroups[key].emps.push(e);
  });

  const filtTitle = filt.pm ? `${filt.pm} (${filt.unit})` : filt.unit ? `${filt.proj}/${filt.unit}` : filt.proj || "全部員工";

  const isDirty = dirtyForms.size > 0 || dirtyProgress;

  return (
    <div className="kanban-page">

      {/* ACTION BAR */}
      <div className="action-bar">
        <span className="ab-group-label">檔案</span>
        <div className="ab-group">
          <button className="ab-btn" onClick={() => setModal({ type: "import" })}>📂 導入</button>
          <button className="ab-btn" onClick={handleScan} disabled={loading}>
            {loading ? <span className="spinner" /> : "🔄"} 掃描
          </button>
          <button className="ab-btn" onClick={() => setModal({ type: "download" })}>⬇ 下載</button>
        </div>
        <div className="ab-sep" />
        <span className="ab-group-label">Excel</span>
        <div className="ab-group">
          <div className="dropdown" ref={writeDD.ref}>
            <button className="ab-btn" onClick={() => writeDD.setOpen(o => !o)}>📝 寫入 ▾</button>
            <div className={`dropdown-menu ${writeDD.open ? "open" : ""}`}>
              <div className="dropdown-label">選擇寫入目標</div>
              <button className="dropdown-item" onClick={() => { writeDD.setOpen(false); setModal({ type: "write" }); }}>📊 Nokia 工作天數表</button>
              <button className="dropdown-item" onClick={() => { writeDD.setOpen(false); setModal({ type: "write" }); }}>📋 Project F CNS&amp;MN</button>
              <button className="dropdown-item" onClick={() => { writeDD.setOpen(false); setModal({ type: "write" }); }}>📈 SNDA Dashboard</button>
              <button className="dropdown-item" onClick={() => { writeDD.setOpen(false); setModal({ type: "write" }); }}>💰 Nokia 費用統整</button>
            </div>
          </div>
          <div className="dropdown" ref={verifyDD.ref}>
            <button className="ab-btn" onClick={() => verifyDD.setOpen(o => !o)}>🔍 核對 ▾</button>
            <div className={`dropdown-menu ${verifyDD.open ? "open" : ""}`}>
              <div className="dropdown-label">選擇核對項目</div>
              <button className="dropdown-item" onClick={() => { verifyDD.setOpen(false); setModal({ type: "verify-multi", item: "travel" }); }}>✈️ Travel</button>
              <button className="dropdown-item" onClick={() => { verifyDD.setOpen(false); setModal({ type: "verify-multi", item: "ot" }); }}>⏰ OT</button>
              <button className="dropdown-item" onClick={() => { verifyDD.setOpen(false); setModal({ type: "verify-multi", item: "ns" }); }}>🌙 NS</button>
              <button className="dropdown-item" onClick={() => { verifyDD.setOpen(false); setModal({ type: "verify-multi", item: "ess" }); }}>📅 ESS</button>
              <div className="dropdown-sep" />
              <button className="dropdown-item" onClick={() => { verifyDD.setOpen(false); setModal({ type: "verify-multi", item: "all" }); }}>🔍 全部核對</button>
            </div>
          </div>
        </div>
        <div className="ab-sep" />
        <button className={`ab-btn ab-sync${isDirty ? " dirty" : ""}`} onClick={syncAll} disabled={syncLoading}>
          {syncLoading ? <span className="spinner" /> : "☁"} 同步全部
          {isDirty && <span className="dirty-dot" />}
        </button>
        <button className="ab-btn ab-danger" style={{ marginLeft: "auto" }} onClick={() => setModal({ type: "clear" })}>🗑 清空</button>
      </div>

      {/* PERIOD + STATS ROW */}
      <div className="period-row">
        <span className="period-label">月份</span>
        <select className="year-sel" value={year} onChange={e => setYear(e.target.value)}>
          {["2024","2025","2026","2027"].map(y => <option key={y}>{y}</option>)}
        </select>
        <div className="period-months">
          <button className={`pm-btn${!df ? " on" : ""}`} onClick={() => setDf("")}>全部</button>
          {["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"].map(m => (
            <button key={m} className={`pm-btn${df === `${year}-${m}` ? " on" : ""}`}
              onClick={() => setDf(df === `${year}-${m}` ? "" : `${year}-${m}`)}>
              {m}
            </button>
          ))}
        </div>
        <div className="period-stats">
          <span className="pill">{okCount} 已繳</span>
          <span className="pill r">{missCount} 缺件</span>
        </div>
      </div>

      {/* 3-COLUMN BODY */}
      <div className="kanban-layout">

        {/* SIDEBAR — collapsible */}
        <div className={`sidebar${tst.__collapsed ? " collapsed" : ""}`}>
          <button className="sb-toggle" onClick={() => setTst(p => ({ ...p, __collapsed: !p.__collapsed }))}>
            {tst.__collapsed ? "▶" : <><span className="sb-toggle-label">篩選</span><span>◀</span></>}
          </button>
          {!tst.__collapsed && (
            <>
              <div className="search-wrap">
                <span className="si">🔍</span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋姓名…" />
              </div>
              <div className="tree">
                <div className={`tree-proj${!filt.proj ? " sel" : ""}`}
                  onClick={() => { setFilt({ proj: null, unit: null, pm: null }); setTst(p => ({ __collapsed: p.__collapsed })); }}>
                  📋 全部
                </div>
                {Object.keys(tree).map(proj => (
                  <React.Fragment key={proj}>
                    <div className={`tree-proj${filt.proj === proj && !filt.unit ? " sel" : ""}`} onClick={() => clickP(proj)}>
                      <span className={`chv${tst[proj] ? " open" : ""}`}>▶</span>📁 {proj}
                    </div>
                    {tst[proj] && Object.keys(tree[proj]).map(u => (
                      <React.Fragment key={u}>
                        <div className={`tree-unit${filt.proj === proj && filt.unit === u && !filt.pm ? " sel" : ""}`}
                          onClick={e => clickU(proj, u, e)}>
                          {[...tree[proj][u]].length > 0 && <span className={`chv${tst[`${proj}:${u}`] ? " open" : ""}`}>▶</span>}
                          🏢 {u}
                        </div>
                        {tst[`${proj}:${u}`] && [...tree[proj][u]].map(pm => (
                          <div key={pm} className={`tree-pm${filt.pm === pm ? " sel" : ""}`}
                            onClick={e => clickPM(proj, u, pm, e)}>👤 {pm}</div>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        {/* MAIN */}
        <div className="main-area">
          <div className="toolbar">
            <span className="toolbar-title">{filtTitle}（{list.length}人）</span>
            <div className="tb-chips">
              {COLS.map(g => (
                <span key={g.id} className={`chip${activeG.has(g.id) ? " on" : ""}`}
                  onClick={() => setActiveG(prev => { const s = new Set(prev); s.has(g.id) ? (s.size > 1 && s.delete(g.id)) : s.add(g.id); return s; })}>
                  {g.label}
                </span>
              ))}
            </div>
            <div className="tb-sort">
              {[["name", "姓名"], ["date-asc", "日期↑"], ["date-desc", "日期↓"]].map(([m, l]) => (
                <button key={m} className={`sort-btn${sortMode === m ? " on" : ""}`} onClick={() => setSortMode(m)}>{l}</button>
              ))}
            </div>
          </div>

          {/* TABLE — desktop */}
          <div className="table-wrap desk-only">
            <table>
              <thead><tr>
                <th className="nc">姓名</th>
                <th className="dc">上傳日期</th>
                {flat.map(s => <th key={s.id}>{s.label}</th>)}
              </tr></thead>
              <tbody>
                {grouped
                  ? buildGrouped(list, flat, selId, getStatus, cycleStatus, onSelectEmp, progress, setProgressDirty)
                  : list.map(e => empRow(e, flat, selId, getStatus, cycleStatus, onSelectEmp))}
                {list.length === 0 && <tr><td colSpan={flat.length + 2} style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 12 }}>查無符合條件的員工</td></tr>}
              </tbody>
            </table>
          </div>

          {/* CARD LIST — mobile */}
          <div className="card-list mob-only">
            {list.length === 0 && <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>查無符合條件的員工</div>}
            {list.map(e => (
              <div key={e.id} className={`emp-card${selId === e.id ? " sel" : ""}`} onClick={() => { onSelectEmp(e.id); setRpOpen(true); setCurRT("files"); }}>
                <div className="emp-avatar">{(e.cn || e.en || "?")[0]}</div>
                <div className="emp-card-info">
                  <div className="emp-card-name">{e.cn || e.en}</div>
                  <div className="emp-card-sub">{e.cn && e.en ? `${e.en} · ` : ""}{e.unit || e.proj}</div>
                  <div className="emp-card-badges">
                    {flat.map(s => {
                      const st = getStatus(e, s.id);
                      if (st === "na") return null;
                      return (
                        <span key={s.id} className={`bdg ${st}`} onClick={ev => cycleStatus(ev, e.id, s.id)}>
                          <span className={`dot ${st}`} />{s.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className={`right-panel${rpOpen ? " open" : ""}`}>
          <div className="sheet-handle" onClick={() => setRpOpen(false)} />
          <div className="rtabs">
            <div className={`rtab${curRT === "files" ? " on" : ""}`} onClick={() => setCurRT("files")}>📁 檔案</div>
            <div className={`rtab${curRT === "form" ? " on" : ""}`} onClick={() => setCurRT("form")}>✏️ 填寫</div>
          </div>
          <div className="rpanel">
            {!selEmp
              ? <div className="empty-state">👆<br />點選員工<br />查看資料</div>
              : curRT === "files"
                ? <FilesTab emp={selEmp} files={files} setFiles={setFiles} onOpen={openFile}
                    allEmps={kanban} period={fullPeriod} show={show}
                    onDlZip={() => run(() => downloadZip(selEmp.en), b => downloadBlob(b, `${selEmp.en}.zip`), e => show(e, "err"))}
                    onDlAll={() => run(() => downloadAllZip(), b => downloadBlob(b, "all.zip"), e => show(e, "err"))}
                    onDelete={f => run(() => deleteFile(selEmp.en, f.path || f.name, fullPeriod),
                      () => { setFiles(prev => prev.filter(x => x.path !== f.path)); show("已刪除", "ok"); },
                      e => show(`刪除失敗：${e}`, "err"))} />
                : <FormTab emp={selEmp} form={getForm(selEmp.id)} activeG={activeG}
                    isDirty={dirtyForms.has(selEmp.en)}
                    onSync={() => syncOneForm(selEmp.en)}
                    onToggleSec={id => toggleSec(selEmp.id, id)}
                    onAddRow={(k, d) => addRow(selEmp.id, k, d)}
                    onRmRow={(k, i) => rmRow(selEmp.id, k, i)}
                    onUpdRow={(k, i, f, v) => updRow(selEmp.id, k, i, f, v)}
                    onSetWD={v => setForm(selEmp.id, { ...getForm(selEmp.id), workdays: v })} />
            }
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="mob-bottom-nav">
        <button className={`mob-nav-btn${!rpOpen && mobilePage !== "more" ? " active" : ""}`}
          onClick={() => { setRpOpen(false); setMobilePage("kanban"); }}>
          <span>📋</span><span>看板</span>
        </button>
        <button className={`mob-nav-btn${rpOpen && curRT === "files" ? " active" : ""}`}
          onClick={() => { setCurRT("files"); setRpOpen(true); setMobilePage("kanban"); }}>
          <span>📁</span><span>檔案</span>
        </button>
        <button className={`mob-nav-btn${rpOpen && curRT === "form" ? " active" : ""}`}
          onClick={() => { setCurRT("form"); setRpOpen(true); setMobilePage("kanban"); }}>
          <span>✏️</span><span>填寫</span>
        </button>
        <button className={`mob-nav-btn${mobilePage === "more" ? " active" : ""}`}
          onClick={() => { setRpOpen(false); setMobilePage(mobilePage === "more" ? "kanban" : "more"); }}>
          <span>⋯</span><span>更多</span>
        </button>
      </div>

      {/* MOBILE MORE OVERLAY */}
      {mobilePage === "more" && (
        <div className="mob-more-overlay">
          <div className="mob-more-section-label">操作</div>
          <div className="mob-more-grid">
            {[
              { icon: "📂", label: "導入", action: () => { setMobilePage("kanban"); setModal({ type: "import" }); } },
              { icon: "🔄", label: "掃描", action: () => { setMobilePage("kanban"); handleScan(); } },
              { icon: "⬇", label: "下載", action: () => { setMobilePage("kanban"); setModal({ type: "download" }); } },
              { icon: "📝", label: "寫入", action: () => { setMobilePage("kanban"); setModal({ type: "write" }); } },
              { icon: "🔍", label: "核對", action: () => { setMobilePage("kanban"); setModal({ type: "verify-multi", item: "all" }); } },
              { icon: "☁", label: isDirty ? "同步 ●" : "已同步", action: syncAll },
              { icon: "🗑", label: "清空", action: () => { setMobilePage("kanban"); setModal({ type: "clear" }); }, danger: true },
            ].map(({ icon, label, action, danger }) => (
              <button key={label} className={`mob-more-btn${danger ? " danger" : ""}`} onClick={action}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="mob-more-section-label" style={{ marginTop: 16 }}>月份切換</div>
          <div className="mob-more-period">
            <select className="year-sel" value={year} onChange={e => setYear(e.target.value)}>
              {["2024","2025","2026","2027"].map(y => <option key={y}>{y}</option>)}
            </select>
            <div className="period-months" style={{ marginTop: 6 }}>
              <button className={`pm-btn${!df ? " on" : ""}`} onClick={() => setDf("")}>全部</button>
              {["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"].map(m => (
                <button key={m} className={`pm-btn${df === `${year}-${m}` ? " on" : ""}`}
                  onClick={() => setDf(df === `${year}-${m}` ? "" : `${year}-${m}`)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {modal?.type === "clear" && <ClearModal onClose={() => setModal(null)} show={show} onDone={() => { setKanban([]); setModal(null); }} />}
      {modal?.type === "import" && <ImportModal onClose={() => setModal(null)} show={show} onScanDone={res => { setKanban(res.kanban || []); setModal(null); }} />}
      {modal?.type === "write" && <WriteModal forms={Object.fromEntries(kanban.map(e => [e.en, forms[e.id] || mkForm()]))} onClose={() => setModal(null)} show={show} />}
      {modal?.type === "download" && <DownloadModal allEmps={kanban} onClose={() => setModal(null)} show={show} />}
      {modal?.type === "verify-multi" && (
        <VerifyMultiModal allEmps={kanban} forms={forms} mkForm={mkForm} defaultItem={modal.item} onClose={() => setModal(null)} show={show} />
      )}
      {modal?.type === "pdf" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-hd-t">{modal.name}</span>
              <button className="btn sm" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body"><iframe src={modal.url} title={modal.name} /></div>
          </div>
        </div>
      )}
      {modal?.type === "eml" && modal.data && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-hd-t">{modal.name}</span>
              <button className="btn sm" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body">
              {[["From", modal.data.from], ["To", modal.data.to], ["Subject", modal.data.subject], ["Date", modal.data.date]].map(([l, v]) => (
                <div key={l} style={{ marginBottom: 4, fontSize: 12 }}><strong style={{ color: "var(--b800)" }}>{l}:</strong> {v}</div>
              ))}
              <div style={{ marginTop: 10, whiteSpace: "pre-wrap", borderTop: "1px solid var(--bd)", paddingTop: 10, fontSize: 12, maxHeight: 200, overflow: "auto" }}>{modal.data.body}</div>
              {modal.data.attachments?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--b800)", marginBottom: 4 }}>附件：</div>
                  {modal.data.attachments.map(a => (
                    <a key={a.filename} href={attachmentUrl(selEmp?.en || "", modal.name, a.filename)}
                      download={a.filename} style={{ display: "block", fontSize: 11, color: "var(--b600)", marginBottom: 2 }}>
                      📎 {a.filename} ({(a.size / 1024).toFixed(1)} KB)
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

// ── Progress summary (for collapsed bar) ─────────────────────────────────────
// Returns { done, total, current } for a branch (or whole def) given pstate.
function summarizeBranch(branch, pstate) {
  let done = 0, total = 0, current = "";
  branch.steps.forEach(step => {
    if (step.parallel) {
      step.parallel.forEach(sub => {
        total++;
        if (pstate[`${branch.id}_${sub.id}`]?.checked) done++;
        else if (!current) current = sub.label;
      });
    } else if (step.pmApprovals) {
      step.pmApprovals.forEach(pm => {
        total++;
        if (pstate[`pm_${pm}`]?.checked) done++;
        else if (!current) current = `${step.label}`;
      });
    } else {
      total++;
      if (pstate[`${branch.id}_${step.id}`]?.checked) done++;
      else if (!current) current = step.label;
    }
  });
  if (!current) current = "全部完成 ✓";
  return { done, total, current };
}

// ── Progress Bar Component ───────────────────────────────────────────────────
function ProgressBar({ unitKey, proj, unit, progress, setProgress }) {
  const [expanded, setExpanded] = useState(false);
  const pkey = getProgressKey(proj, unit);
  if (!pkey) return null;
  const def = PROGRESS_DEFS[pkey];
  if (!def) return null;

  const pstate = progress[unitKey] || {};
  const setPState = (newState) => setProgress(p => ({ ...p, [unitKey]: newState }));

  const toggleStep = (branchId, stepId) => {
    const key = `${branchId}_${stepId}`;
    setPState({ ...pstate, [key]: { ...pstate[key], checked: !pstate[key]?.checked } });
  };
  const togglePM = (pmName) => {
    const key = `pm_${pmName}`;
    setPState({ ...pstate, [key]: { ...pstate[key], checked: !pstate[key]?.checked } });
  };
  const setNote = (branchId, stepId, note) => {
    const key = `${branchId}_${stepId}`;
    setPState({ ...pstate, [key]: { ...pstate[key], note } });
  };
  const setUpload = (branchId, stepId, filename) => {
    const key = `${branchId}_${stepId}`;
    setPState({ ...pstate, [key]: { ...pstate[key], filename } });
  };

  const isChecked = (branchId, stepId) => pstate[`${branchId}_${stepId}`]?.checked;
  const getNote = (branchId, stepId) => pstate[`${branchId}_${stepId}`]?.note || "";
  const getFile = (branchId, stepId) => pstate[`${branchId}_${stepId}`]?.filename || "";
  const isPMChecked = (pmName) => pstate[`pm_${pmName}`]?.checked;

  // Compact summary across all branches
  const summaries = def.branches.map(b => ({ branch: b, ...summarizeBranch(b, pstate) }));
  const totalDone = summaries.reduce((a, s) => a + s.done, 0);
  const totalAll = summaries.reduce((a, s) => a + s.total, 0);
  const allComplete = totalAll > 0 && totalDone === totalAll;

  return (
    <div style={{
      background: "linear-gradient(135deg,#EEF6FF 0%,#F5FBFF 100%)",
      border: "1px solid var(--bd)", borderRadius: 10,
      padding: expanded ? "10px 14px" : "7px 12px", marginBottom: 8
    }}>
      {/* ── Compact summary header (always visible, clickable) ── */}
      <div onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 11, color: "var(--b600)", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", width: 12 }}>▶</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--b600)" }}>📊 {def.label} 進度</span>
        {/* per-branch mini chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {summaries.map(s => {
            const branchDone = s.done === s.total && s.total > 0;
            return (
              <span key={s.branch.id} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 20,
                background: branchDone ? "var(--ok-bg)" : "rgba(255,255,255,.7)",
                border: `1px solid ${branchDone ? "#90CF60" : "var(--bd)"}`,
                color: branchDone ? "var(--ok-tx)" : "#5A7A9A", whiteSpace: "nowrap"
              }}>
                {s.branch.label ? `${s.branch.label}: ` : ""}
                {branchDone ? "完成 ✓" : s.current}
                <span style={{ marginLeft: 5, opacity: .7 }}>{s.done}/{s.total}</span>
              </span>
            );
          })}
        </div>
        {allComplete && <span style={{ fontSize: 11, color: "var(--ok-tx)", fontWeight: 600 }}>✓</span>}
      </div>

      {/* ── Full checklist (only when expanded) ── */}
      {expanded && <FullProgress
        def={def} pstate={pstate} setPState={setPState}
        toggleStep={toggleStep} togglePM={togglePM} setNote={setNote} setUpload={setUpload}
        isChecked={isChecked} getNote={getNote} getFile={getFile} isPMChecked={isPMChecked}
        unitKey={unitKey} />}
    </div>
  );
}

function FullProgress({ def, pstate, setPState, toggleStep, togglePM, setNote, setUpload, isChecked, getNote, getFile, isPMChecked, unitKey }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 400, color: "#8AB2D8", marginBottom: 8 }}>（{fullPeriodLabel(unitKey)}）</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        {def.branches.map(branch => (
          <div key={branch.id} style={{
            flex: 1, minWidth: 180,
            background: "rgba(255,255,255,.7)", border: "1px solid var(--bd2)",
            borderRadius: 8, padding: "8px 10px"
          }}>
            {branch.label && (
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--b800)", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--bd)" }}>
                {branch.label}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {branch.steps.map((step) => {
                if (step.parallel) {
                  // All parallel sub-steps
                  const allDone = step.parallel.every(s => isChecked(branch.id, s.id));
                  return (
                    <div key={step.id} style={{ marginLeft: 4 }}>
                      <div style={{ fontSize: 10, color: "#8AB2D8", marginBottom: 4 }}>{step.label}：</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8, borderLeft: "2px solid var(--bd)" }}>
                        {step.parallel.map(sub => (
                          <ProgressStep key={sub.id} label={sub.label}
                            checked={isChecked(branch.id, sub.id)}
                            onToggle={() => toggleStep(branch.id, sub.id)}
                            note={getNote(branch.id, sub.id)}
                            onNote={v => setNote(branch.id, sub.id, v)} />
                        ))}
                      </div>
                      {allDone && <div style={{ fontSize: 10, color: "var(--ok-tx)", marginTop: 4, paddingLeft: 8 }}>✓ 核對全部完成</div>}
                    </div>
                  );
                }
                if (step.pmApprovals) {
                  return (
                    <div key={step.id} style={{ marginLeft: 4 }}>
                      <div style={{ fontSize: 10, color: "#8AB2D8", marginBottom: 4 }}>11名PM Approve：</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 8, borderLeft: "2px solid var(--bd)" }}>
                        {step.pmApprovals.map(pm => (
                          <PMApproveStep key={pm} pm={pm}
                            checked={isPMChecked(pm)}
                            onToggle={() => togglePM(pm)}
                            filename={pstate[`pm_${pm}`]?.filename || ""}
                            onUpload={fn => setPState({ ...pstate, [`pm_${pm}`]: { ...pstate[`pm_${pm}`], checked: true, filename: fn } })} />
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <ProgressStep key={step.id} label={step.label}
                    checked={isChecked(branch.id, step.id)}
                    onToggle={() => toggleStep(branch.id, step.id)}
                    hasNote={step.note}
                    note={getNote(branch.id, step.id)}
                    onNote={v => setNote(branch.id, step.id, v)}
                    hasUpload={step.upload}
                    filename={getFile(branch.id, step.id)}
                    onUpload={fn => setUpload(branch.id, step.id, fn)} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fullPeriodLabel(unitKey) { return unitKey || ""; }

function ProgressStep({ label, checked, onToggle, hasNote, note, onNote, hasUpload, filename, onUpload }) {
  const [showNote, setShowNote] = useState(false);
  const fref = useRef(null);
  return (
    <div style={{ background: checked ? "var(--ok-bg)" : "rgba(255,255,255,.5)", border: `1px solid ${checked ? "#90CF60" : "var(--bd)"}`, borderRadius: 6, padding: "5px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: "var(--b600)", cursor: "pointer", flexShrink: 0 }} />
        <span style={{ fontSize: 11, flex: 1, color: checked ? "var(--ok-tx)" : "#333", fontWeight: checked ? 500 : 400, textDecoration: checked ? "line-through" : "none", textDecorationColor: "#90CF60" }}>{label}</span>
        {hasNote && <button onClick={() => setShowNote(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: note ? "var(--b600)" : "#8AB2D8" }}>📝</button>}
        {hasUpload && (
          <>
            <label style={{ cursor: "pointer", fontSize: 10, color: filename ? "var(--ok-tx)" : "#8AB2D8" }} title={filename || "上傳檔案"}>
              📎
              <input type="file" style={{ display: "none" }} ref={fref} onChange={e => e.target.files[0] && onUpload(e.target.files[0].name)} />
            </label>
            {filename && <span style={{ fontSize: 9, color: "var(--ok-tx)", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</span>}
          </>
        )}
      </div>
      {(showNote || note) && hasNote && (
        <input style={{ marginTop: 4, width: "100%", fontSize: 10, padding: "2px 5px", border: "1px solid var(--bd2)", borderRadius: 4, background: "var(--card)", outline: "none" }}
          placeholder="備注…" value={note} onChange={e => onNote(e.target.value)} onClick={e => e.stopPropagation()} />
      )}
    </div>
  );
}

function PMApproveStep({ pm, checked, onToggle, filename, onUpload }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 5px", background: checked ? "var(--ok-bg)" : "transparent", borderRadius: 5 }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: "var(--b600)", cursor: "pointer", flexShrink: 0 }} />
      <span style={{ fontSize: 11, flex: 1, color: checked ? "var(--ok-tx)" : "#333" }}>{pm}</span>
      <label style={{ cursor: "pointer", fontSize: 10, color: filename ? "var(--ok-tx)" : "#8AB2D8" }} title={filename || "上傳Approval Mail"}>
        {filename ? "✅" : "📎"}
        <input type="file" style={{ display: "none" }} onChange={e => e.target.files[0] && onUpload(e.target.files[0].name)} />
      </label>
    </div>
  );
}

// ── buildGrouped with progress bars ─────────────────────────────────────────
function buildGrouped(list, flat, selId, getStatus, cycleStatus, onSelect, progress, setProgress) {
  const grps = {};
  list.forEach(e => {
    const k = `${e.proj}||${e.unit || "—"}||${e.pm || ""}`;
    if (!grps[k]) grps[k] = { proj: e.proj, unit: e.unit || "—", pm: e.pm || "", emps: [] };
    grps[k].emps.push(e);
  });
  // Sort so that same proj/unit/pm stay contiguous — otherwise headers and
  // progress bars get re-emitted every time a unit reappears.
  const ordered = Object.values(grps).sort((a, b) =>
    (a.proj || "").localeCompare(b.proj || "") ||
    (a.unit || "").localeCompare(b.unit || "") ||
    (a.pm || "").localeCompare(b.pm || "")
  );
  const seenProj = new Set();
  const seenUnit = new Set();
  const rows = [];
  ordered.forEach(g => {
    if (!seenProj.has(g.proj)) {
      rows.push(<tr key={`gp-${g.proj}`} className="gp"><td colSpan={flat.length + 2}>📁 {g.proj}</td></tr>);
      seenProj.add(g.proj);
    }
    const unitId = `${g.proj}||${g.unit}`;
    if (!seenUnit.has(unitId)) {
      seenUnit.add(unitId);
      // Unit row
      rows.push(<tr key={`gu-${g.proj}-${g.unit}`} className="gu"><td colSpan={flat.length + 2}>└ {g.unit}</td></tr>);
      // Progress bar row
      const unitKey = `${g.proj}||${g.unit}`;
      const pkey = getProgressKey(g.proj, g.unit);
      if (pkey) {
        rows.push(
          <tr key={`prog-${unitKey}`} className="prog-row">
            <td colSpan={flat.length + 2} style={{ padding: "8px 12px", background: "var(--b50)" }}>
              <ProgressBar unitKey={unitKey} proj={g.proj} unit={g.unit} progress={progress} setProgress={setProgress} />
            </td>
          </tr>
        );
      }
    }
    if (g.pm) rows.push(<tr key={`gpm-${g.pm}-${g.proj}`} className="gpm"><td colSpan={flat.length + 2}>· PM: {g.pm}</td></tr>);
    g.emps.forEach(e => rows.push(empRow(e, flat, selId, getStatus, cycleStatus, onSelect)));
  });
  return rows;
}

function empRow(e, flat, selId, getStatus, cycleStatus, onSelect) {
  return (
    <tr key={e.id} className={`er ${selId === e.id ? "sel" : ""}`} onClick={() => onSelect(e.id)}>
      <td className="nc"><div className="ecn">{e.cn || e.en}</div>{e.cn && e.en && <div className="een">{e.en}</div>}</td>
      <td style={{ fontSize: 11, color: "#888", textAlign: "center" }}>{e.uploadDate}</td>
      {flat.map(s => {
        const st = getStatus(e, s.id); return (
          <td key={s.id}><span className={`bdg ${st}`} onClick={ev => cycleStatus(ev, e.id, s.id)}>
            <span className={`dot ${st}`} />{st === "ok" ? "已繳交" : st === "miss" ? "缺件" : "—"}
          </span></td>
        );
      })}
    </tr>
  );
}

// ── Multi-employee Verify Modal ──────────────────────────────────────────────
function VerifyMultiModal({ allEmps, forms, mkForm, defaultItem, onClose, show }) {
  const [unitFilter, setUnitFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [travelFile, setTravelFile] = useState(null);
  const [otFile, setOtFile] = useState(null);
  const [essFile, setEssFile] = useState(null);
  const [results, setResults] = useState(null);
  const [step, setStep] = useState("select"); // select | upload | result

  const filteredEmps = allEmps.filter(e => {
    const u = (e.unit || "").toLowerCase(); const n = (e.cn + e.en).toLowerCase();
    return (!unitFilter || u.includes(unitFilter.toLowerCase())) &&
           (!nameFilter || n.includes(nameFilter.toLowerCase()));
  });

  const toggleAll = () => {
    if (selectedIds.size === filteredEmps.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredEmps.map(e => e.id)));
  };
  const toggleEmp = (id) => {
    const s = new Set(selectedIds); s.has(id) ? s.delete(id) : s.add(id); setSelectedIds(s);
  };

  const [verifying, setVerifying] = useState(false);

  const doVerify = async () => {
    const empsToVerify = allEmps.filter(e => selectedIds.has(e.id));
    if (!empsToVerify.length) { show("請選擇至少一名員工", "err"); return; }
    if (!travelFile && !otFile && !essFile) { show("請至少上傳一個核對檔案", "err"); return; }

    setVerifying(true);
    show("核對中…（於本機解析，不上傳）", "info");

    const buildTab = (emp) => {
      const f = forms[emp.id] || mkForm();
      const arr = a => (Array.isArray(a) ? a : []);
      return { ess: arr(f.ess), ns: arr(f.ns), ot: arr(f.ot), ta: arr(f.ta) };
    };

    try {
      // Parse each uploaded workbook ONCE, then reuse across all employees.
      const workbooks = {};
      if (travelFile) workbooks.travel = await readWorkbook(travelFile);
      if (otFile)     workbooks.ot     = await readWorkbook(otFile);
      if (essFile)    workbooks.ess    = await readWorkbook(essFile);

      const collected = {};
      let anomalyCount = 0;
      for (const emp of empsToVerify) {
        try {
          const r = verifyEmployee(workbooks, emp.en, emp.cn || "", buildTab(emp));
          collected[emp.en] = r;
          if (Object.values(r).some(c => c.status === "anomaly")) anomalyCount++;
        } catch (e) {
          collected[emp.en] = { error: e.message || "解析失敗" };
        }
        // yield to keep UI responsive on large lists
        await new Promise(res => setTimeout(res, 0));
      }

      setResults(collected);
      setStep("result");
      show(anomalyCount
        ? `核對完成：${empsToVerify.length} 人，${anomalyCount} 人有異常`
        : `✅ 核對完成：${empsToVerify.length} 人全部正常`,
        anomalyCount ? "info" : "ok");
    } catch (e) {
      show(`核對失敗：${e.message || "檔案無法解析"}`, "err");
    } finally {
      setVerifying(false);
    }
  };

  const selectedEmps = allEmps.filter(e => selectedIds.has(e.id));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-hd">
          <span className="modal-hd-t">🔍 批量核對 — {defaultItem === "all" ? "全部項目" : defaultItem.toUpperCase()}</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {step === "select" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#8AB2D8" }}>🏢</span>
                  <input placeholder="搜尋單位…" value={unitFilter} onChange={e => setUnitFilter(e.target.value)}
                    style={{ width: "100%", paddingLeft: 26, fontSize: 12, padding: "5px 8px 5px 26px", border: "1px solid var(--bd2)", borderRadius: 6, outline: "none" }} />
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#8AB2D8" }}>👤</span>
                  <input placeholder="搜尋姓名…" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
                    style={{ width: "100%", paddingLeft: 26, fontSize: 12, padding: "5px 8px 5px 26px", border: "1px solid var(--bd2)", borderRadius: 6, outline: "none" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "4px 8px", background: "var(--b50)", borderRadius: 6 }}>
                <input type="checkbox" checked={selectedIds.size === filteredEmps.length && filteredEmps.length > 0}
                  onChange={toggleAll} style={{ accentColor: "var(--b600)", cursor: "pointer" }} />
                <span style={{ fontSize: 11, color: "var(--b800)" }}>全選（{filteredEmps.length} 人）</span>
                {selectedIds.size > 0 && <span style={{ fontSize: 11, color: "var(--b600)", marginLeft: "auto" }}>已選 {selectedIds.size} 人</span>}
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--bd)", borderRadius: 7 }}>
                {filteredEmps.map(e => (
                  <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid var(--bd)", background: selectedIds.has(e.id) ? "var(--b50)" : "transparent" }}>
                    <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleEmp(e.id)} style={{ accentColor: "var(--b600)" }} />
                    <span style={{ fontSize: 12, flex: 1 }}>{e.cn || e.en}</span>
                    {e.cn && e.en && <span style={{ fontSize: 10, color: "#888" }}>{e.en}</span>}
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--b100)", color: "var(--b800)" }}>{e.unit || e.proj}</span>
                  </label>
                ))}
                {filteredEmps.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#888", fontSize: 12 }}>查無結果</div>}
              </div>
            </>
          )}
          {step === "upload" && (
            <>
              <div style={{ marginBottom: 10, fontSize: 12, color: "var(--b800)" }}>已選 {selectedEmps.length} 名員工，請上傳核對檔案：</div>
              <FileUploadRow label="Travel DataSheet" hint="SNDA_CNS_Taiwan_Travel_DataSheet" file={travelFile} onChange={setTravelFile} id="mv-travel" />
              <FileUploadRow label="OT / NS Form" hint="SNDA_CNS_Taiwan_OT_OR_Shift_Request_Form" file={otFile} onChange={setOtFile} id="mv-ot" note="OT 和 NS 核對使用同一個檔案" />
              <FileUploadRow label="ESS ROTA 費用統計" hint="Wipro_ESS_ROTA_2026_費用統計" file={essFile} onChange={setEssFile} id="mv-ess" />
            </>
          )}
          {step === "result" && results && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--b800)" }}>核對結果（{Object.keys(results).length} 人）</span>
                <button className="btn sm" onClick={() => { setResults(null); setStep("select"); }}>重新選擇</button>
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {Object.entries(results).map(([empEn, r]) => {
                  const emp = allEmps.find(e => e.en === empEn);
                  const LABELS = { travel: "差旅", ot: "OT", ns: "NS", ess: "ESS" };
                  // r is either { error } or { travel?, ot?, ns?, ess? }
                  const cats = r.error ? [] : Object.keys(LABELS).filter(k => r[k]);
                  const anyAnomaly = cats.some(k => r[k].status === "anomaly");
                  return (
                    <div key={empEn} style={{ padding: "8px 10px", borderBottom: "1px solid var(--bd)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cats.length ? 4 : 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{emp?.cn || empEn}</span>
                        {r.error
                          ? <span style={{ fontSize: 11, color: "var(--miss-tx)" }}>⚠️ {r.error}</span>
                          : anyAnomaly
                            ? <span style={{ fontSize: 11, color: "var(--miss-tx)" }}>❌ 有異常</span>
                            : <span style={{ fontSize: 11, color: "var(--ok-tx)" }}>✅ 全部正常</span>}
                      </div>
                      {cats.map(k => {
                        const c = r[k];
                        const st = c.status;
                        const color = st === "ok" ? "var(--ok-tx)" : st === "not_found" ? "#8A5A00" : "var(--miss-tx)";
                        const tag = st === "ok" ? `✅ 正常（${c.matched_rows || 0} 筆）`
                                  : st === "not_found" ? "➖ 查無紀錄"
                                  : `❌ 異常（${c.anomalies?.length || 0}）`;
                        return (
                          <div key={k} style={{ fontSize: 11, paddingLeft: 8, marginTop: 2 }}>
                            <span style={{ color: "#666" }}>{LABELS[k]}：</span>
                            <span style={{ color }}>{tag}</span>
                            {st === "anomaly" && (c.anomalies || []).map((a, ai) => (
                              <div key={ai} style={{ paddingLeft: 16, color: "var(--miss-tx)", fontSize: 10.5, marginTop: 1 }}>
                                · 應為 {a.expected}，實際 {a.found}{a.note ? `（${a.note}）` : ""}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          {step === "select" && <>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn blue" onClick={() => setStep("upload")} disabled={selectedIds.size === 0}>
              下一步：上傳核對檔案 →
            </button>
          </>}
          {step === "upload" && <>
            <button className="btn" onClick={() => setStep("select")}>← 返回</button>
            <button className="btn blue" onClick={doVerify} disabled={verifying}>
              {verifying ? <span className="spinner" /> : "🔍"} 開始核對 {selectedIds.size} 人
            </button>
          </>}
          {step === "result" && <button className="btn blue" onClick={onClose}>關閉</button>}
        </div>
      </div>
    </div>
  );
}

function FileUploadRow({ label, hint, file, onChange, id, note }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--b800)", marginBottom: 3 }}>{label}</div>
      {note && <div style={{ fontSize: 10, color: "#8AB2D8", marginBottom: 3 }}>{note}</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px dashed var(--bd2)", borderRadius: 7, cursor: "pointer", background: file ? "var(--ok-bg)" : "var(--b50)", fontSize: 12 }}>
        <span>{file ? "✅" : "📂"}</span>
        <span style={{ flex: 1, color: file ? "var(--ok-tx)" : "#888" }}>{file ? file.name : `選擇 ${hint}…`}</span>
        <input id={id} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => onChange(e.target.files[0])} />
      </label>
    </div>
  );
}

// ── FilesTab ─────────────────────────────────────────────────────────────────
function FilesTab({ emp, files, setFiles, onOpen, onDlZip, onDlAll, onDelete, allEmps, period, show }) {
  const [confirmDel, setConfirmDel] = useState(null);
  const [moveFile_, setMoveFile_] = useState(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveCopy, setMoveCopy] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const { run } = useApi();

  const doMove = () => {
    if (!moveTarget) return;
    run(
      () => moveFile(emp.en, moveFile_.path || moveFile_.name, moveTarget, period, moveCopy),
      () => { if (!moveCopy) setFiles(prev => prev.filter(f => f.path !== moveFile_.path)); show(`${moveCopy ? "複製" : "移動"}成功`, "ok"); setMoveFile_(null); },
      e => show(`操作失敗：${e}`, "err")
    );
  };
  const doUpload = (e) => {
    const fs = [...e.target.files]; if (!fs.length) return;
    setUploading(true);
    run(
      () => uploadToEmployee(emp.en, period, fs),
      res => { setFiles(prev => [...prev, ...res.saved]); show(`已上傳 ${res.count} 個檔案`, "ok"); setUploading(false); },
      err => { show(`上傳失敗：${err}`, "err"); setUploading(false); }
    );
  };
  const empSearch = moveSearch.toLowerCase();
  const filteredEmps = allEmps.filter(e => e.id !== emp.id && (!empSearch || (e.cn + e.en).toLowerCase().includes(empSearch) || (e.unit || "").toLowerCase().includes(empSearch)));

  if (moveFile_) return (
    <>
      <div className="rhd" style={{ cursor: "pointer" }} onClick={() => setMoveFile_(null)}>← 返回</div>
      <div style={{ fontSize: 12, marginBottom: 8, color: "var(--b800)" }}>{moveCopy ? "複製" : "移動"}檔案：<br /><span style={{ fontSize: 11, color: "#888", wordBreak: "break-all" }}>{moveFile_.name}</span></div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button className={`btn sm ${!moveCopy ? "blue" : ""}`} onClick={() => setMoveCopy(false)}>移動</button>
        <button className={`btn sm ${moveCopy ? "blue" : ""}`} onClick={() => setMoveCopy(true)}>複製</button>
      </div>
      <input type="text" placeholder="🔍 搜尋姓名/單位…" value={moveSearch} onChange={e => setMoveSearch(e.target.value)}
        style={{ width: "100%", fontSize: 11, padding: "4px 7px", border: "1px solid var(--bd2)", borderRadius: "5px 5px 0 0", outline: "none" }} />
      <select className="di" style={{ width: "100%", fontSize: 11, borderRadius: "0 0 5px 5px", borderTop: "none", height: 100, marginBottom: 8 }}
        size={5} value={moveTarget} onChange={e => setMoveTarget(e.target.value)}>
        <option value="">— 選擇員工 —</option>
        {filteredEmps.map(e => <option key={e.id} value={e.en}>{e.cn ? `${e.cn} ${e.en}` : e.en} [{e.unit || e.proj}]</option>)}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => setMoveFile_(null)}>取消</button>
        <button className="btn sm blue" style={{ flex: 1 }} onClick={doMove} disabled={!moveTarget}>確認{moveCopy ? "複製" : "移動"}</button>
      </div>
    </>
  );

  return (
    <>
      <div className="rhd">{emp.cn || emp.en}
        {emp.cn && emp.en && <span style={{ fontSize: 11, fontWeight: 400, color: "#888", marginLeft: 5 }}>{emp.en}</span>}
        <label className="btn sm" style={{ marginLeft: "auto", cursor: "pointer", fontSize: 10, padding: "2px 7px" }}>
          {uploading ? <span className="spinner" /> : "⬆"} 上傳
          <input type="file" multiple style={{ display: "none" }} onChange={doUpload} />
        </label>
      </div>
      {files.length === 0 ? <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>暫無歸檔檔案</div>
        : files.map(f => (
          <div key={f.path || f.name} style={{ padding: "4px 5px", borderRadius: 6, background: confirmDel === f.path ? "var(--miss-bg)" : "transparent" }}>
            {confirmDel === f.path ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ flex: 1, fontSize: 11, color: "var(--miss-tx)" }}>確定刪除？</span>
                <button className="btn sm" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setConfirmDel(null)}>取消</button>
                <button className="btn sm danger" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => { onDelete(f); setConfirmDel(null); }}>刪除</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <span className={`ftype ${f.type || "other"}`} style={{ flexShrink: 0, marginTop: 2 }}>{(f.type || "other").toUpperCase()}</span>
                <span style={{ flex: 1, fontSize: 11, cursor: "pointer", wordBreak: "break-all", lineHeight: 1.4 }} onClick={() => onOpen(f)}>{f.name}</span>
                <span style={{ cursor: "pointer", fontSize: 12, color: "#8AB2D8", flexShrink: 0 }} onClick={() => onOpen(f)} title="預覽">👁</span>
                <span style={{ cursor: "pointer", fontSize: 12, color: "#B0B0B0", flexShrink: 0 }} onClick={() => setMoveFile_(f)} title="移動/複製">📋</span>
                <span style={{ cursor: "pointer", fontSize: 12, color: "#C0BEB8", flexShrink: 0 }} onClick={() => setConfirmDel(f.path || f.name)} title="刪除">🗑</span>
              </div>
            )}
          </div>
        ))}
      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={onDlZip}>⬇ zip</button>
        <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={onDlAll}>📦 全部</button>
      </div>
    </>
  );
}

// ── FormTab ──────────────────────────────────────────────────────────────────
function FormTab({ emp, form, activeG, onToggleSec, onAddRow, onRmRow, onUpdRow, onSetWD, isDirty, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const checked = form.checkedSecs || new Set(["tr"]);
  const essTotal = form.ess.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
  const nsTotal = (form.ns || []).reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
  const taTotal = form.ta.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
  const warns = [];
  if (activeG.has("ess") && checked.has("ess") && !form.ess.length) warns.push("ESS 已勾選但未填寫");
  if (activeG.has("ns") && checked.has("ns") && !(form.ns || []).length) warns.push("NS 已勾選但未填寫");
  if (activeG.has("ot") && checked.has("ot") && !form.ot.length) warns.push("OT 已勾選但未填寫");
  if (activeG.has("travel") && checked.has("travel") && !form.ta.length) warns.push("差旅已勾選但未填寫");
  if (activeG.has("leave") && checked.has("leave") && !form.leave.length) warns.push("請假已勾選但未填寫");

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(); } finally { setSyncing(false); }
  };

  return (
    <>
      <div className="rhd">{emp.cn || emp.en}
        <button onClick={handleSync} disabled={syncing} style={{
          marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer", border: "1px solid",
          borderColor: isDirty ? "var(--b400)" : "var(--bd)", background: isDirty ? "var(--b600)" : "var(--b50)",
          color: isDirty ? "#fff" : "#aaa", display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
        }}>
          {syncing ? <span className="spinner" style={{ width: 10, height: 10 }} /> : "☁"}
          {isDirty ? " 同步" : " 已同步"}
          {isDirty && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#90EE90", flexShrink: 0 }} />}
        </button>
      </div>
      {warns.length > 0 && <div className="warn-box">⚠️ <strong>勾選但未填寫：</strong><br />{warns.map(w => <div key={w}>· {w}</div>)}</div>}
      <div className="wd-row">
        <label>📅 Work Days</label>
        <input type="number" min="0" max="31" step="0.5" value={form.workdays} onChange={e => onSetWD(e.target.value)} />
        <span style={{ fontSize: 11, color: "#8AB2D8" }}>天</span>
      </div>
      <SecBlock id="ess" title="ESS" checked={checked.has("ess")} onToggle={() => onToggleSec("ess")} onAdd={() => onAddRow("ess")} badge={checked.has("ess") ? (form.ess.length > 0 ? `ESS ${Math.round(essTotal).toLocaleString()}` : "待填") : null}>
        {form.ess.map((r, i) => (
          <div key={i} className="entry"><button className="rm-btn" onClick={() => onRmRow("ess", i)}>×</button>
            <div className="fl">
              <div className="fg"><label>開始日期</label><input type="date" value={r.from_date || ""} onChange={e => onUpdRow("ess", i, "from_date", e.target.value)} /></div>
              <div className="fg"><label>結束日期</label><input type="date" value={r.to_date || ""} onChange={e => onUpdRow("ess", i, "to_date", e.target.value)} /></div>
            </div>
            <div className="fl">
              <div className="fg"><label>ESS金額</label><input type="number" value={r.amount || ""} onChange={e => onUpdRow("ess", i, "amount", e.target.value)} /></div>
            </div>
          </div>
        ))}
        {form.ess.length > 0 && <div className="subtotal">ESS NT${Math.round(essTotal).toLocaleString()}</div>}
      </SecBlock>
      <SecBlock id="ns" title="NS 夜班" checked={checked.has("ns")} onToggle={() => onToggleSec("ns")} onAdd={() => onAddRow("ns")} badge={checked.has("ns") ? (form.ns.length > 0 ? `NS ${Math.round(nsTotal).toLocaleString()}` : "待填") : null}>
        {form.ns.map((r, i) => (
          <div key={i} className="entry"><button className="rm-btn" onClick={() => onRmRow("ns", i)}>×</button>
            <div className="fl">
              <div className="fg"><label>日期</label><input type="date" value={r.date || ""} onChange={e => onUpdRow("ns", i, "date", e.target.value)} /></div>
              <div className="fg"><label>開始</label><input type="time" value={r.tstart || ""} onChange={e => onUpdRow("ns", i, "tstart", e.target.value)} /></div>
              <div className="fg"><label>結束</label><input type="time" value={r.tend || ""} onChange={e => onUpdRow("ns", i, "tend", e.target.value)} /></div>
            </div>
            <div className="fl">
              <div className="fg"><label>時數</label><input readOnly value={r.hours || ""} placeholder="自動" /></div>
              <div className="fg"><label>NS金額</label><input type="number" value={r.amount || ""} onChange={e => onUpdRow("ns", i, "amount", e.target.value)} /></div>
            </div>
          </div>
        ))}
        {form.ns.length > 0 && <div className="subtotal">NS NT${Math.round(nsTotal).toLocaleString()}</div>}
      </SecBlock>
      <SecBlock id="ot" title="OT 加班" checked={checked.has("ot")} onToggle={() => onToggleSec("ot")} onAdd={() => onAddRow("ot")} badge={checked.has("ot") ? (form.ot.length > 0 ? `${form.ot.length}筆` : "待填") : null}>
        {form.ot.map((r, i) => (
          <div key={i} className="entry"><button className="rm-btn" onClick={() => onRmRow("ot", i)}>×</button>
            <div className="fl">
              <div className="fg"><label>日期</label><input type="date" value={r.date || ""} onChange={e => onUpdRow("ot", i, "date", e.target.value)} /></div>
              <div className="fg"><label>開始</label><input type="time" value={r.tstart || ""} onChange={e => onUpdRow("ot", i, "tstart", e.target.value)} /></div>
              <div className="fg"><label>結束</label><input type="time" value={r.tend || ""} onChange={e => onUpdRow("ot", i, "tend", e.target.value)} /></div>
            </div>
            <div className="fl">
              <div className="fg"><label>時數</label><input readOnly value={r.hours || ""} placeholder="自動" /></div>
              <div className="fg"><label>金額(選填)</label><input type="number" value={r.amount || ""} onChange={e => onUpdRow("ot", i, "amount", e.target.value)} /></div>
            </div>
          </div>
        ))}
        {form.ot.length > 0 && <div className="outfmt">{fmtOt(form.ot)}</div>}
      </SecBlock>
      <SecBlock id="travel" title="差旅 TA" checked={checked.has("travel")} onToggle={() => onToggleSec("travel")} onAdd={() => onAddRow("ta")} badge={checked.has("travel") ? (form.ta.length > 0 ? `NT$${Math.round(taTotal).toLocaleString()}` : "待填") : null}>
        {form.ta.map((r, i) => (
          <div key={i} className="entry"><button className="rm-btn" onClick={() => onRmRow("ta", i)}>×</button>
            <div className="fl">
              <div className="fg"><label>開始日期</label><input type="date" value={r.from_date || ""} onChange={e => onUpdRow("ta", i, "from_date", e.target.value)} /></div>
              <div className="fg"><label>結束日期</label><input type="date" value={r.to_date || ""} onChange={e => onUpdRow("ta", i, "to_date", e.target.value)} /></div>
            </div>
            <div className="fl"><div className="fg"><label>金額</label><input type="number" value={r.amount || ""} onChange={e => onUpdRow("ta", i, "amount", e.target.value)} /></div></div>
          </div>
        ))}
        {form.ta.length > 0 && <div className="subtotal">差旅小計 NT${Math.round(taTotal).toLocaleString()}</div>}
      </SecBlock>
      <SecBlock id="leave" title="請假" checked={checked.has("leave")} onToggle={() => onToggleSec("leave")} onAdd={() => onAddRow("leave", { type: "sick leave" })} badge={checked.has("leave") ? (form.leave.length > 0 ? `${form.leave.length}筆` : "待填") : null}>
        {form.leave.map((r, i) => {
          const autoH = calcLeaveH(r.tstart, r.tend);
          const autoHStr = autoH !== null ? (autoH >= 8 ? "全天" : `${parseFloat(autoH.toFixed(1))}h`) : "";
          const fullDay = autoH !== null && autoH >= 8;
          return (
            <div key={i} className="entry"><button className="rm-btn" onClick={() => onRmRow("leave", i)}>×</button>
              <div className="fl">
                <div className="fg"><label>開始日期</label><input type="date" value={r.from_date || ""} onChange={e => onUpdRow("leave", i, "from_date", e.target.value)} /></div>
                <div className="fg"><label>結束日期</label><input type="date" value={r.to_date || ""} onChange={e => onUpdRow("leave", i, "to_date", e.target.value)} /></div>
              </div>
              <div className="fl">
                <div className="fg"><label>開始時間</label><input type="time" value={r.tstart || ""} onChange={e => onUpdRow("leave", i, "tstart", e.target.value)} /></div>
                <div className="fg"><label>結束時間</label><input type="time" value={r.tend || ""} onChange={e => onUpdRow("leave", i, "tend", e.target.value)} /></div>
                <div className="fg"><label>時數</label><input readOnly value={autoHStr} placeholder="自動" style={{ color: fullDay ? "var(--ok-tx)" : "var(--b800)", fontWeight: fullDay ? 500 : 400 }} /></div>
              </div>
              <div className="fl">
                <div className="fg"><label>假別</label>
                  <select value={r.type || "sick leave"} onChange={e => onUpdRow("leave", i, "type", e.target.value)}>
                    {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {autoH !== null && <div style={{ alignSelf: "flex-end", paddingBottom: 3, fontSize: 10, color: fullDay ? "var(--ok-tx)" : "var(--warn-tx)", flexShrink: 0 }}>
                  {fullDay ? "✓ 全天假" : "⚠ 部分時數"}
                </div>}
              </div>
              {r.type === "other" && <div className="fl"><div className="fg" style={{ flex: 1 }}><label>原因</label>
                <input type="text" value={r.reason || ""} placeholder="請說明原因" onChange={e => onUpdRow("leave", i, "reason", e.target.value)} />
              </div></div>}
            </div>
          );
        })}
        {form.leave.length > 0 && (() => {
          const totalH = form.leave.reduce((a, r) => { const h = calcLeaveH(r.tstart, r.tend); return a + (h !== null ? h : 0); }, 0);
          const preview = fmtLeave(form.leave);
          return (<>
            <div className="subtotal">合計：{totalH >= 8 ? `${Math.floor(totalH / 8)}天${totalH % 8 > 0 ? ` ${totalH % 8}h` : ""}` : `${parseFloat(totalH.toFixed(1))}h`}</div>
            {preview && <div className="outfmt" style={{ whiteSpace: "normal", wordBreak: "break-all", marginTop: 2 }}>{preview}</div>}
          </>);
        })()}
      </SecBlock>
    </>
  );
}

function SecBlock({ id, title, checked, onToggle, onAdd, badge, children }) {
  return (
    <div className="sec-block">
      <div className="sec-hd" onClick={onToggle}>
        <input type="checkbox" className="sec-check" checked={checked} onChange={onToggle} onClick={e => e.stopPropagation()} />
        <span className="sec-title">{title}</span>
        {badge && <span className={badge.includes("待填") ? "warn-badge" : "ok-badge"}>{badge}</span>}
        {checked && <button className="sec-add" onClick={e => { e.stopPropagation(); onAdd(); }}>＋</button>}
      </div>
      {checked && <div className="sec-body">{children}</div>}
    </div>
  );
}

function ClearModal({ onClose, show, onDone }) {
  const [step, setStep] = useState("confirm");
  const [choice, setChoice] = useState("all");
  const { loading, run } = useApi();
  const doDelete = () => {
    setStep("clearing");
    const fn = choice === "all" ? clearAll : choice === "inbox" ? clearInbox : clearDepartments;
    run(fn,
      res => { const total = (res.deleted || 0) + (res.inbox_deleted || 0) + (res.dept_deleted || 0); show(`已刪除 ${total} 個檔案`, "ok"); setStep("done"); onDone && onDone(); },
      e => { show(`刪除失敗：${e}`, "err"); onClose(); }
    );
  };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-hd"><span className="modal-hd-t">🗑 清空檔案</span><button className="btn sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {step === "confirm" && <>
            <div style={{ background: "var(--miss-bg)", border: "1px solid #F5C1C1", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "var(--miss-tx)" }}>
              ⚠️ <strong>警告：此操作無法復原。</strong><br />刪除後所有已歸檔的檔案將永久消失。
            </div>
            {[{ id: "inbox", label: "只清空 Inbox", desc: "尚未掃描歸檔的檔案" }, { id: "departments", label: "只清空 Departments", desc: "已歸檔分類的檔案" }, { id: "all", label: "全部清空（Inbox + Departments）", desc: "清除所有檔案" }].map(o => (
              <label key={o.id} className="radio-row" style={{ marginBottom: 6 }}>
                <input type="radio" name="clr" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} />
                <span><div style={{ fontWeight: 500, fontSize: 12 }}>{o.label}</div><div style={{ fontSize: 11, color: "#888" }}>{o.desc}</div></span>
              </label>
            ))}
          </>}
          {step === "clearing" && <div style={{ textAlign: "center", padding: "24px 0" }}><div style={{ display: "inline-block", width: 36, height: 36, border: "3px solid var(--b100)", borderTopColor: "var(--b600)", borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: 12 }} /><div style={{ fontSize: 13, color: "var(--b800)" }}>刪除中…</div></div>}
          {step === "done" && <div style={{ textAlign: "center", padding: "24px 0" }}><div style={{ fontSize: 36, marginBottom: 8 }}>✅</div><div style={{ fontSize: 13, fontWeight: 500, color: "var(--b800)" }}>清空完成</div></div>}
        </div>
        <div className="modal-footer">
          {step === "confirm" && <><button className="btn" onClick={onClose}>取消</button><button className="btn" style={{ background: "var(--miss-tx)", color: "#fff", borderColor: "var(--miss-tx)" }} onClick={doDelete} disabled={loading}>{loading ? <span className="spinner" /> : "🗑"} 確認刪除</button></>}
          {step === "done" && <button className="btn blue" onClick={onClose}>關閉</button>}
        </div>
      </div>
    </div>
  );
}