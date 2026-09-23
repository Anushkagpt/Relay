/**
 * API integration tests. They need a real Postgres (DATABASE_URL); CI provides
 * one as a service container. Locally: `docker compose up -d postgres`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const hasDb = !!process.env.DATABASE_URL;
const app = createApp();
const stamp = Date.now();

async function signUp(name: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: `${name}-${stamp}@relay.test`, name, password: "password123" });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, id: res.body.user.id as string, cookie: res.headers["set-cookie"] };
}

describe.skipIf(!hasDb)("API", () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let outsider: Awaited<ReturnType<typeof signUp>>;
  let viewer: Awaited<ReturnType<typeof signUp>>;
  let workspaceId: string;
  let boardId: string;
  let columns: { id: string; name: string }[];

  beforeAll(async () => {
    owner = await signUp("owner");
    outsider = await signUp("outsider");
    viewer = await signUp("viewer");
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a workspace and a board with default columns", async () => {
    const ws = await request(app).post("/api/workspaces").set("Authorization", `Bearer ${owner.token}`).send({ name: "Acme" });
    expect(ws.status).toBe(201);
    workspaceId = ws.body.workspace.id;
    const board = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Launch" });
    expect(board.status).toBe(201);
    boardId = board.body.board.id;
    const full = await request(app).get(`/api/boards/${boardId}`).set("Authorization", `Bearer ${owner.token}`);
    columns = full.body.board.columns;
    expect(columns.map((c) => c.name)).toEqual(["To do", "In progress", "Done"]);
  });

  it("hides other tenants' boards", async () => {
    const res = await request(app).get(`/api/boards/${boardId}`).set("Authorization", `Bearer ${outsider.token}`);
    expect(res.status).toBe(404);
  });

  it("orders cards and moves them between columns", async () => {
    const auth = { Authorization: `Bearer ${owner.token}` };
    const a = await request(app).post(`/api/columns/${columns[0].id}/cards`).set(auth).send({ title: "A" });
    const b = await request(app).post(`/api/columns/${columns[0].id}/cards`).set(auth).send({ title: "B" });
    const c = await request(app).post(`/api/columns/${columns[0].id}/cards`).set(auth).send({ title: "C" });
    // Move C between A and B
    await request(app).post(`/api/cards/${c.body.card.id}/move`).set(auth).send({ columnId: columns[0].id, beforeId: a.body.card.id, afterId: b.body.card.id }).expect(200);
    let board = await request(app).get(`/api/boards/${boardId}`).set(auth);
    expect(board.body.board.columns[0].cards.map((x: { title: string }) => x.title)).toEqual(["A", "C", "B"]);
    // Move B to Done
    await request(app).post(`/api/cards/${b.body.card.id}/move`).set(auth).send({ columnId: columns[2].id }).expect(200);
    board = await request(app).get(`/api/boards/${boardId}`).set(auth);
    expect(board.body.board.columns[2].cards.map((x: { title: string }) => x.title)).toEqual(["B"]);
    const activity = await request(app).get(`/api/boards/${boardId}/activity`).set(auth);
    expect(activity.body.activity[0].type).toBe("card.moved");
  });

  it("lets viewers read but not write", async () => {
    await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: `viewer-${stamp}@relay.test`, role: "VIEWER" })
      .expect(201);
    const auth = { Authorization: `Bearer ${viewer.token}` };
    await request(app).get(`/api/boards/${boardId}`).set(auth).expect(200);
    await request(app).post(`/api/columns/${columns[0].id}/cards`).set(auth).send({ title: "nope" }).expect(403);
  });

  it("notifies the assignee (inline without Redis)", async () => {
    const auth = { Authorization: `Bearer ${owner.token}` };
    await request(app).post(`/api/columns/${columns[1].id}/cards`).set(auth).send({ title: "Review", assigneeId: viewer.id }).expect(201);
    const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${viewer.token}`);
    expect(res.body.notifications[0].type).toBe("card.assigned");
    expect(res.body.unread).toBeGreaterThan(0);
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const first = await request(app).post("/api/auth/refresh").set("Cookie", owner.cookie).expect(200);
    expect(first.body.accessToken).toBeTruthy();
    // Replaying the old cookie is reuse: rejected, and all sessions are revoked.
    await request(app).post("/api/auth/refresh").set("Cookie", owner.cookie).expect(401);
    await request(app).post("/api/auth/refresh").set("Cookie", first.headers["set-cookie"]).expect(401);
  });
});
