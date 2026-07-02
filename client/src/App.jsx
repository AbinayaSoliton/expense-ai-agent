import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import SideNavigation from "./components/SideNavigation";
import ExpenseHistoryPage from "./pages/ExpenseHistoryPage";
import LandingPage from "./pages/LandingPage";
import AdvisorPage from "./pages/AdvisorPage";
import ExpenseDashboardPage from "./pages/ExpenseDashboardPage";
import BudgetTrackerPage from "./pages/BudgetTrackerPage";
import BudgetUsagePage from "./pages/BudgetUsagePage";
import ExpenseAdvisorChatPage from "./pages/ExpenseAdvisorChatPage";

const PAGE_TITLES = {
  "/parseinput": "Smart Expense Parser",
  "/expense-history": "Expense History",
  "/expense-dashboard": "Expense Dashboard",
  "/budget-tracker": "Budget Tracker",
  "/budget-usage": "Budget Usage",
  "/advisor": "AI Expense Advisor",
  "/expense-advisor-chat": "Expense Advisor Chat"
};

function App() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || "Personal Finance Assistant";

  return (
    <div className="app-layout">
      <SideNavigation />
      <main className="app-main-shell">
        <header className="app-topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>Track, plan, and optimize your spending in one place.</p>
          </div>
        </header>

        <section className="route-content">
          <Routes>
            <Route path="/parseinput" element={<LandingPage />} />
            <Route path="/expense-history" element={<ExpenseHistoryPage />} />
            <Route path="/expense-dashboard" element={<ExpenseDashboardPage />} />
            <Route path="/budget-tracker" element={<BudgetTrackerPage />} />
            <Route path="/budget-usage" element={<BudgetUsagePage />} />
            <Route path="/advisor" element={<AdvisorPage />} />
            <Route path="/expense-advisor-chat" element={<ExpenseAdvisorChatPage />} />
            <Route path="*" element={<Navigate to="/parseinput" replace />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}

export default App;
