import { PrismaClient, NodeType, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const board = await prisma.board.upsert({
    where: { id: 1 },
    update: { name: 'Weekly Flow' },
    create: { name: 'Weekly Flow' },
  });

  const flows = await Promise.all([
    prisma.flow.upsert({
      where: { id: 1 },
      update: { name: 'Flow 1', color: '#ff0000', yLane: 0, boardId: board.id },
      create: { id: 1, name: 'Flow 1', color: '#ff0000', yLane: 0, boardId: board.id },
    }),
    prisma.flow.upsert({
      where: { id: 2 },
      update: { name: 'Flow 2', color: '#00ff00', yLane: 100, boardId: board.id },
      create: { id: 2, name: 'Flow 2', color: '#00ff00', yLane: 100, boardId: board.id },
    }),
  ]);

  await prisma.node.deleteMany({ where: { boardId: board.id } });
  await prisma.edge.deleteMany({ where: { boardId: board.id } });

  await prisma.node.createMany({
    data: [
      {
        id: 1,
        boardId: board.id,
        flowId: flows[0].id,
        type: NodeType.task,
        status: TaskStatus.todo,
        tags: JSON.stringify(['setup']),
        journaledAt: null,
        x: 100,
        y: 50,
        width: 220,
        height: 120,
        title: 'Wireframe onboarding',
        content: 'Sketch welcome flow variations and pick v1 focus.',
      },
      {
        id: 2,
        boardId: board.id,
        flowId: flows[1].id,
        type: NodeType.note,
        status: null,
        tags: JSON.stringify(['ideas']),
        journaledAt: null,
        x: 360,
        y: 140,
        width: 200,
        height: 120,
        title: 'Research notes',
        content: 'Collect async collaboration references: Linear, Figma, Excalidraw.',
      },
      {
        id: 3,
        boardId: board.id,
        flowId: flows[0].id,
        type: NodeType.journal,
        status: null,
        tags: JSON.stringify(['retro']),
        journaledAt: new Date(),
        x: 640,
        y: 260,
        width: 220,
        height: 140,
        title: 'Sprint retrospective',
        content: 'Captured wins, blockers, follow-up tasks. Sync with Ryugi.',
      },
    ],
  });

  await prisma.edge.create({
    data: {
      id: 1,
      boardId: board.id,
      sourceNodeId: 1,
      targetNodeId: 2,
    },
  });
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
