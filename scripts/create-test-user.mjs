import { prisma } from "../src/lib/prisma.ts";
import bcrypt from "bcryptjs";

async function main() {
  const email = "admin@freela.ge";
  const password = "password";
  
  const existingUser = await prisma.desktopUser.findUnique({ where: { email } });
  if (existingUser) {
    console.log(`User ${email} already exists. Password should be 'password'.`);
    return;
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  await prisma.desktopUser.create({
    data: {
      email,
      passwordHash,
      userType: "INDIVIDUAL",
      phone: "+995555555555",
      isAdmin: true,
      balance: 1000,
    }
  });
  
  console.log(`Created test user: ${email} / ${password}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
