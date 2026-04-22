import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  createContactListSchema,
  listContactListsSchema,
} from "@/lib/validation";
import { errors, created, successWithPagination } from "@/lib/api-response";

// ── POST /api/desktop/contact-lists — create empty list ──────
export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = createContactListSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const list = await prisma.contactList.create({
      data: {
        desktopUserId: auth.user.id,
        name: parsed.data.name,
        columns: [],
        emailColumn: "",
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

    return created(list);
  } catch (err) {
    console.error("[ContactList Create] Error:", err);
    return errors.serverError();
  }
}

// ── GET /api/desktop/contact-lists — list all lists ──────────
export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const parsed = listContactListsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where = { desktopUserId: auth.user.id };

    const [lists, total] = await Promise.all([
      prisma.contactList.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          columns: true,
          emailColumn: true,
          contactCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contactList.count({ where }),
    ]);

    return successWithPagination(lists, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[ContactList List] Error:", err);
    return errors.serverError();
  }
}
