# FREELA Mailer Agent Instructions

You are working on FREELA Mailer, a SaaS email-sending web application.

## Product goal
FREELA Mailer must be simple for non-technical users.
Users should easily manage:
- campaigns
- contacts
- templates
- reports
- settings

Do not expose technical backend systems to normal users unless explicitly requested.

## Main rule
Do not rewrite the whole project.
Work only on the requested task.
Make small, safe, focused changes.

## What to protect
Do not change these unless explicitly requested:
- authentication
- payments/billing
- database schema
- migrations
- production deployment config
- environment secrets
- tracking/unsubscribe logic
- worker/queue logic

## UI direction
The UI should be:
- clean
- calm
- business-first
- easy to understand
- low-noise

Use simple user-facing language.
Avoid technical terms where possible.

## Navigation
Visible Mailer navigation should stay limited to:
- /mailer
- /mailer/campaigns
- /mailer/contacts
- /mailer/templates
- /mailer/reports
- /mailer/settings

Do not add technical menu items.

## Design rules
Use existing project components and patterns.
Use Tailwind semantic tokens.
Avoid random colors.
Avoid unnecessary animations.
Avoid too many buttons in one place.
Keep one clear primary action per screen.

## Template editor
The template editor is critical.
When changing it, always check:
1. create template
2. edit content
3. insert image if supported
4. preview
5. save
6. reopen
7. confirm content is still there

## Testing
After every change, run available checks:
- typecheck
- lint
- relevant tests

If UI changed, test the affected user flow in browser if possible.

If something cannot be tested, say exactly why.

## Final report
At the end of every task, report:
1. changed files
2. what was changed
3. what was tested
4. what could not be tested
5. remaining risks