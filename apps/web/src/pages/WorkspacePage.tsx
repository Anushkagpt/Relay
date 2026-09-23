import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json } from "../api/client";
import type { Role, WorkspaceDetail } from "../api/types";
import { canManage, canWrite } from "../lib";
import { Avatar } from "../components/Avatar";

export function WorkspacePage() {
  const { workspaceId = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [boardName, setBoardName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [error, setError] = useState<string | null>(null);

  const key = ["workspace", workspaceId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ workspace: WorkspaceDetail }>(`/workspaces/${workspaceId}`) });
  const ws = data?.workspace;

  const createBoard = useMutation({
    mutationFn: (name: string) =>
      api<{ board: { id: string } }>(`/workspaces/${workspaceId}/boards`, { method: "POST", body: json({ name }) }),
    onSuccess: ({ board }) => navigate(`/b/${board.id}`),
  });
  const invite = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/members`, { method: "POST", body: json({ email, role }) }),
    onSuccess: () => {
      setEmail("");
      setError(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => setError(e.message),
  });
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: Role }) =>
      api(`/workspaces/${workspaceId}/members/${v.userId}`, { method: "PATCH", body: json({ role: v.role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => setError(e.message),
  });

  if (!ws) return <div className="page muted">Loading…</div>;

  return (
    <div className="page">
      <p className="muted small">
        <Link to="/">Workspaces</Link> / {ws.name}
      </p>
      <h2>{ws.name}</h2>

      <section>
        <h3>Boards</h3>
        <div className="grid">
          {ws.boards.map((b) => (
            <Link key={b.id} to={`/b/${b.id}`} className="tile">
              <strong>{b.name}</strong>
            </Link>
          ))}
          {!ws.boards.length && <p className="muted">No boards yet.</p>}
        </div>
        {canWrite(ws.role) && (
          <form
            className="inline-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (boardName.trim()) createBoard.mutate(boardName.trim());
            }}
          >
            <input placeholder="New board name" aria-label="New board name" value={boardName} onChange={(e) => setBoardName(e.target.value)} />
            <button className="btn primary">Create board</button>
          </form>
        )}
      </section>

      <section>
        <h3>Members</h3>
        <ul className="members">
          {ws.members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} />
              <span>{m.name}</span>
              <span className="muted small">{m.email}</span>
              {canManage(ws.role) ? (
                <select value={m.role} onChange={(e) => changeRole.mutate({ userId: m.id, role: e.target.value as Role })}>
                  {(["OWNER", "ADMIN", "MEMBER", "VIEWER"] as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {r.toLowerCase()}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pill">{m.role.toLowerCase()}</span>
              )}
            </li>
          ))}
        </ul>
        {canManage(ws.role) && (
          <form
            className="inline-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <input type="email" placeholder="teammate@company.com" aria-label="Invite email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
              <option value="ADMIN">admin</option>
              <option value="MEMBER">member</option>
              <option value="VIEWER">viewer</option>
            </select>
            <button className="btn">Add member</button>
          </form>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </div>
  );
}
