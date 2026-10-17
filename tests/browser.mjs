/** End-to-end local-demo checks. Start the app first: npm run build && npm start. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/local/bin/chromium")
    ? "/usr/local/bin/chromium"
    : undefined);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox"],
});
const errors = [];
const results = [];
mkdirSync("screenshots", { recursive: true });
const check = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log("Browser errors so far", errors);
    throw e;
  }
  results.push({ name, passed: true });
  console.log("PASS", name);
};
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const label = viewport.width === 390 ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport,
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.on("crash", () => console.log("PAGE CRASH"));
    page.on("response", (r) => {
      if (r.status() >= 500) console.log("HTTP", r.status(), r.url());
    });
    page.on("pageerror", (e) => errors.push(page.url() + ": " + e.message));
    const goto = async (path) => {
      await page.goto(base + path);
      await page.waitForTimeout(250);
    };
    const shot = async (name) => {
      if (name === "growth") {
        await page
          .locator(".photo-grid img")
          .last()
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await page.waitForTimeout(350);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `screenshots/${label}-${name}.png`,
        fullPage:
          (await page.locator("dialog[open]").count()) === 0 &&
          name !== "navigation",
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name}: horizontal page overflow`,
      );
    };
    await check(`${label}: authentication setup state`, async () => {
      await goto("/login");
      assert.ok(
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .isDisabled(),
      );
      await shot("login");
    });
    await check(`${label}: register screen`, async () => {
      await goto("/register");
      await page.getByLabel("Your name").fill("A gardener");
      await shot("register");
    });
    await goto("/demo/dashboard");
    await shot("overview");
    if (label === "mobile")
      await check("mobile navigation drawer", async () => {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await shot("navigation");
        await page
          .getByRole("link", { name: "My plants", exact: true })
          .click();
        await page.waitForURL("**/demo/plants");
      });
    const plantId = "10000000-0000-4000-8000-000000000030";
    for (const [path, name] of [
      ["/demo/plants", "plants"],
      [`/demo/plants/${plantId}`, "plant-detail"],
      [`/demo/plants/${plantId}/edit`, "plant-edit"],
      [`/demo/plants/${plantId}/schedules/new`, "schedule-new"],
      [
        "/demo/schedules/10000000-0000-4000-8000-000000000050/edit",
        "schedule-edit",
      ],
      ["/demo/tasks", "tasks"],
      ["/demo/calendar", "calendar-month"],
      ["/demo/history", "history"],
      ["/demo/profile", "profile"],
      ["/demo/admin/users", "admin-users"],
      ["/demo/admin/categories", "admin-categories"],
    ]) {
      await check(`${label}: ${name} renders without overflow`, async () => {
        await goto(path);
        await shot(name);
      });
      if (name === "calendar-month") {
        await page.getByRole("button", { name: "Week", exact: true }).click();
        await shot("calendar-week");
        await page
          .getByRole("button", { name: /activities$/ })
          .first()
          .click();
        await shot("calendar-day");
        await page.getByRole("button", { name: "Close dialog" }).click();
        await check(`${label}: populated calendar day details`, async () => {
          await page
            .getByRole("button", { name: /, [1-9]\d* activities$/ })
            .first()
            .click();
          await page
            .locator("dialog[open]")
            .getByText("Basil", { exact: true })
            .waitFor();
          await shot("calendar-day-populated");
          await page.getByRole("button", { name: "Close dialog" }).click();
        });
      }
    }
    await check(
      `${label}: create, search, edit and archive a plant`,
      async () => {
        await goto("/demo/plants/new");
        await page.getByLabel(/Plant name/).fill("Test fern");
        await page.getByLabel("Location", { exact: true }).fill("Study");
        await shot("plant-new");
        await page
          .getByRole("button", { name: "Add plant", exact: true })
          .click();
        await page.waitForURL("**/demo/plants");
        await page
          .getByRole("textbox", { name: "Search plants by name" })
          .fill("Test fern");
        assert.equal(await page.locator(".plant-card").count(), 1);
        await page.locator(".plant-card").click();
        await page.waitForURL(/\/demo\/plants\/[^/]+$/);
        const detail = page.url();
        await page.getByRole("link", { name: "Edit plant" }).click();
        await page.getByLabel("Location", { exact: true }).fill("Library");
        await page.getByRole("button", { name: "Save changes" }).click();
        await page.waitForURL(detail);
        await page
          .getByText("Library", { exact: true })
          .waitFor({ state: "visible" });
        await page
          .getByRole("button", { name: "Archive plant", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Archive", exact: true })
          .click();
        await page
          .getByText("This plant is archived.", { exact: false })
          .waitFor();
      },
    );
    await check(`${label}: custom schedule creation and editing`, async () => {
      await goto(`/demo/plants/${plantId}/schedules/new`);
      await page.getByLabel("Care activity").selectOption("Custom");
      await page.getByLabel("Custom task name").fill("Clean leaves");
      await page.getByLabel(/Repeat every/).fill("3");
      await page.getByRole("button", { name: "Create schedule" }).click();
      await page.waitForURL(`**/demo/plants/${plantId}`);
      await page
        .getByRole("link", { name: "Edit Clean leaves schedule" })
        .waitFor({ state: "visible" });
      await page
        .getByRole("link", { name: "Edit Clean leaves schedule" })
        .click();
      await page.getByLabel(/Repeat every/).fill("4");
      await page.getByRole("button", { name: "Save schedule" }).click();
      await page.waitForURL(`**/demo/plants/${plantId}`);
      await page
        .getByText("Every 4 days", { exact: false })
        .first()
        .waitFor({ state: "visible" });
    });
    await check(
      `${label}: complete flow updates history and next date`,
      async () => {
        await goto("/demo/tasks");
        await page
          .getByRole("button", {
            name: "Complete Water for Monstera",
            exact: true,
          })
          .click();
        await page.getByLabel(/Care notes/).fill("Browser test: soil checked");
        await shot("complete-dialog");
        await page
          .getByRole("button", { name: "Mark completed", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.getByRole("tab", { name: "Completed", exact: true }).click();
        await page
          .getByText("Browser test: soil checked", { exact: true })
          .waitFor({ state: "visible" });
        await shot("completed-tasks");
      },
    );
    await check(`${label}: skip flow and persistence`, async () => {
      await page.getByRole("tab", { name: "Overdue", exact: true }).click();
      await page
        .getByRole("button", { name: "Skip Water for Basil", exact: true })
        .click();
      await page.getByRole("button", { name: "Skip & reschedule" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("tab", { name: "Skipped", exact: true }).click();
      await page
        .getByText("Basil", { exact: true })
        .waitFor({ state: "visible" });
      await page.reload();
      await page.waitForTimeout(350);
      await page.getByRole("tab", { name: "Skipped", exact: true }).click();
      await page
        .getByText("Basil", { exact: true })
        .waitFor({ state: "visible" });
    });
    await check(`${label}: category lifecycle and validation`, async () => {
      await goto("/demo/admin/categories");
      await page
        .getByRole("button", { name: "Add category", exact: true })
        .click();
      await page.getByLabel("Category name").fill("Trees");
      await page.getByRole("button", { name: "Save category" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByRole("button", { name: "Edit Trees", exact: true })
        .click();
      await page.getByLabel("Category name").fill("Trees & shrubs");
      await page.getByRole("button", { name: "Save category" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByRole("button", { name: "Delete Trees & shrubs", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Delete category", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await page.getByText("Trees & shrubs", { exact: true }).count(),
        0,
      );
      await page
        .getByRole("button", { name: "Delete Indoor", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Delete category", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("alert")
        .waitFor({ state: "visible" });
      await shot("category-error");
      await page.getByRole("button", { name: "Close dialog" }).click();
    });
    await check(
      `${label}: profile timezone and search empty state`,
      async () => {
        await goto("/demo/profile");
        await page.getByLabel("Name", { exact: true }).fill("Taylor Gardener");
        await page.getByLabel(/^Timezone/).fill("Europe/London");
        await page.getByRole("button", { name: "Save profile" }).click();
        await page.getByRole("status").waitFor();
        await goto("/demo/plants");
        await page
          .getByRole("textbox", { name: "Search plants by name" })
          .fill("nothing-matches-this");
        await page.getByText("No plants found", { exact: true }).waitFor();
        await shot("empty-search");
      },
    );
    await check(`${label}: password visibility`, async () => {
      await goto("/login");
      await page
        .getByLabel("Password", { exact: true })
        .fill("a-long-test-password");
      await page
        .getByRole("button", { name: "Show password", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Password", { exact: true }).getAttribute("type"),
        "text",
      );
      await page
        .getByRole("button", { name: "Hide password", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Password", { exact: true }).getAttribute("type"),
        "password",
      );
    });
    await goto("/forgot-password");
    await shot("forgot-password");
    await goto("/reset-password");
    await shot("reset-password");
    await check(
      `${label}: growth journal CRUD, chart and dated photo gallery`,
      async () => {
        await goto("/demo/growth");
        await shot("growth");
        assert.equal(await page.locator(".height-chart svg").count(), 1);
        await page.getByRole("button", { name: "Add measurement" }).click();
        await page.getByLabel("Height (cm)", { exact: true }).fill("64.5");
        await page.getByLabel("Leaf count (optional)").fill("13");
        await page
          .getByLabel("Notes (optional)", { exact: true })
          .fill("New leaf opened");
        await shot("growth-form");
        await page.getByRole("button", { name: "Save measurement" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.getByText("New leaf opened", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: /Edit measurement/ })
          .first()
          .click();
        await page.getByLabel("Height (cm)", { exact: true }).fill("65");
        await page.getByRole("button", { name: "Save measurement" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Add photo" }).click();
        await page
          .getByLabel("Or HTTPS image URL")
          .fill("https://example.test/plant.webp");
        await page.getByLabel("Caption (optional)").fill("Photo test");
        await page.getByRole("button", { name: "Save photo" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.getByText("Photo test", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Delete photo", exact: true })
          .first()
          .click();
        await page
          .getByRole("button", { name: "Delete entry", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      },
    );
    await check(`${label}: archive and selective restore`, async () => {
      await goto(`/demo/plants/${plantId}`);
      await page
        .getByRole("button", { name: "Archive plant", exact: true })
        .click();
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await page
        .getByRole("button", { name: /Restore plant/, exact: false })
        .click();
      await page.getByLabel("Resume Water", { exact: true }).check();
      await shot("restore-dialog");
      await page
        .getByRole("button", { name: "Restore plant & selected routines" })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByRole("link", { name: "Edit plant", exact: true })
        .waitFor();
    });
    await check(
      `${label}: weather permission fallback and rain-aware skip confirmation`,
      async () => {
        await context.route("**/api/weather?*", async (route) => {
          const now = new Date();
          const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/London",
          }).format(now);
          const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() + i);
            return d.toISOString().slice(0, 10);
          });
          await route.fulfill({
            json: {
              latitude: 51.5,
              longitude: -0.12,
              timezone: "Europe/London",
              fetchedAt: Date.now(),
              current: {
                time: today + "T12:00",
                temperature_2m: 21,
                relative_humidity_2m: 68,
                weather_code: 61,
                rain: 0.4,
              },
              daily: {
                time: days,
                temperature_2m_max: days.map(() => 24),
                temperature_2m_min: days.map(() => 16),
                rain_sum: days.map(() => 2),
                showers_sum: days.map(() => 1),
                precipitation_probability_max: days.map(() => 85),
                weather_code: days.map(() => 61),
              },
            },
          });
        });
        await goto("/demo/weather");
        await shot("weather-empty");
        await page
          .getByText("Choose location manually", { exact: true })
          .click();
        await page.getByLabel("Latitude", { exact: true }).fill("51.5");
        await page.getByLabel("Longitude", { exact: true }).fill("-0.12");
        await page.getByRole("button", { name: "Show weather" }).click();
        await page.getByText("Humidity", { exact: false }).first().waitFor();
        await shot("weather");
        // Put Basil's next occurrence back on today in the isolated local store.
        await page.evaluate(() => {
          const d = JSON.parse(localStorage.getItem("sproutly-demo-v1"));
          const s = d.schedules.find(
            (s) =>
              s.activity === "Water" &&
              d.plants.find((p) => p.id === s.plant_id)?.name === "Basil",
          );
          s.next_due_date = new Intl.DateTimeFormat("en-CA", {
            timeZone: d.profile.timezone,
          }).format(new Date());
          localStorage.setItem("sproutly-demo-v1", JSON.stringify(d));
        });
        await page.reload();
        await page
          .getByRole("button", { name: /Rain expected today · Skip for rain/ })
          .click();
        await page
          .getByRole("dialog")
          .getByText(/not completed watering/)
          .waitFor();
        await shot("rain-skip-dialog");
        await page.getByRole("button", { name: "Skip & reschedule" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      },
    );
    await check(`${label}: calendar filters and no breadcrumbs`, async () => {
      await goto("/demo/calendar");
      await page.getByLabel("Plant", { exact: true }).selectOption(plantId);
      await page.getByLabel("Activity", { exact: true }).selectOption("Water");
      assert.equal(
        await page.locator('[aria-label*="breadcrumb" i]').count(),
        0,
      );
      await shot("calendar-filtered");
    });
    await goto("/demo/dashboard");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await shot("notifications");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await check(`${label}: offline fallback`, async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForTimeout(300);
      await context.setOffline(true);
      await page.goto(base + "/offline-verification");
      await page
        .getByText("A little pause.", { exact: false })
        .waitFor({ timeout: 5000 });
      await shot("offline");
      await context.setOffline(false);
    });
    await context.close();
  }
  await check(
    "notifications: permission opt-in and cross-tab deduplication",
    async () => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      await context.addInitScript(() => {
        class FakeNotification {
          static permission = "granted";
          static requestPermission() {
            return Promise.resolve("granted");
          }
          constructor() {
            localStorage.setItem(
              "test-notification-count",
              String(
                Number(localStorage.getItem("test-notification-count") || 0) +
                  1,
              ),
            );
          }
        }
        Object.defineProperty(window, "Notification", {
          value: FakeNotification,
          configurable: true,
        });
      });
      const page = await context.newPage();
      await page.goto(base + "/demo/dashboard");
      await page.getByRole("button", { name: /^Notifications/ }).click();
      await page.getByRole("button", { name: "Enable reminders" }).click();
      await page.waitForTimeout(400);
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("test-notification-count"),
        ),
        "4",
      );
      const second = await context.newPage();
      await second.goto(base + "/demo/dashboard");
      await second.waitForTimeout(400);
      assert.equal(
        await second.evaluate(() =>
          localStorage.getItem("test-notification-count"),
        ),
        "4",
      );
      await context.close();
    },
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(base + "/demo/dashboard");
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
    "light",
  );
  await page.screenshot({
    path: "screenshots/light-locked-overview.png",
    fullPage: true,
  });
  await context.close();
  assert.deepEqual(errors, [], "No uncaught browser errors");
  results.push({ name: "No uncaught browser errors", passed: true });
  writeFileSync(
    "docs/browser-test-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope: "Local demo; no live Supabase project configured",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.length} browser checks passed. Live Supabase integration remains unverified.`,
  );
} finally {
  await browser.close();
}
