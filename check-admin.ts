import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Verificar se o usuário admin existe
  const admin = await prisma.user.findUnique({
    where: { email: "admin@facchi.com.br" },
  });

  console.log("Usuário encontrado:", admin?.email);
  console.log("ID:", admin?.id);
  console.log("Role:", admin?.role);
  console.log("Tem password hash:", !!admin?.password);

  if (admin?.password) {
    // Testar se a senha "1234" é válida
    const isValid = await bcrypt.compare("1234", admin.password);
    console.log("Senha '1234' é válida:", isValid);

    // Mostrar o hash
    console.log("Password hash:", admin.password.substring(0, 20) + "...");
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
