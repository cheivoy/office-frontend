import { useState } from "react";
import Kanban from "./components/Kanban";
import PeoplePage from "./components/PeoplePage";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("kanban");

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="nav-logo">
          <span className="logo-icon">⚙</span>
          自動化管理系統
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${page === "kanban" ? "active" : ""}`}
            onClick={() => setPage("kanban")}
          >
            缺件看板
          </button>
          <button
            className={`nav-tab ${page === "people" ? "active" : ""}`}
            onClick={() => setPage("people")}
          >
            人員管理
          </button>
        </div>
      </nav>

      <main className="page-content">
        {page === "kanban" ? <Kanban /> : <PeoplePage />}
      </main>
    </div>
  );
}
