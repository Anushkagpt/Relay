import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Column } from "../api/types";
import { Avatar } from "../components/Avatar";
import { CardView } from "../components/CardView";
import { timeAgo } from "../lib";

type IssueType = "Task" | "Bug" | "Story";
type Priority = "Highest" | "High" | "Medium" | "Low";
type SampleCard = Card & { issueType: IssueType; priority: Priority };
type SampleColumn = Omit<Column, "cards"> & { cards: SampleCard[] };
type SampleComment = { id: string; body: string; createdAt: string; author: string };
type ActivityEntry = { id: string; text: string; createdAt: string };
type BoardState = { columns: SampleColumn[]; comments: Record<string, SampleComment[]>; activity: ActivityEntry[] };

const boardId = "sample-product-launch";
const storageKey = "relay.sample-board.v1";
const people = [
  { id: "demo", name: "Demo User" },
  { id: "sam", name: "Sam Rivera" },
  { id: "alex", name: "Alex Morgan" },
  { id: "taylor", name: "Taylor Kim" },
];

function dueInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sampleCard(
  id: string,
  columnId: string,
  title: string,
  position: number,
  dueDays: number | null,
  assigneeId: string | null,
  issueType: IssueType = "Task",
  priority: Priority = "Medium",
  commentCount = 0,
): SampleCard {
  const assignee = people.find((person) => person.id === assigneeId);
  return {
    id,
    boardId,
    columnId,
    title,
    description: "",
    position,
    dueDate: dueDays === null ? null : dueInDays(dueDays),
    assigneeId,
    assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
    _count: { comments: commentCount },
    issueType,
    priority,
  };
}

function makeInitialState(): BoardState {
  const todoId = "sample-todo";
  const progressId = "sample-in-progress";
  const reviewId = "sample-review";
  const doneId = "sample-done";
  return {
    columns: [
      {
        id: todoId,
        boardId,
        name: "To do",
        position: 1024,
        cards: [
          sampleCard("sample-blog-post", todoId, "Write launch blog post", 1024, 2, "sam", "Story", "High", 2),
          sampleCard("sample-status-page", todoId, "Set up status page", 2048, 5, null, "Task", "Medium"),
          sampleCard("sample-launch-email", todoId, "Prepare launch email", 3072, 4, "alex", "Task", "Medium"),
          sampleCard("sample-checklist", todoId, "Confirm launch checklist", 4096, -1, "demo", "Task", "Low"),
        ],
      },
      {
        id: progressId,
        boardId,
        name: "In progress",
        position: 2048,
        cards: [
          sampleCard("sample-api-load-test", progressId, "Load test the API", 1024, 7, "demo", "Task", "Highest"),
          sampleCard("sample-billing-dashboard", progressId, "Add billing dashboard", 2048, 3, "sam", "Story", "High"),
        ],
      },
      {
        id: reviewId,
        boardId,
        name: "Review",
        position: 3072,
        cards: [sampleCard("sample-onboarding-copy", reviewId, "Review onboarding copy", 1024, 1, "alex", "Task", "Medium")],
      },
      {
        id: doneId,
        boardId,
        name: "Done",
        position: 4096,
        cards: [
          sampleCard("sample-onboarding-flow", doneId, "Design onboarding flow", 1024, -3, "demo", "Story", "Medium"),
          sampleCard("sample-launch-graphics", doneId, "Create launch graphics", 2048, -6, "sam", "Task", "Low"),
        ],
      },
    ],
    comments: {
      "sample-blog-post": [
        { id: "sample-comment-1", body: "First draft is ready for review.", createdAt: new Date(Date.now() - 3_600_000).toISOString(), author: "Sam Rivera" },
        { id: "sample-comment-2", body: "Please include the updated product screenshots.", createdAt: new Date(Date.now() - 1_800_000).toISOString(), author: "Alex Morgan" },
      ],
    },
    activity: [
      { id: "sample-activity-1", text: "created the Product Launch board", createdAt: new Date(Date.now() - 86_400_000).toISOString() },
      { id: "sample-activity-2", text: 'moved "Design onboarding flow" to Done', createdAt: new Date(Date.now() - 7_200_000).toISOString() },
    ],
  };
}

