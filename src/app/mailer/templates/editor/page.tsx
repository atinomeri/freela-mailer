"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Code2, LayoutTemplate, Type } from "lucide-react";
import { MailerLoginPage } from "../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type EditorMode = "drag" | "rich" | "code";

export default function MailerTemplateChooserPage() {
  const { user } = useMailerAuth();
  const router = useRouter();
  const t = useTranslations("mailer.templatesEditor");

  if (!user) return <MailerLoginPage />;

  function pick(mode: EditorMode) {
    router.push(`/mailer/templates/editor/${mode}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#F8FAFC] dark:bg-[#0B0E11] animate-[fadeIn_220ms_ease-out]">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 dark:border-[#1F2937] dark:bg-[#161B22] sm:px-6">
        <Link
          href="/mailer/templates"
          className="inline-flex h-9 items-center gap-1.5 rounded-[14px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-[#1F2937] dark:bg-[#161B22] dark:text-slate-200 dark:hover:bg-[#1F2937]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </Link>

        <Stepper
          steps={[
            { label: t("chooser.stepSettings"), state: "done" },
            { label: t("chooser.stepDesign"), state: "active" },
            { label: t("chooser.stepReview"), state: "todo" },
          ]}
        />

        <Button size="md" disabled className="rounded-[14px] opacity-60">
          {t("chooser.continue")}
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-5xl text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[32px]">
            {t("chooser.title")}
          </h1>
          <p className="mt-3 text-[15px] text-slate-500 dark:text-slate-400">
            {t("chooser.subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ModeCard
            tone="indigo"
            icon={<LayoutTemplate className="h-5 w-5" strokeWidth={2.1} />}
            title={t("chooser.drag.name")}
            description={t("chooser.drag.description")}
            cta={t("chooser.start")}
            onClick={() => pick("drag")}
          />
          <ModeCard
            tone="emerald"
            icon={<Type className="h-5 w-5" strokeWidth={2.1} />}
            title={t("chooser.rich.name")}
            description={t("chooser.rich.description")}
            cta={t("chooser.start")}
            onClick={() => pick("rich")}
          />
          <ModeCard
            tone="amber"
            icon={<Code2 className="h-5 w-5" strokeWidth={2.1} />}
            title="HTML Code"
            description="Hand-write raw HTML with a live side-by-side preview."
            cta={t("chooser.start")}
            onClick={() => pick("code")}
          />
        </div>
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.985); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function Stepper({
  steps,
}: {
  steps: Array<{ label: string; state: "done" | "active" | "todo" }>;
}) {
  return (
    <ol className="hidden items-center gap-3 md:flex">
      {steps.map((step, idx) => (
        <li key={step.label} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition-colors",
                step.state === "done" && "bg-emerald-500 text-white",
                step.state === "active" && "bg-indigo-600 text-white",
                step.state === "todo" && "border border-slate-200 bg-white text-slate-400 dark:border-[#1F2937] dark:bg-[#161B22]",
              )}
            >
              {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </span>
            <span
              className={cn(
                "text-[13px] font-semibold tracking-tight",
                step.state === "todo" ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100",
              )}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <span className="h-px w-10 bg-slate-200 dark:bg-[#1F2937]" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

function ModeCard({
  tone,
  icon,
  title,
  description,
  cta,
  onClick,
}: {
  tone: "indigo" | "emerald" | "amber";
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  const toneClass = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-5 rounded-[32px] border border-slate-100 bg-white p-7 text-left transition-all duration-250",
        "hover:-translate-y-1 hover:scale-[1.01] hover:border-indigo-200 hover:shadow-[0_24px_48px_-24px_rgba(79,70,229,0.35)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        "dark:border-[#1F2937] dark:bg-[#161B22] dark:hover:border-indigo-500/40 dark:hover:shadow-[0_24px_48px_-24px_rgba(99,102,241,0.45)]",
      )}
    >
      <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", toneClass)}>
        {icon}
      </span>
      <div className="space-y-2">
        <h3 className="text-[18px] font-bold tracking-tight text-slate-950 dark:text-slate-50">
          {title}
        </h3>
        <p className="text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <div className="mt-auto inline-flex w-full items-center gap-1.5 border-t border-slate-100 pt-4 text-[13.5px] font-semibold text-indigo-600 transition-colors group-hover:gap-2 dark:border-[#1F2937] dark:text-indigo-300">
        {cta}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
