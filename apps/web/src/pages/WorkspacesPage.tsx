import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json } from "../api/client";
import type { WorkspaceSummary } from "../api/types";

export function WorkspacesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<{ workspaces: WorkspaceSummary[] }>("/workspaces"),
  });
  const create = useMutation({
    mutationFn: (n: string) => api<{ workspace: { id: string } }>("/workspaces", { method: "POST", body: json({ name: n }) }),
    onSuccess: ({ workspace }) => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
      navigate(`/w/${workspace.id}`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  return (
    <div className="page">
      <h2>Your workspaces</h2>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid">
          {data?.workspaces.map((w) => (
            <Link key={w.id} to={`/w/${w.id}`} className="tile">
              <strong>{w.name}</strong>
              <span className="muted small">
                {w.boardCount} boards · {w.memberCount} members · {w.role.toLowerCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
      <form className="inline-form" onSubmit={onSubmit}>
        <input placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New workspace name" />
        <button className="btn primary" disabled={create.isPending}>
          Create workspace
        </button>
      </form>
    </div>
  );
}
