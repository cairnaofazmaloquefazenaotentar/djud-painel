import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("1234", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@facchi.com.br" },
    update: {
      password: hashedPassword,
      role: "ADMIN",
    },
    create: {
      name: "Super Admin",
      email: "admin@facchi.com.br",
      password: hashedPassword,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  console.log("Super Admin criado:", admin.email, "| role:", admin.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
