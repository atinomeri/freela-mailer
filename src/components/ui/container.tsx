import { cn } from "@/lib/utils";

type ContainerWidth = "narrow" | "default" | "wide" | "full";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: ContainerWidth;
}

const widthClasses: Record<ContainerWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export function Container({
  className,
  width = "default",
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-8", widthClasses[width], className)}
      {...props}
    />
  );
}
