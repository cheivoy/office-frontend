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
export const importFilesForce = (files) => {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  return req("POST", "/api/import-files-force", fd, true);
};
export const importFiles     = (files)         => {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  return req("POST", "/api/import-files", fd, true);
};
export const getEmployeeFiles = (empEn)        => req("GET", `/api/employee-files/${encodeURIComponent(empEn)}`);
export const previewFileUrl   = (empEn, filePath) => `${BASE}/api/preview-file/${encodeURIComponent(empEn)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
export const downloadZip      = (empEn)        => req("GET", `/api/download-zip/${encodeURIComponent(empEn)}`);
export const downloadAllZip   = ()             => req("GET", "/api/download-all-zip");

// ── EML ──────────────────────────────────────────────────────────
export const previewEml        = (empEn, filePath) => req("GET", `/api/eml/preview/${encodeURIComponent(empEn)}/${filePath.split("/").map(encodeURIComponent).join("/")}`);
export const attachmentUrl     = (empEn, filePath, att) =>
  `${BASE}/api/eml/attachment/${encodeURIComponent(empEn)}/${filePath.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(att)}`;

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

// ── Batch Write ──────────────────────────────────────────────────
export const batchWriteChtNokia = (period, formsJson) => {
  const fd = new FormData();
  fd.append("period", period);
  fd.append("forms_json", JSON.stringify(formsJson));
  return req("POST", "/api/batch-write/cht-nokia", fd, true);
};
export const batchWriteChtDk = (period, formsJson) => {
  const fd = new FormData();
  fd.append("period", period);
  fd.append("forms_json", JSON.stringify(formsJson));
  return req("POST", "/api/batch-write/cht-dk", fd, true);
};
export const batchWriteWipro = (period, sheetName, formsJson, templateFile) => {
  const fd = new FormData();
  fd.append("period", period);
  fd.append("sheet_name", sheetName);
  fd.append("forms_json", JSON.stringify(formsJson));
  fd.append("template", templateFile);
  return req("POST", "/api/batch-write/wipro", fd, true);
};
export const batchWriteProjectF = (period, formsJson, templateFile) => {
  const fd = new FormData();
  fd.append("period", period);
  fd.append("forms_json", JSON.stringify(formsJson));
  fd.append("template", templateFile);
  return req("POST", "/api/batch-write/project-f", fd, true);
};
export const batchWriteNokiaCost = (period, sheetName, formsJson, templateFile) => {
  const fd = new FormData();
  fd.append("period", period);
  fd.append("sheet_name", sheetName);
  fd.append("forms_json", JSON.stringify(formsJson));
  fd.append("template", templateFile);
  return req("POST", "/api/batch-write/nokia-cost", fd, true);
};

// ── xlsx Preview ─────────────────────────────────────────────────
export const previewXlsxUrl = (empEn, filePath) =>
  `${BASE}/api/preview-xlsx/${encodeURIComponent(empEn)}/${encodeURIComponent(filePath)}`;

// ── Download filtered ────────────────────────────────────────────
export const downloadFiltered = (q, period, ids) => {
  const params = new URLSearchParams();
  if (q)      params.set("q", q);
  if (period) params.set("period", period);
  if (ids)    params.set("ids", ids);
  return req("GET", `/api/download-filtered?${params}`);
};

export const getPeriods = () => req("GET", "/api/periods");

// ── Scan with period ─────────────────────────────────────────────
export const scanInboxWithPeriod = (period) => {
  const fd = new FormData();
  fd.append("period", period);
  return req("POST", "/api/scan-and-classify", fd, true);
};
// ── Clear data ───────────────────────────────────────────────────
export const clearAll          = () => req("DELETE", "/api/clear-all");
export const clearInbox        = () => req("DELETE", "/api/clear-inbox");
export const clearDepartments  = () => req("DELETE", "/api/clear-departments");
export const deleteFile = (empEn, filePath) =>
  req("DELETE", `/api/delete-file/${encodeURIComponent(empEn)}/${encodeURIComponent(filePath)}`);
export const moveFile = (empEn, filePath, targetEmp, targetPeriod="", copy=false) => {
  const fd = new FormData();
  fd.append("emp_en", empEn);
  fd.append("file_path", filePath);
  fd.append("target_emp", targetEmp);
  fd.append("target_period", targetPeriod);
  fd.append("do_copy", copy);
  return req("POST", "/api/move-file", fd, true);
};
export const uploadToEmployee = (empEn, period, files) => {
  const fd = new FormData();
  fd.append("emp_en", empEn);
  fd.append("period", period);
  files.forEach(f => fd.append("files", f));
  return req("POST", "/api/upload-to-employee", fd, true);
};

// ── Sync (Forms & Progress) ──────────────────────────────────────
export const getAllForms        = (period = "")   => req("GET",  `/api/forms${period ? "?period=" + encodeURIComponent(period) : ""}`);
export const getForm            = (empEn)         => req("GET",  `/api/forms/${encodeURIComponent(empEn)}`);
export const saveForm           = (empEn, data)   => req("PUT",  `/api/forms/${encodeURIComponent(empEn)}`, data);
export const saveFormsBulk      = (data)          => req("PUT",  "/api/forms", data);
export const deleteFormApi      = (empEn)         => req("DELETE",`/api/forms/${encodeURIComponent(empEn)}`);

export const getAllProgress      = ()              => req("GET",  "/api/progress");
export const saveProgressUnit   = (unitKey, data) => req("PUT",  `/api/progress/${encodeURIComponent(unitKey)}`, data);
export const saveProgressBulk   = (data)          => req("PUT",  "/api/progress", data);