function loadBoard(): BoardState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return makeInitialState();
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as BoardState).columns) &&
      typeof (parsed as BoardState).comments === "object" &&
      Array.isArray((parsed as BoardState).activity)
    ) {
      return parsed as BoardState;
    }
    console.error("Saved sample board data has an invalid shape; showing the original sample board.");
  } catch (error) {
    console.error("Could not read the saved sample board; showing the original sample board.", error);
  }
  return makeInitialState();
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function SortableIssue({ card, onOpen, dragging = false }: { card: SampleCard; onOpen: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${card.title}`}
    >
      <div className="issue-kinds">
        <span className={`issue-type issue-type-${card.issueType.toLowerCase()}`}>{card.issueType}</span>
        <span className={`issue-priority priority-${card.priority.toLowerCase()}`}>{card.priority}</span>
      </div>
      <CardView card={card} dragging={dragging} />
    </div>
  );
}

function SampleDroppableColumn({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`card-list sample-card-list${isOver ? " column-over" : ""}`}>
      {children}
    </div>
  );
}

export function SampleBoardPage() {
  const [board, setBoard] = useState<BoardState>(loadBoard);
  const [storageError, setStorageError] = useState(false);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [createIssue, setCreateIssue] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueColumnId, setIssueColumnId] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("Task");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueError, setIssueError] = useState("");
  const [comment, setComment] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(board));
      setStorageError(false);
    } catch (error) {
      console.error("Could not save the sample board.", error);
      setStorageError(true);
    }
  }, [board]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenCardId(null);
        setCreateIssue(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#issue-search")?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setIssueColumnId(board.columns[0]?.id ?? "");
        setCreateIssue(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [board.columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeCard = board.columns.flatMap((column) => column.cards).find((card) => card.id === activeCardId) ?? null;
  const openCard = board.columns.flatMap((column) => column.cards).find((card) => card.id === openCardId) ?? null;
  useEffect(() => {
    setTitleDraft(openCard?.title ?? "");
    setDescriptionDraft(openCard?.description ?? "");
  }, [openCard?.id]);

  const filteredColumns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        const matchesText =
          !normalizedQuery ||
          card.title.toLowerCase().includes(normalizedQuery) ||
          card.description.toLowerCase().includes(normalizedQuery);
        const matchesAssignee = assigneeFilter === "all" || card.assigneeId === assigneeFilter;
        return matchesText && matchesAssignee;
      }),
    }));
  }, [assigneeFilter, board.columns, query]);

  function recordActivity(text: string) {
    setBoard((current) => ({
      ...current,
      activity: [{ id: newId(), text, createdAt: new Date().toISOString() }, ...current.activity].slice(0, 40),
    }));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sourceColumn = board.columns.find((column) => column.cards.some((card) => card.id === active.id));
    const targetColumn = board.columns.find(
      (column) => column.id === String(over.id) || column.cards.some((card) => card.id === over.id),
    );
    if (!sourceColumn || !targetColumn) return;
    const draggedCard = sourceColumn.cards.find((card) => card.id === active.id);
    if (!draggedCard) return;
    const targetIndex = targetColumn.cards.findIndex((card) => card.id === over.id);
    const insertionIndex = targetIndex < 0 ? targetColumn.cards.length : targetIndex;
    const nextColumns = board.columns.map((column) => ({ ...column, cards: [...column.cards] }));
    const nextSource = nextColumns.find((column) => column.id === sourceColumn.id)!;
    const nextTarget = nextColumns.find((column) => column.id === targetColumn.id)!;
    const sourceIndex = nextSource.cards.findIndex((card) => card.id === active.id);
    const [card] = nextSource.cards.splice(sourceIndex, 1);
    const adjustedIndex = sourceColumn.id === targetColumn.id && sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    const movedCard = { ...card, columnId: targetColumn.id };
    nextTarget.cards.splice(adjustedIndex, 0, movedCard);
    nextColumns.forEach((column) => column.cards.forEach((item, index) => (item.position = (index + 1) * 1024)));
    setBoard((current) => ({ ...current, columns: nextColumns }));
    recordActivity(`moved "${draggedCard.title}" to ${targetColumn.name}`);
  }

  function submitIssue(event: FormEvent) {
    event.preventDefault();
    const title = issueTitle.trim();
    const targetColumn = board.columns.find((column) => column.id === issueColumnId);
    if (!title || !targetColumn) {
      setIssueError("Add a title and choose a status.");
      return;
    }
    const card = {
      ...sampleCard(newId(), targetColumn.id, title, (targetColumn.cards.length + 1) * 1024, null, null, issueType, priority),
      description: issueDescription.trim(),
    };
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((column) => (column.id === targetColumn.id ? { ...column, cards: [...column.cards, card] } : column)),
    }));
    recordActivity(`created "${title}" in ${targetColumn.name}`);
    setIssueTitle("");
    setIssueDescription("");
    setIssueError("");
    setCreateIssue(false);
  }

  function addColumn(event: FormEvent) {
    event.preventDefault();
    const name = newColumnName.trim();
    if (!name) return;
    const column: SampleColumn = { id: newId(), boardId, name, position: (board.columns.length + 1) * 1024, cards: [] };
    setBoard((current) => ({ ...current, columns: [...current.columns, column] }));
    recordActivity(`added the "${name}" status`);
    setNewColumnName("");
  }

  function updateCard(cardId: string, patch: Partial<SampleCard>) {
    const card = board.columns.flatMap((column) => column.cards).find((item) => item.id === cardId);
    if (!card) return;
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((column) => ({
        ...column,
        cards: column.cards.map((item) => (item.id === cardId ? { ...item, ...patch } : item)),
      })),
    }));
    if (patch.title && patch.title !== card.title) recordActivity(`renamed an issue to "${patch.title}"`);
    else if (patch.assigneeId !== undefined) recordActivity(patch.assigneeId ? `assigned "${card.title}"` : `unassigned "${card.title}"`);
    else if (patch.dueDate !== undefined) recordActivity(`updated the due date for "${card.title}"`);
    else recordActivity(`updated "${card.title}"`);
  }

  function addComment(event: FormEvent) {
    event.preventDefault();
    if (!openCard || !comment.trim()) return;
    const body = comment.trim();
    const nextComment = { id: newId(), body, createdAt: new Date().toISOString(), author: "Demo User" };
    setBoard((current) => ({
      ...current,
      comments: { ...current.comments, [openCard.id]: [...(current.comments[openCard.id] ?? []), nextComment] },
      columns: current.columns.map((column) => ({
        ...column,
        cards: column.cards.map((card) =>
          card.id === openCard.id ? { ...card, _count: { comments: (card._count?.comments ?? 0) + 1 } } : card,
        ),
      })),
      activity: [{ id: newId(), text: `commented on "${openCard.title}"`, createdAt: new Date().toISOString() }, ...current.activity],
    }));
    setComment("");
  }

  function deleteCard(card: SampleCard) {
    if (!window.confirm(`Delete "${card.title}"?`)) return;
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((column) => ({ ...column, cards: column.cards.filter((item) => item.id !== card.id) })),
      comments: Object.fromEntries(Object.entries(current.comments).filter(([id]) => id !== card.id)),
    }));
    recordActivity(`deleted "${card.title}"`);
    setOpenCardId(null);
  }

  function deleteColumn(column: SampleColumn) {
    if (column.cards.length || !window.confirm(`Delete the empty "${column.name}" status?`)) return;
    setBoard((current) => ({ ...current, columns: current.columns.filter((item) => item.id !== column.id) }));
    recordActivity(`deleted the "${column.name}" status`);
  }

  function resetBoard() {
    if (!window.confirm("Reset the board and remove your saved changes?")) return;
    const initial = makeInitialState();
    setBoard(initial);
    setOpenCardId(null);
    setQuery("");
    setAssigneeFilter("all");
    try {
      localStorage.removeItem(storageKey);
      setStorageError(false);
    } catch (error) {
      console.error("Could not remove the saved sample board.", error);
      setStorageError(true);
    }
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">Relay</span>
        <div className="topbar-right">
          <span className="sample-indicator"><span className="sample-dot" /> Sample project</span>
          <span className="sample-user"><Avatar name="Demo User" size={26} /> Demo User</span>
        </div>
      </header>
      <main className="sample-app">
        <nav className="project-nav" aria-label="Project navigation">
          <span className="project-icon">P</span>
          <div><strong>Demo Workspace</strong><span>Product Launch project</span></div>
          <span className="project-nav-current">Board</span>
        </nav>
        <section className="sample-board">
          <div className="sample-heading">
            <div>
              <p className="muted small">Projects / Product Launch / Board</p>
              <div className="sample-title-row"><h1>Product Launch</h1><span className="pill">KANBAN</span></div>
              <p className="muted sample-subtitle">A collaborative board for the product launch team.</p>
            </div>
            <div className="board-heading-actions">
              <div className="sample-team" aria-label="Project members">
                {people.slice(1, 4).map((person) => <Avatar key={person.id} name={person.name} size={30} />)}
              </div>
              <button className="btn" onClick={() => setShowActivity((visible) => !visible)} aria-pressed={showActivity}>Activity</button>
              <button className="btn" onClick={resetBoard}>Reset sample</button>
              <button className="btn primary" onClick={() => { setIssueColumnId(board.columns[0]?.id ?? ""); setCreateIssue(true); }}>＋ Create issue</button>
            </div>
          </div>

          <div className="board-toolbar">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input id="issue-search" type="search" placeholder="Search issues" aria-label="Search issues" value={query} onChange={(event) => setQuery(event.target.value)} />
              <kbd>Ctrl K</kbd>
            </label>
            <label className="assignee-filter">
              <span>Assignee</span>
              <select aria-label="Filter by assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                <option value="all">Everyone</option>
                {people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
              </select>
            </label>
            <span className="muted small">{filteredColumns.reduce((count, column) => count + column.cards.length, 0)} issues</span>
          </div>
          {storageError && <p className="error storage-warning">Your changes are visible now but could not be saved in this browser.</p>}

          <div className="board-body sample-board-body">
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="columns sample-columns">
                {filteredColumns.map((column) => {
                  const savedColumn = board.columns.find((item) => item.id === column.id)!;
                  return (
                    <section className="column sample-column" key={column.id} data-testid={`column-${column.name}`}>
                      <header className="column-header">
                        <span className="column-name"><span className={`status-dot status-${column.name.toLowerCase().replace(/\s+/g, "-")}`} />{column.name}</span>
                        <span className="column-count">{column.cards.length}</span>
                        <button
                          className="column-delete"
                          type="button"
                          aria-label={`Delete ${column.name} status`}
                          title={savedColumn.cards.length ? "Move issues out before deleting this status" : "Delete empty status"}
                          disabled={savedColumn.cards.length > 0}
                          onClick={() => deleteColumn(savedColumn)}
                        >⋯</button>
                      </header>
                      <SortableContext items={column.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
                        <SampleDroppableColumn id={column.id}>
                          {column.cards.map((card) => (
                            <SortableIssue key={card.id} card={card} onOpen={() => setOpenCardId(card.id)} />
                          ))}
                          {column.cards.length === 0 && <p className="empty-column">Drop an issue here or create one.</p>}
                        </SampleDroppableColumn>
                      </SortableContext>
                      <button className="add-issue-button" onClick={() => { setIssueColumnId(column.id); setCreateIssue(true); }}>＋ Create issue</button>
                    </section>
                  );
                })}
                <form className="column add-column sample-add-column" onSubmit={addColumn}>
                  <input placeholder="+ Add status" aria-label="New status name" value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} />
                  {newColumnName && <button className="btn primary" type="submit">Add status</button>}
                </form>
              </div>
              <DragOverlay>
                {activeCard ? (
                  <div className="card-drag-preview">
                    <div className="issue-kinds"><span className={`issue-type issue-type-${activeCard.issueType.toLowerCase()}`}>{activeCard.issueType}</span><span className={`issue-priority priority-${activeCard.priority.toLowerCase()}`}>{activeCard.priority}</span></div>
                    <CardView card={activeCard} dragging />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            {showActivity && (
              <aside className="activity sample-activity">
                <div className="activity-heading"><h3>Activity</h3><button className="btn ghost" aria-label="Close activity" onClick={() => setShowActivity(false)}>×</button></div>
                <ul>
                  {board.activity.map((entry) => (
                    <li key={entry.id}><Avatar name="Demo User" size={24} /><div><strong>Demo User</strong> {entry.text}<div className="muted small">{timeAgo(entry.createdAt)}</div></div></li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </section>
      </main>

      {(createIssue || openCard) && (
        <div className="modal-backdrop" onClick={() => { setCreateIssue(false); setOpenCardId(null); }}>
          <div className="modal sample-modal" role="dialog" aria-modal="true" aria-label={openCard ? "Issue details" : "Create issue"} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close btn ghost" onClick={() => { setCreateIssue(false); setOpenCardId(null); }} aria-label="Close">✕</button>
            {openCard ? (
              <>
                <div className="issue-modal-breadcrumb">Product Launch / {board.columns.find((column) => column.id === openCard.columnId)?.name}</div>
                <input
                  className="modal-title"
                  aria-label="Issue title"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => {
                    if (titleDraft.trim() && titleDraft.trim() !== openCard.title) updateCard(openCard.id, { title: titleDraft.trim() });
                    else if (!titleDraft.trim()) setTitleDraft(openCard.title);
                  }}
                />
                <div className="modal-grid">
                  <div>
                    <label>Description<textarea rows={6} placeholder="Add a description…" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} onBlur={() => {
                      if (descriptionDraft !== openCard.description) updateCard(openCard.id, { description: descriptionDraft });
                    }} /></label>
                    <h4>Comments</h4>
                    <ul className="comments">
                      {(board.comments[openCard.id] ?? []).map((item) => (
                        <li key={item.id}><Avatar name={item.author} size={26} /><div><strong>{item.author}</strong> <span className="muted small">{timeAgo(item.createdAt)}</span><p>{item.body}</p></div></li>
                      ))}
                      {!(board.comments[openCard.id] ?? []).length && <li className="muted">No comments yet.</li>}
                    </ul>
                    <form className="inline-form sample-comment-form" onSubmit={addComment}>
                      <input placeholder="Write a comment…" aria-label="Write a comment" value={comment} onChange={(event) => setComment(event.target.value)} />
                      <button className="btn primary" disabled={!comment.trim()}>Comment</button>
                    </form>
                  </div>
                  <div className="modal-side">
                    <label>Status<select value={openCard.columnId} onChange={(event) => {
                      const column = board.columns.find((item) => item.id === event.target.value);
                      if (!column || column.id === openCard.columnId) return;
                      setBoard((current) => ({
                        ...current,
                        columns: current.columns.map((item) => ({
                          ...item,
                          cards: item.id === column.id
                            ? [...item.cards, { ...openCard, columnId: column.id }]
                            : item.cards.filter((card) => card.id !== openCard.id),
                        })),
                      }));
                      recordActivity(`moved "${openCard.title}" to ${column.name}`);
                    }}>{board.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label>
                    <label>Issue type<select value={openCard.issueType} onChange={(event) => updateCard(openCard.id, { issueType: event.target.value as IssueType })}><option>Task</option><option>Bug</option><option>Story</option></select></label>
                    <label>Priority<select value={openCard.priority} onChange={(event) => updateCard(openCard.id, { priority: event.target.value as Priority })}><option>Highest</option><option>High</option><option>Medium</option><option>Low</option></select></label>
                    <label>Assignee<select value={openCard.assigneeId ?? ""} onChange={(event) => {
                      const person = people.find((item) => item.id === event.target.value);
                      updateCard(openCard.id, { assigneeId: person?.id ?? null, assignee: person ? { id: person.id, name: person.name } : null });
                    }}><option value="">Unassigned</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                    <label>Due date<input type="date" value={openCard.dueDate?.slice(0, 10) ?? ""} onChange={(event) => updateCard(openCard.id, { dueDate: event.target.value ? new Date(`${event.target.value}T17:00:00`).toISOString() : null })} /></label>
                    <button className="btn danger" onClick={() => deleteCard(openCard)}>Delete issue</button>
                  </div>
                </div>
              </>
            ) : (
              <form className="create-issue-form" onSubmit={submitIssue}>
                <p className="issue-modal-breadcrumb">Product Launch / Create issue</p>
                <h2>Create issue</h2>
                <label>Summary<input autoFocus placeholder="What needs to be done?" value={issueTitle} onChange={(event) => { setIssueTitle(event.target.value); setIssueError(""); }} /></label>
                <label>Description<textarea rows={4} placeholder="Add details (optional)" value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} /></label>
                <div className="create-issue-options">
                  <label>Status<select value={issueColumnId} onChange={(event) => setIssueColumnId(event.target.value)}>{board.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
                  <label>Issue type<select value={issueType} onChange={(event) => setIssueType(event.target.value as IssueType)}><option>Task</option><option>Bug</option><option>Story</option></select></label>
                  <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option>Highest</option><option>High</option><option>Medium</option><option>Low</option></select></label>
                </div>
                {issueError && <p className="error">{issueError}</p>}
                <div className="create-issue-actions"><button type="button" className="btn" onClick={() => setCreateIssue(false)}>Cancel</button><button type="submit" className="btn primary">Create</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
