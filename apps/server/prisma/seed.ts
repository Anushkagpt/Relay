import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const password = "password123";

async function ensureUser(email: string, name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const [demo, teammate, admin, viewer] = await Promise.all([
    ensureUser("demo@relay.dev", "Demo User", passwordHash),
    ensureUser("sam@relay.dev", "Sam Rivera", passwordHash),
    ensureUser("alex@relay.dev", "Alex Morgan", passwordHash),
    ensureUser("taylor@relay.dev", "Taylor Kim", passwordHash),
  ]);
  const users = [demo, teammate, admin, viewer];

  let workspace = await prisma.workspace.findFirst({
    where: { name: "Demo Workspace", memberships: { some: { userId: demo.id } } },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: "Demo Workspace", memberships: { create: { userId: demo.id, role: "OWNER" } } },
    });
  }

  const memberships: Array<{ userId: string; role: Role }> = [
    { userId: demo.id, role: "OWNER" },
    { userId: teammate.id, role: "MEMBER" },
    { userId: admin.id, role: "ADMIN" },
    { userId: viewer.id, role: "VIEWER" },
  ];
  for (const membership of memberships) {
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: membership.userId, workspaceId: workspace.id } },
      update: { role: membership.role },
      create: { ...membership, workspaceId: workspace.id },
    });
  }

  const boardDefinitions = [
    {
      name: "Product Launch",
      cards: [
        { title: "Write launch blog post", column: "To do", assignee: teammate, dueInDays: 2, description: "Draft the announcement, add product screenshots, and prepare the final review copy." },
        { title: "Set up status page", column: "To do", assignee: null, dueInDays: 5, description: "Publish uptime, incident history, and service subscription details." },
        { title: "Prepare launch email", column: "To do", assignee: admin, dueInDays: 4, description: "Coordinate the customer announcement and link to the release notes." },
        { title: "Confirm launch checklist", column: "To do", assignee: demo, dueInDays: -1, description: "Review analytics, support coverage, rollout owner, and rollback plan." },
        { title: "Load test the API", column: "In progress", assignee: demo, dueInDays: 7, description: "Run the launch traffic profile and share latency and error-rate results." },
        { title: "Add billing dashboard", column: "In progress", assignee: teammate, dueInDays: 3, description: "Show plan, invoice history, and payment method in account settings." },
        { title: "Review onboarding copy", column: "Review", assignee: admin, dueInDays: 1, description: "Check terminology, links, and the first-project experience." },
        { title: "Design onboarding flow", column: "Done", assignee: demo, dueInDays: -3, description: "Approved flow for new workspace owners." },
        { title: "Create launch graphics", column: "Done", assignee: teammate, dueInDays: -6, description: "Exported web and social sizes from the approved design." },
      ],
    },
    {
      name: "Marketing Campaign",
      cards: [
        { title: "Draft customer case study", column: "To do", assignee: teammate, dueInDays: 6, description: "Interview a pilot customer and capture measurable outcomes." },
        { title: "Schedule social posts", column: "In progress", assignee: admin, dueInDays: 2, description: "Prepare launch-week posts for the company channels." },
        { title: "Approve campaign landing page", column: "Review", assignee: demo, dueInDays: 1, description: "Final check of copy, links, and signup conversion tracking." },
        { title: "Collect beta feedback", column: "Done", assignee: viewer, dueInDays: -2, description: "Summarize feedback from the first customer cohort." },
      ],
    },
  ] as const;

  const cardByTitle = new Map<string, { id: string; boardId: string }>();
  for (const [boardIndex, definition] of boardDefinitions.entries()) {
    let board = await prisma.board.findFirst({ where: { workspaceId: workspace.id, name: definition.name } });
    if (!board) board = await prisma.board.create({ data: { workspaceId: workspace.id, name: definition.name } });

    const columnNames = ["To do", "In progress", "Review", "Done"];
    const columns = new Map<string, { id: string }>();
    for (const [index, name] of columnNames.entries()) {
      let column = await prisma.column.findFirst({ where: { boardId: board.id, name } });
      if (!column) {
        column = await prisma.column.create({ data: { boardId: board.id, name, position: (index + 1) * 1024 } });
      } else {
        await prisma.column.update({ where: { id: column.id }, data: { position: (index + 1) * 1024 } });
      }
      columns.set(name, column);
    }

    const positions = new Map<string, number>();
    for (const cardData of definition.cards) {
      const column = columns.get(cardData.column);
      if (!column) throw new Error(`Missing column "${cardData.column}" for "${definition.name}"`);
      const position = (positions.get(cardData.column) ?? 0) + 1024;
      positions.set(cardData.column, position);
      const dueDate = new Date(Date.now() + cardData.dueInDays * 24 * 60 * 60 * 1000);
      let card = await prisma.card.findFirst({ where: { boardId: board.id, title: cardData.title } });
      const cardFields = {
        columnId: column.id,
        description: cardData.description,
        position,
        dueDate,
        assigneeId: cardData.assignee?.id ?? null,
        createdById: demo.id,
      };
      if (!card) {
        card = await prisma.card.create({
          data: { boardId: board.id, title: cardData.title, ...cardFields },
        });
      } else {
        card = await prisma.card.update({ where: { id: card.id }, data: cardFields });
      }
      cardByTitle.set(cardData.title, { id: card.id, boardId: board.id });

      const activityExists = await prisma.activity.findFirst({
        where: { boardId: board.id, cardId: card.id, type: "card.created" },
      });
      if (!activityExists) {
        await prisma.activity.create({
          data: {
            boardId: board.id,
            cardId: card.id,
            actorId: demo.id,
            type: "card.created",
            data: { title: card.title, column: cardData.column },
          },
        });
      }
    }

    const boardActivityExists = await prisma.activity.findFirst({
      where: { boardId: board.id, cardId: null, type: "board.created" },
    });
    if (!boardActivityExists) {
      await prisma.activity.create({
        data: { boardId: board.id, actorId: demo.id, type: "board.created", data: { title: board.name } },
      });
    }

    if (boardIndex === 0) {
      const launchCard = cardByTitle.get("Write launch blog post");
      if (launchCard) {
        const commentBody = "Draft is in the shared doc. I’ll polish the screenshots and send it for review tomorrow.";
        const commentExists = await prisma.comment.findFirst({
          where: { cardId: launchCard.id, body: commentBody },
        });
        if (!commentExists) {
          await prisma.comment.create({ data: { cardId: launchCard.id, authorId: teammate.id, body: commentBody } });
        }
      }
    }
  }

  const notificationExamples = [
    {
      userId: demo.id,
      type: "card.commented",
      cardTitleForLookup: "Load test the API",
      data: { cardTitle: "Load test the API", actorName: teammate.name, excerpt: "I've added the latest performance numbers for review." },
    },
    {
      userId: demo.id,
      type: "card.due_soon",
      cardTitleForLookup: "Review onboarding copy",
      data: { cardTitle: "Review onboarding copy", dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    },
    {
      userId: teammate.id,
      type: "card.assigned",
      cardTitleForLookup: "Write launch blog post",
      data: { cardTitle: "Write launch blog post", actorName: demo.name },
    },
  ];
  for (const notification of notificationExamples) {
    const card = cardByTitle.get(notification.cardTitleForLookup);
    if (!card) continue;
    const exists = await prisma.notification.findFirst({
      where: { userId: notification.userId, type: notification.type },
    });
    if (!exists) {
      await prisma.notification.create({
        data: {
          userId: notification.userId,
          type: notification.type,
          data: { ...notification.data, boardId: card.boardId, cardId: card.id },
        },
      });
    }
  }

  console.log(`Seeded demo workspace with ${users.length} accounts and ${boardDefinitions.length} boards.`);
  console.log("Login: demo@relay.dev / password123");
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed demo data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
