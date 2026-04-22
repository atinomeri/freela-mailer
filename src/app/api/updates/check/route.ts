import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { version, platform } = await req.json();

    if (!version) {
      return NextResponse.json({ available: false });
    }

    // Find the latest active release
    const latestRelease = await prisma.appRelease.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!latestRelease) {
      return NextResponse.json({ available: false });
    }

    if (isNewer(latestRelease.version, version)) {
      // Mocked sha256 and file_size since they aren't in AppRelease model yet (based on schema)
      // Client might need these, but we can send empty/0 if we don't track them.
      return NextResponse.json({
        available: true,
        version: latestRelease.version,
        download_url: latestRelease.downloadUrl,
        changelog: latestRelease.releaseNotes || "",
        sha256: "", // In a real scenario, this would be read from the DB or file
        file_size: 0, // In a real scenario, this would be read from the DB or file
        mandatory: latestRelease.isMandatory,
      });
    }

    return NextResponse.json({ available: false });
  } catch (e) {
    console.error("[Updates Check] Error checking updates:", e);
    return NextResponse.json({ available: false });
  }
}
