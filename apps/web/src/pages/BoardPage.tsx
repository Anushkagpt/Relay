import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api, json } from "../api/client";
import type { Board, Card, Column } from "../api/types";
import { useBoardRealtime } from "../hooks/useBoardRealtime";
import { canWrite, neighbours } from "../lib";
import { BoardColumn } from "../components/BoardColumn";
import { CardView } from "../components/CardView";
import { CardModal } from "../components/CardModal";
import { ActivityFeed } from "../components/ActivityFeed";
import { Avatar } from "../components/Avatar";

function findColumn(columns: Column[], id: string) {
  return columns.find((c) => c.id === id) ?? columns.find((c) => c.cards.some((card) => card.id === id));
}

export function BoardPage() {
  const { boardId = "" } = useParams();
  const qc = useQueryClient();
  const { online } = useBoardRealtime(boardId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<{ board: Board }>(`/boards/${boardId}`),
  });
  const board = data?.board;

  // Local copy so drags feel instant; resynced whenever the server copy changes.
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState("");
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    if (board && !activeCard) setColumns(board.columns);
  }, [board, activeCard]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: (v: { cardId: string; columnId: string; beforeId: string | null; afterId: string | null }) =>
      api(`/cards/${v.cardId}/move`, { method: "POST", body: json(v) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
  const addColumn = useMutation({
    mutationFn: (name: string) => api(`/boards/${boardId}/columns`, { method: "POST", body: json({ name }) }),
    onSuccess: () => {
      setNewColumn("");
      void qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });

  if (isLoading) return <div className="page muted">Loading board…</div>;
  if (error || !board) return <div className="page error">Board not found or you don't have access.</div>;
  const writable = canWrite(board.role);

  function onDragStart(e: DragStartEvent) {
    const col = findColumn(columns, String(e.active.id));
    setActiveCard(col?.cards.find((c) => c.id === e.active.id) ?? null);
  }

  // Moving across columns happens during drag-over so the target column opens a gap.
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(columns, String(active.id));
    const to = findColumn(columns, String(over.id));
    if (!from || !to || from.id === to.id) return;
    setColumns((cols) => {
      const card = from.cards.find((c) => c.id === active.id)!;
      const overIndex = to.cards.findIndex((c) => c.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : to.cards.length;
      return cols.map((c) => {
        if (c.id === from.id) return { ...c, cards: c.cards.filter((x) => x.id !== active.id) };
        if (c.id === to.id) {
          const cards = [...c.cards];
          cards.splice(insertAt, 0, { ...card, columnId: to.id });
          return { ...c, cards };
        }
        return c;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;
    const col = findColumn(columns, String(active.id));
    if (!col) return;
    const oldIndex = col.cards.findIndex((c) => c.id === active.id);
    let newIndex = col.cards.findIndex((c) => c.id === over.id);
    if (newIndex < 0) newIndex = oldIndex;
    const cards = [...col.cards];
    const [moved] = cards.splice(oldIndex, 1);
    cards.splice(newIndex, 0, moved);
    setColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, cards } : c)));

    const original = board!.columns.find((c) => c.cards.some((x) => x.id === active.id));
    const originalIndex = original?.cards.findIndex((x) => x.id === active.id);
    if (original?.id === col.id && originalIndex === newIndex) return;
    move.mutate({ cardId: String(active.id), columnId: col.id, ...neighbours(cards, newIndex) });
  }

  return (
    <div className="board-page">
      <div className="board-header">
        <div>
          <p className="muted small">
            <Link to={`/w/${board.workspaceId}`}>Workspace</Link> / {board.name}
          </p>
          <h2>{board.name}</h2>
        </div>
        <div className="board-tools">
          <div className="presence" aria-label="Online now">
            {online.map((u) => (
              <Avatar key={u.id} name={u.name} />
            ))}
            {online.length > 0 && <span className="muted small">{online.length} online</span>}
          </div>
          {!writable && <span className="pill">view only</span>}
          <button className="btn ghost" onClick={() => setShowActivity((s) => !s)}>
            Activity
          </button>
        </div>
      </div>

      <div className="board-body">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={writable ? onDragStart : undefined}
          onDragOver={writable ? onDragOver : undefined}
          onDragEnd={writable ? onDragEnd : undefined}
        >
          <div className="columns">
            {columns.map((col) => (
              <BoardColumn key={col.id} column={col} writable={writable} onOpenCard={setOpenCardId} />
            ))}
            {writable && (
              <form
                className="column add-column"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (newColumn.trim()) addColumn.mutate(newColumn.trim());
                }}
              >
                <input placeholder="+ Add column" aria-label="New column name" value={newColumn} onChange={(e) => setNewColumn(e.target.value)} />
              </form>
            )}
          </div>
          <DragOverlay>{activeCard ? <CardView card={activeCard} dragging /> : null}</DragOverlay>
        </DndContext>
        {showActivity && <ActivityFeed boardId={boardId} />}
      </div>

      {openCardId && <CardModal cardId={openCardId} board={board} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
