import { useState } from "react";
import Kanban from "./components/Kanban";
import PeoplePage from "./components/PeoplePage";
import VerifyRecordsPage from "./components/VerifyRecordsPage";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("kanban");
  return (
    <div className="app-root">
      <nav className="top-nav">
        <div className="nav-logo">⚙ <span>自動化管理系統</span></div>
        <div className="nav-tabs">
          <button className={`nav-tab ${page === "kanban" ? "active" : ""}`} onClick={() => setPage("kanban")}>缺件看板</button>
          <button className={`nav-tab ${page === "people" ? "active" : ""}`} onClick={() => setPage("people")}>人員管理</button>
          <button className={`nav-tab ${page === "verify" ? "active" : ""}`} onClick={() => setPage("verify")}>核對記錄</button>
        </div>
      </nav>
      {page === "kanban" && <Kanban />}
      {page === "people" && <PeoplePage />}
      {page === "verify" && <VerifyRecordsPage />}
    </div>
  );
}
