import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors } from "@/lib/api-response";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { jobId } = await params;

    const job = await prisma.reportExportJob.findUnique({
      where: { id: jobId },
      select: {
        desktopUserId: true,
        status: true,
        fileName: true,
        filePath: true,
      },
    });
    if (!job) return errors.notFound("Export job");
    if (job.desktopUserId !== auth.user.id) return errors.forbidden();
    if (job.status !== "COMPLETED" || !job.fileName || !job.filePath) {
      return errors.badRequest("Export is not ready");
    }

    const file = await fs.readFile(job.filePath);
    const isXlsx = job.fileName.toLowerCase().endsWith(".xlsx");
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": isXlsx
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${job.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Reports Export Download] Error:", err);
    return errors.serverError();
  }
}

