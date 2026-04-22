import "server-only";

export interface BuiltInMailerTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
  description: string;
  builtIn: true;
}

export const BUILTIN_MAILER_TEMPLATES: BuiltInMailerTemplate[] = [
  {
    id: "builtin_blank",
    name: "Blank",
    category: "basic",
    subject: "",
    html: "",
    description: "Start from a blank template.",
    builtIn: true,
  },
  {
    id: "builtin_simple_text",
    name: "Simple Text",
    category: "basic",
    subject: "Hello [[Name]]",
    html: "<p>Hello [[Name]],</p><p>Your message goes here.</p><p>Best regards,<br/>Team</p>",
    description: "Minimal text email for personal outreach.",
    builtIn: true,
  },
  {
    id: "builtin_promo",
    name: "Promotional Offer",
    category: "marketing",
    subject: "Special offer for [[Name]]",
    html:
      '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#111">' +
      "<h1>Special Offer</h1>" +
      "<p>Hello [[Name]], we have an exclusive discount for you.</p>" +
      '<p><a href="#" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Claim Offer</a></p>' +
      "</div>",
    description: "CTA-focused promotional email.",
    builtIn: true,
  },
  {
    id: "builtin_newsletter",
    name: "Newsletter",
    category: "marketing",
    subject: "Weekly update for [[Name]]",
    html:
      '<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#111">' +
      "<h2>Weekly Newsletter</h2>" +
      "<p>Hi [[Name]], here are this week's updates:</p>" +
      "<ul><li>Update #1</li><li>Update #2</li><li>Update #3</li></ul>" +
      '<p><a href="#" style="color:#2563eb">Read more</a></p>' +
      "</div>",
    description: "Structured weekly newsletter layout.",
    builtIn: true,
  },
  {
    id: "builtin_welcome",
    name: "Welcome Email",
    category: "transactional",
    subject: "Welcome, [[Name]]",
    html:
      '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#111">' +
      "<h1>Welcome</h1>" +
      "<p>Hi [[Name]], thanks for joining us.</p>" +
      "<p>Here are your next steps:</p>" +
      "<ol><li>Complete profile</li><li>Explore features</li><li>Contact support anytime</li></ol>" +
      "</div>",
    description: "Onboarding template for new users.",
    builtIn: true,
  },
  {
    id: "builtin_feedback",
    name: "Feedback Request",
    category: "transactional",
    subject: "[[Name]], we value your feedback",
    html:
      '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#111">' +
      "<h2>How are we doing?</h2>" +
      "<p>Hi [[Name]], we'd love your feedback.</p>" +
      '<p><a href="#" style="display:inline-block;background:#f59e0b;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Share feedback</a></p>' +
      "</div>",
    description: "Short NPS/feedback email template.",
    builtIn: true,
  },
];

