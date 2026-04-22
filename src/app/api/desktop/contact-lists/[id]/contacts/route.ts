import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { listContactsSchema } from "@/lib/validation";
import { errors, success, successWithPagination } from "@/lib/api-response";
import { parseContactFile } from "@/lib/contact-import";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const BATCH_SIZE = 500;

// ── POST /api/desktop/contact-lists/:id/contacts — upload CSV/XLSX ─
export async function POST(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;

    // Verify ownership
    const list = await prisma.contactList.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });

    if (!list) return errors.notFound("Contact list");
    if (list.desktopUserId !== auth.user.id) return errors.forbidden();

    // Parse multipart form data
    const formData = await req.formData().catch(() => null);
    if (!formData) return errors.badRequest("Expected multipart form data");

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return errors.badRequest("Missing 'file' field (CSV or XLSX)");
    }

    if (file.size > MAX_FILE_SIZE) {
      return errors.badRequest(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = parseContactFile(buffer, file.name);
    } catch (err) {
      return errors.badRequest(
        err instanceof Error ? err.message : "Failed to parse file",
      );
    }

    if (parsed.rows.length === 0) {
      return errors.badRequest("No valid contacts found in file");
    }

    // Insert contacts in batches, skip duplicates within this list
    let inserted = 0;
    let skippedDuplicates = parsed.duplicatesRemoved;

    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const batch = parsed.rows.slice(i, i + BATCH_SIZE);

      const result = await prisma.contact.createMany({
        data: batch.map((row) => ({
          contactListId: id,
          email: row.email,
          data: row.data,
        })),
        skipDuplicates: true,
      });

      inserted += result.count;
      skippedDuplicates += batch.length - result.count;
    }

    // Update list metadata
    await prisma.contactList.update({
      where: { id },
      data: {
        columns: parsed.columns,
        emailColumn: parsed.emailColumn,
        contactCount: { increment: inserted },
      },
    });

    return success({
      imported: inserted,
      duplicatesSkipped: skippedDuplicates,
      columns: parsed.columns,
      emailColumn: parsed.emailColumn,
    });
  } catch (err) {
    console.error("[Contacts Upload] Error:", err);
    return errors.serverError();
  }
}

// ── GET /api/desktop/contact-lists/:id/contacts — list contacts ─
export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;

    // Verify ownership
    const list = await prisma.contactList.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });

    if (!list) return errors.notFound("Contact list");
    if (list.desktopUserId !== auth.user.id) return errors.forbidden();

    const url = new URL(req.url);
    const parsed = listContactsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: { contactListId: id },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          data: true,
          createdAt: true,
        },
      }),
      prisma.contact.count({ where: { contactListId: id } }),
    ]);

    return successWithPagination(contacts, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[Contacts List] Error:", err);
    return errors.serverError();
  }
}
