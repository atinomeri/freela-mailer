import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { mergeContactListsSchema } from "@/lib/validation";
import { errors, success } from "@/lib/api-response";
import type { Prisma } from "@prisma/client";

const BATCH_SIZE = 500;

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = mergeContactListsSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const listIds = Array.from(new Set(parsed.data.listIds));
    if (listIds.length === 1) {
      const single = await prisma.contactList.findUnique({
        where: { id: listIds[0] },
        select: { id: true, desktopUserId: true, name: true, contactCount: true },
      });
      if (!single) return errors.notFound("Contact list");
      if (single.desktopUserId !== auth.user.id) return errors.forbidden();
      return success({
        id: single.id,
        name: single.name,
        contactCount: single.contactCount,
        created: false,
      });
    }

    const lists = await prisma.contactList.findMany({
      where: {
        id: { in: listIds },
        desktopUserId: auth.user.id,
      },
      select: {
        id: true,
        name: true,
        columns: true,
      },
    });
    if (lists.length !== listIds.length) {
      return errors.badRequest("One or more contact lists are invalid.");
    }

    const contacts = await prisma.contact.findMany({
      where: { contactListId: { in: listIds } },
      select: {
        email: true,
        data: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const dedup = new Map<string, Prisma.InputJsonValue>();
    for (const contact of contacts) {
      const email = contact.email.trim().toLowerCase();
      if (!email) continue;
      if (dedup.has(email)) continue;
      dedup.set(
        email,
        contact.data && typeof contact.data === "object"
          ? (contact.data as Prisma.JsonObject)
          : ({} as Prisma.JsonObject),
      );
    }

    const created = await prisma.contactList.create({
      data: {
        desktopUserId: auth.user.id,
        name:
          parsed.data.name ||
          `Merged audience (${new Date().toISOString().slice(0, 10)})`,
        columns: ["email"],
        emailColumn: "email",
        contactCount: 0,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const rows = Array.from(dedup.entries());
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await prisma.contact.createMany({
        data: batch.map(([email, data]) => ({
          contactListId: created.id,
          email,
          data,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.contactList.update({
      where: { id: created.id },
      data: {
        contactCount: rows.length,
      },
    });

    return success({
      id: created.id,
      name: created.name,
      contactCount: rows.length,
      created: true,
    });
  } catch (err) {
    console.error("[Contact Lists Merge] Error:", err);
    return errors.serverError();
  }
}
