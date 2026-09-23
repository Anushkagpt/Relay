import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Activity } from "../api/types";
import { describeActivity, timeAgo } from "../lib";

export function ActivityFeed({ boardId }: { boardId: string }) {
  const { data } = useQuery({
    queryKey: ["activity", boardId],
    queryFn: () => api<{ activity: Activity[] }>(`/boards/${boardId}/activity`),
  });
  return (
    <aside className="activity">
      <h3>Activity</h3>
      <ul>
        {data?.activity.map((a) => (
          <li key={a.id}>
            <strong>{a.actor.name}</strong> {describeActivity(a)}
            <div className="muted small">{timeAgo(a.createdAt)}</div>
          </li>
        ))}
        {!data?.activity.length && <li className="muted">Nothing yet.</li>}
      </ul>
    </aside>
  );
}
