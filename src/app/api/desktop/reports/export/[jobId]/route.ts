import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { jobId } = await params;

    const job = await prisma.reportExportJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        desktopUserId: true,
        section: true,
        format: true,
        status: true,
        rowCount: true,
        fileName: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) return errors.notFound("Export job");
    if (job.desktopUserId !== auth.user.id) return errors.forbidden();

    return success({
      id: job.id,
      section: job.section,
      format: job.format,
      status: job.status,
      rowCount: job.rowCount,
      fileName: job.fileName,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      downloadUrl:
        job.status === "COMPLETED"
          ? `/api/desktop/reports/export/${job.id}/download`
          : null,
    });
  } catch (err) {
    console.error("[Reports Export Status] Error:", err);
    return errors.serverError();
  }
}

