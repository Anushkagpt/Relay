import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const demo = await prisma.user.upsert({
    where: { email: "demo@relay.dev" },
    update: {},
    create: { email: "demo@relay.dev", name: "Demo User", passwordHash },
  });
  const teammate = await prisma.user.upsert({
    where: { email: "sam@relay.dev" },
    update: {},
    create: { email: "sam@relay.dev", name: "Sam Rivera", passwordHash },
  });

  const existing = await prisma.membership.findFirst({ where: { userId: demo.id } });
  if (existing) return console.log("Seed data already present");

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      memberships: { create: [{ userId: demo.id, role: "OWNER" }, { userId: teammate.id, role: "MEMBER" }] },
    },
  });
  const board = await prisma.board.create({ data: { name: "Product Launch", workspaceId: workspace.id } });
  const [todo, doing, done] = await Promise.all(
    ["To do", "In progress", "Done"].map((name, i) =>
      prisma.column.create({ data: { name, boardId: board.id, position: (i + 1) * 1024 } }),
    ),
  );
  const cards = [
    { title: "Write launch blog post", columnId: todo.id, assigneeId: teammate.id, dueDate: new Date(Date.now() + 36 * 3600 * 1000) },
    { title: "Set up status page", columnId: todo.id },
    { title: "Load test the API", columnId: doing.id, assigneeId: demo.id, dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    { title: "Design onboarding flow", columnId: done.id },
  ];
  for (const [i, c] of cards.entries()) {
    const card = await prisma.card.create({
      data: { ...c, boardId: board.id, createdById: demo.id, position: (i + 1) * 1024 },
    });
    await prisma.activity.create({
      data: { boardId: board.id, cardId: card.id, actorId: demo.id, type: "card.created", data: { title: c.title, column: [todo, doing, done].find((x) => x.id === c.columnId)!.name } },
    });
    if (i === 0) {
      await prisma.comment.create({ data: { cardId: card.id, authorId: teammate.id, body: "Draft is in the shared doc, will polish tomorrow." } });
    }
  }
  console.log("Seeded demo@relay.dev / password123");
}

main().finally(() => prisma.$disconnect());
