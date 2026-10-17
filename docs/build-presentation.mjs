import {
  buildPptx,
  createDeck,
} from "/skills/pptx/scripts/pptx_builder_runtime.mjs";
import { applyRecipeDeckPlan } from "/skills/pptx/scripts/slide_recipes.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
// Art direction: editable Arial type, light paper, forest headings and a single lime accent.
const deck = createDeck({ width: 1280, height: 720 });
const plan = [
  {
    recipeId: "cover-editorial",
    content: {
      eyebrow: "PLANT CARE SCHEDULING SYSTEM",
      title: "Sproutly",
      subtitle:
        "Small routines. Thriving plants.\nA responsive, weather-aware personal garden.",
      section: "01",
      footer: "Local implementation · Production setup pending",
    },
  },
  {
    recipeId: "comparison",
    content: {
      eyebrow: "THE PROBLEM",
      title: "Care should feel clear, not repetitive.",
      leftTitle: "Before",
      leftBody:
        "Repeated full data and image loads.\nCare notes confused with schedules.\nArchived plants had no way back.",
      rightTitle: "Sproutly",
      rightBody:
        "Change-only synchronization and stable images.\nExplicit every-N-days routines.\nSelective restore with fresh due dates.",
    },
  },
  {
    recipeId: "process-steps",
    content: {
      eyebrow: "CORE WORKFLOW",
      title: "A routine with a reliable memory.",
      steps: [
        ["Add a plant", "Light and location."],
        ["Set N days", "Separate care routines."],
        ["Record and review", "History and progress."],
      ],
    },
  },
  {
    recipeId: "image-left-story",
    content: {
      eyebrow: "LIGHT, VIBRANT, RESPONSIVE",
      title: "A garden at a glance.",
      body: "Lime and forest contrast inspired by Sweet Tape.\nColourful task types and emoji categories.\nNo breadcrumbs; clear navigation and back links.\nIn-app inbox with opt-in open-tab reminders.",
      image: { src: path.join(root, "screenshots/desktop-overview.png") },
      caption: "Local demo screenshot; fictional sample data.",
    },
  },
  {
    recipeId: "two-column",
    content: {
      eyebrow: "ARCHITECTURE",
      title: "Prisma without bypassing garden privacy.",
      leftTitle: "Application boundary",
      left: "Next.js and TypeScript.\nSupabase verifies the session.\nPrisma runs a transaction as authenticated.\nVerified UID is transaction-local.",
      rightTitle: "Data boundary",
      right:
        "PostgreSQL RLS limits owner rows.\nComposite foreign keys protect ownership.\nAuth owns password hashing.\nPrivate Storage uses owner folders.",
    },
  },
  {
    recipeId: "comparison",
    content: {
      eyebrow: "CACHE AND CONNECTIVITY",
      title: "Less reloading. Honest offline behavior.",
      leftTitle: "While online",
      leftBody:
        "Keep workspace state across navigation.\nRestore per-user same-tab cache.\nFetch changed rows and deletion IDs.\nUse stable private image URLs.",
      rightTitle: "When offline",
      rightBody:
        "Public service-worker fallback page.\nPreviously open views can remain visible.\nNo offline writes or queued task actions.\nNever cache private pages in the worker.",
    },
  },
  {
    recipeId: "evidence-panel",
    content: {
      eyebrow: "WEATHER-AWARE, USER-CONTROLLED",
      title: "Rain is a suggestion, not completed care.",
      claim: "A forecast never automatically marks watering done.",
      evidence: [
        ["Location", "Permission-based or manual coordinates."],
        ["Evidence", "Fresh matching date, ≥60% chance and ≥1 mm."],
        ["Scope", "Due outdoor watering only."],
        ["Action", "User confirms “Skipped — rain”."],
      ],
    },
  },
  {
    recipeId: "two-column",
    content: {
      eyebrow: "JOURNAL AND RESTORE",
      title: "Keep the story. Restart safely.",
      leftTitle: "Growth journal",
      left: "Dated height and leaf observations.\nActual elapsed-day chart and exact table.\nCaptioned photo timeline/gallery.\nOwner-scoped edit and delete.",
      rightTitle: "Selective restore",
      right:
        "Archive stops routines and retains history.\nChoose routines explicitly on restore.\nNext due starts one interval from today.\nEnded routines remain stopped.",
    },
  },
  {
    recipeId: "evidence-panel",
    content: {
      eyebrow: "VERIFICATION",
      title: "Evidence has a defined boundary.",
      claim: "Local tests are not production acceptance.",
      evidence: [
        ["44 tests", "Dates, validation, demo and actual SQL policies."],
        [
          "Browser suite",
          "Desktop/mobile flows; deterministic weather fixture.",
        ],
        ["Checks", "Strict TypeScript, lint and production build."],
        ["Pending", "Real Auth/email, Storage, Prisma and hosted-site tests."],
      ],
    },
  },
  {
    recipeId: "closing-takeaways",
    content: {
      eyebrow: "NEXT: LIVE ACCEPTANCE",
      title: "Ready for account-connected testing.",
      takeaways: [
        "Connect authorized GitHub, Vercel and Supabase projects.",
        "Apply migrations, configure environment and email redirects.",
        "Verify two-user privacy, live uploads, caching and weather on HTTPS.",
        "Rehearse the live presentation and keep the local demo as backup.",
      ],
    },
  },
];
applyRecipeDeckPlan(deck, plan, {
  accent: "#6a9700",
  colors: {
    ink: "#14351a",
    muted: "#53634f",
    surface: "#f4f8ec",
    accentSoft: "#eaffb3",
  },
});
await buildPptx(deck, {
  scenePath: path.join(root, "docs/presentation-build/scene.json"),
  outputPath: path.join(root, "docs/Sproutly-Presentation.pptx"),
  reportPath: path.join(root, "docs/presentation-build/report.json"),
  previewDir: path.join(root, "docs/presentation-build/preview"),
  layoutDir: path.join(root, "docs/presentation-build/layout"),
});
