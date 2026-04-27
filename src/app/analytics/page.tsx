"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow="Analytics"
        title="ანალიტიკა"
        description="Detailed campaign analytics will be added here later."
      />
      <SectionCard padded={false} bodyClassName="p-8">
        <div className="min-h-[240px]" />
      </SectionCard>
    </div>
  );
}
