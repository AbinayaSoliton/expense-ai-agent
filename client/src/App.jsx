import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import SideNavigation from "./components/SideNavigation";
import ExpenseHistoryPage from "./pages/ExpenseHistoryPage";
import LandingPage from "./pages/LandingPage";
import AdvisorPage from "./pages/AdvisorPage";

function App() {
  return (
    <div className="app-layout">
      <section className="route-content">
        <Routes>
          <Route path="/parseinput" element={<LandingPage />} />
          <Route path="/expense-history" element={<ExpenseHistoryPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="*" element={<Navigate to="/parseinput" replace />} />
        </Routes>
      </section>
      <SideNavigation />
    </div>
  );
}

export default App;
