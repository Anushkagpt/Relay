import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { NotificationBell } from "./NotificationBell";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Relay
        </Link>
        <div className="topbar-right">
          <NotificationBell />
          <span className="muted">{user?.name}</span>
          <button className="btn ghost" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
