import { useState, type FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, json } from "../api/client";
import type { Card, Column } from "../api/types";
import { CardView } from "./CardView";

function SortableCard({ card, onOpen, disabled }: { card: Card; onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <CardView card={card} />
    </div>
  );
}

export function BoardColumn({ column, writable, onOpenCard }: { column: Column; writable: boolean; onOpenCard: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const addCard = useMutation({
    mutationFn: (t: string) => api(`/columns/${column.id}/cards`, { method: "POST", body: json({ title: t }) }),
    onSuccess: () => {
      setTitle("");
      void qc.invalidateQueries({ queryKey: ["board", column.boardId] });
    },
  });

  return (
    <section className="column" data-testid={`column-${column.name}`}>
      <header className="column-header">
        <span>{column.name}</span>
        <span className="muted small">{column.cards.length}</span>
      </header>
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="card-list">
          {column.cards.map((card) => (
            <SortableCard key={card.id} card={card} disabled={!writable} onOpen={() => onOpenCard(card.id)} />
          ))}
        </div>
      </SortableContext>
      {writable && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (title.trim()) addCard.mutate(title.trim());
          }}
        >
          <input className="add-card" placeholder="+ Add a card" aria-label={`Add card to ${column.name}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </form>
      )}
    </section>
  );
}
