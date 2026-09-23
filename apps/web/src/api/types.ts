export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  boardCount: number;
  memberCount: number;
}

export interface Member extends User {
  role: Role;
}

export interface BoardSummary {
  id: string;
  name: string;
  workspaceId: string;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  role: Role;
  boards: BoardSummary[];
  members: Member[];
}

export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  _count?: { comments: number };
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: number;
  cards: Card[];
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  role: Role;
  columns: Column[];
  members: Member[];
}

export interface Activity {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string };
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface CardDetail extends Card {
  comments: Comment[];
  activity: Activity[];
}

export interface Notification {
  id: string;
  type: string;
  data: { cardTitle?: string; actorName?: string; boardId?: string; excerpt?: string; dueDate?: string };
  readAt: string | null;
  createdAt: string;
}
