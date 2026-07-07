// Идемпотентный бутстрап оператора платформы для уже засеянной БД (Railway).
// Запуск: npm run db:ensure-ops
// Пароль: env PLATFORM_ADMIN_PASSWORD (иначе demo123 — сменить через сброс пароля!)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org_platform" },
    update: {},
    create: { id: "org_platform", name: "DebtFlow", type: "PLATFORM", status: "ACTIVE" },
  });
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "demo123";
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email: "ops@debtflow.uz" } });
  if (existing) {
    console.log("Оператор платформы уже существует:", existing.email);
    return;
  }
  await prisma.user.create({
    data: {
      id: "u_platform",
      orgId: org.id,
      name: "Оператор DebtFlow",
      email: "ops@debtflow.uz",
      role: "PLATFORM_ADMIN",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
  console.log("Создан оператор платформы: ops@debtflow.uz");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
