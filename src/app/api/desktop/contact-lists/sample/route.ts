import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { created, errors } from "@/lib/api-response";

const SAMPLE_ROWS = [
  { email: "test1@example.com", data: { firstName: "Test", lastName: "One" } },
  { email: "test2@example.com", data: { firstName: "Test", lastName: "Two" } },
  { email: "test3@example.com", data: { firstName: "Test", lastName: "Three" } },
];

function sampleSeedAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.MAILER_ENABLE_SAMPLE_CONTACTS === "true";
}

// POST /api/desktop/contact-lists/sample — create sample list with dummy contacts
export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    if (!sampleSeedAllowed()) {
      return errors.forbidden("Sample contacts are disabled in production.");
    }

    const createdList = await prisma.$transaction(async (tx) => {
      const list = await tx.contactList.create({
        data: {
          desktopUserId: auth.user.id,
          name: `Sample List ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
          columns: ["firstName", "lastName"],
          emailColumn: "email",
        },
        select: {
          id: true,
          name: true,
          columns: true,
          emailColumn: true,
          contactCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const inserted = await tx.contact.createMany({
        data: SAMPLE_ROWS.map((row) => ({
          contactListId: list.id,
          email: row.email,
          data: row.data,
        })),
        skipDuplicates: true,
      });

      return tx.contactList.update({
        where: { id: list.id },
        data: {
          contactCount: inserted.count,
        },
        select: {
          id: true,
          name: true,
          columns: true,
          emailColumn: true,
          contactCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return created(createdList);
  } catch (err) {
    console.error("[ContactList Sample Create] Error:", err);
    return errors.serverError();
  }
}
