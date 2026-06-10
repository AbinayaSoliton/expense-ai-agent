import React from "react";
import { NavLink } from "react-router-dom";

function navLinkClassName({ isActive }) {
  return isActive ? "side-nav-link active" : "side-nav-link";
}

function SideNavigation() {
  return (
    <aside className="side-nav" aria-label="Right side navigation">
      <h2>Navigation</h2>
      <NavLink to="/parseinput" className={navLinkClassName} end>
        Parse Input
      </NavLink>
      <NavLink to="/expense-history" className={navLinkClassName}>
        Expense History Input
      </NavLink>
      <NavLink to="/advisor" className={navLinkClassName}>
        Expense Advisor
      </NavLink>
    </aside>
  );
}

export default SideNavigation;
