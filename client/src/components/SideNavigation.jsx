import React from "react";
import { NavLink } from "react-router-dom";

function navLinkClassName({ isActive }) {
  return isActive ? "side-nav-link active" : "side-nav-link";
}

function SideNavigation() {
  return (
    <aside className="side-nav" aria-label="Primary navigation">
      <div className="side-nav-brand">
        <p className="side-nav-kicker">Expense AI</p>
        <h2>Finance Workspace</h2>
      </div>

      <p className="side-nav-section-title">Workflows</p>

      <NavLink to="/parseinput" className={navLinkClassName} end>
        Parse Expense Text
      </NavLink>
      <NavLink to="/expense-history" className={navLinkClassName}>
        Expense History
      </NavLink>
      <NavLink to="/expense-dashboard" className={navLinkClassName}>
        Expense Dashboard
      </NavLink>
      <NavLink to="/budget-tracker" className={navLinkClassName}>
        Budget Tracker
      </NavLink>
      <NavLink to="/budget-usage" className={navLinkClassName}>
        Budget Usage
      </NavLink>
      <NavLink to="/advisor" className={navLinkClassName}>
        Expense Advisor
      </NavLink>
      <NavLink to="/expense-advisor-chat" className={navLinkClassName}>
        Expense Chat
      </NavLink>
    </aside>
  );
}

export default SideNavigation;
