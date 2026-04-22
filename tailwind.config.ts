import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-georgian)", ...defaultTheme.fontFamily.sans]
      },
      fontSize: {
        h1: ["var(--font-size-h1)", { lineHeight: "var(--line-height-heading)", letterSpacing: "-0.025em", fontWeight: "800" }],
        h2: ["var(--font-size-h2)", { lineHeight: "var(--line-height-heading)", letterSpacing: "-0.02em", fontWeight: "700" }],
        h3: ["var(--font-size-h3)", { lineHeight: "var(--line-height-heading)", letterSpacing: "-0.015em", fontWeight: "600" }],
        body: ["var(--font-size-body)", { lineHeight: "var(--line-height-body)", fontWeight: "400" }],
        small: ["var(--font-size-small)", { lineHeight: "1.45", fontWeight: "400" }]
      },
      spacing: {
        s1: "var(--space-1)",
        s2: "var(--space-2)",
        s3: "var(--space-3)",
        s4: "var(--space-4)",
        s6: "var(--space-6)",
        s8: "var(--space-8)"
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        success: "hsl(var(--success))",
        "success-foreground": "hsl(var(--success-foreground))",
        warning: "hsl(var(--warning))",
        "warning-foreground": "hsl(var(--warning-foreground))",
        ring: "hsl(var(--ring))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))"
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 6px)"
      },
      boxShadow: {
        soft: "0 8px 24px rgba(15, 23, 42, 0.08)",
        "soft-lg": "0 14px 36px rgba(15, 23, 42, 0.12)",
        glow: "0 0 20px hsl(var(--primary) / 0.3)",
        "glow-sm": "0 0 10px hsl(var(--primary) / 0.2)"
      },
      keyframes: {
        "page-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" }
        },
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" }
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" }
        }
      },
      animation: {
        "page-in": "page-in 180ms ease-out",
        "fade-in": "fade-in 200ms ease-out",
        "fade-out": "fade-out 150ms ease-in",
        "slide-up": "slide-up 200ms ease-out",
        "slide-down": "slide-down 200ms ease-out",
        "slide-in-right": "slide-in-right 200ms ease-out",
        "scale-in": "scale-in 200ms ease-out",
        "spin-slow": "spin-slow 3s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        bounce: "bounce 1s ease-in-out infinite",
        wiggle: "wiggle 200ms ease-in-out"
      },
      transitionDuration: {
        "250": "250ms",
        "350": "350ms"
      },
      transitionTimingFunction: {
        "ease-spring": "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      }
    }
  },
  plugins: []
} satisfies Config;
