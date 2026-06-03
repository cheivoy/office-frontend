// src/api.js — centralised API client
// In production, REACT_APP_API_URL is set to your Railway backend URL
const BASE = process.env.REACT_APP_API_URL || "";

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body) {
    if (isForm) {
      opts.body = body; // FormData
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.blob(); // file download
}

// ── People ───────────────────────────────────────────────────────
export const getPeople      = ()         => req("GET",    "/api/people");
export const upsertPerson   = (data)     => req("POST",   "/api/people", data);
export const deletePerson   = (id)       => req("DELETE", `/api/people/${id}`);
export const importPeople   = (file)     => {
  const fd = new FormData(); fd.append("file", file);
  return req("POST", "/api/people/import", fd, true);
};

// ── Scan & Files ─────────────────────────────────────────────────
export const scanInbox       = ()              => req("POST", "/api/scan-and-classify");
export const importFiles     = (files)         => {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  return req("POST", "/api/import-files", fd, true);
};
export const getEmployeeFiles = (empEn)        => req("GET", `/api/employee-files/${encodeURIComponent(empEn)}`);
export const previewFileUrl   = (empEn, fname) => `${BASE}/api/preview-file/${encodeURIComponent(empEn)}/${encodeURIComponent(fname)}`;
export const downloadZip      = (empEn)        => req("GET", `/api/download-zip/${encodeURIComponent(empEn)}`);
export const downloadAllZip   = ()             => req("GET", "/api/download-all-zip");

// ── EML ──────────────────────────────────────────────────────────
export const previewEml        = (empEn, fname) => req("GET", `/api/eml/preview/${encodeURIComponent(empEn)}/${encodeURIComponent(fname)}`);
export const attachmentUrl     = (empEn, fname, att) =>
  `${BASE}/api/eml/attachment/${encodeURIComponent(empEn)}/${encodeURIComponent(fname)}/${encodeURIComponent(att)}`;

// ── Submit (write to Excel) ───────────────────────────────────────
export const submitData = (payloadJson, templateFile) => {
  const fd = new FormData();
  fd.append("payload_json", JSON.stringify(payloadJson));
  fd.append("template", templateFile);
  return req("POST", "/api/submit-data", fd, true);
};
export const submitWipro = (payloadJson, templateFile, sheetName = "") => {
  const fd = new FormData();
  fd.append("payload_json", JSON.stringify(payloadJson));
  fd.append("template", templateFile);
  fd.append("sheet_name", sheetName);
  return req("POST", "/api/submit-wipro", fd, true);
};

// ── Reports ──────────────────────────────────────────────────────
export const writeProjectF = (empName, tabJson, templateFile) => {
  const fd = new FormData();
  fd.append("emp_name", empName);
  fd.append("tab_json", JSON.stringify(tabJson));
  fd.append("template", templateFile);
  return req("POST", "/api/report/project-f", fd, true);
};
export const writeNokiaCost = (empName, tabJson, templateFile, sheetName = "") => {
  const fd = new FormData();
  fd.append("emp_name", empName);
  fd.append("tab_json", JSON.stringify(tabJson));
  fd.append("template", templateFile);
  fd.append("sheet_name", sheetName);
  return req("POST", "/api/report/nokia-cost", fd, true);
};

// ── Verify (Wipro cross-check) ───────────────────────────────────
export const verifyAll = (empName, tabData, travelFile, otFile, essFile) => {
  const fd = new FormData();
  fd.append("emp_name", empName);
  fd.append("tab_json", JSON.stringify(tabData));
  if (travelFile) fd.append("travel_file", travelFile);
  if (otFile)     fd.append("ot_file", otFile);
  if (essFile)    fd.append("ess_file", essFile);
  return req("POST", "/api/verify/all", fd, true);
};

// ── Utility ──────────────────────────────────────────────────────
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
