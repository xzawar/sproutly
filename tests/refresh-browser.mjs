/* global process, document, innerWidth, getComputedStyle, console */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
mkdirSync("screenshots/refresh", { recursive: true });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
    });
    const shot = async (name) => {
      await page.waitForTimeout(260);
      await page.screenshot({
        path: `screenshots/refresh/${width}-${name}.png`,
        fullPage: (await page.locator("dialog[open]").count()) === 0,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    };
    for (const path of [
      "login",
      "register",
      "forgot-password",
      "reset-password",
    ]) {
      await page.goto(`${base}/${path}`);
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .locator(".brand-mark")
          .first()
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgb(255, 255, 255)",
      );
      await shot(path);
    }
    await page.goto(base + "/demo/dashboard");
    await page.waitForTimeout(400);
    assert.equal(
      await page
        .locator(".garden-hero > img")
        .evaluate((e) => getComputedStyle(e).mixBlendMode),
      "normal",
    );
    await shot("dashboard");
    await page.goto(base + "/demo/plants/new");
    await page.getByLabel("Plant name").fill("Routine fern");
    await page.getByRole("checkbox", { name: "💧 Watering routine" }).check();
    await page
      .getByRole("checkbox", { name: "🌻 Fertilizing routine" })
      .check();
    await page.getByLabel("Water every (days)").fill("4");
    await page.getByLabel("Fertilize every (days)").fill("21");
    await shot("add-plant");
    await page.getByRole("button", { name: "Add plant", exact: true }).click();
    await page.waitForURL("**/demo/plants");
    await page
      .getByRole("link")
      .filter({
        has: page.getByRole("heading", { name: "Routine fern", exact: true }),
      })
      .click();
    await page
      .getByRole("heading", { name: "Routine fern", exact: true })
      .waitFor();
    await page.getByText("Every 4 days", { exact: false }).first().waitFor();
    await page.getByText("Every 21 days", { exact: false }).first().waitFor();
    // Both routines are present on the newly created plant; reload verifies persistence.
    assert.ok(
      (await page.locator("body").innerText()).includes("Every 4 days"),
    );
    assert.ok(
      (await page.locator("body").innerText()).includes("Every 21 days"),
    );
    await page.reload();
    await page.waitForTimeout(300);
    assert.ok(
      (await page.locator("body").innerText()).includes("Every 21 days"),
    );
    await shot("plant-with-routines");
    await page.getByRole("link", { name: "Edit plant", exact: true }).click();
    assert.equal(
      await page.getByRole("checkbox", { name: /routine/ }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.waitForURL("**/demo/plants/*");
    assert.ok(
      (await page.locator("body").innerText()).includes("Every 4 days"),
    );
    await page.goto(base + "/demo/calendar");
    await page.waitForTimeout(300);
    await shot("calendar");
    assert.ok(await page.locator(".calendar-day.is-today").count());
    assert.equal(
      await page
        .locator(".calendar-day")
        .first()
        .evaluate((e) => getComputedStyle(e).borderRadius),
      width === 390 ? "8px" : "12px",
    );
    await page
      .getByRole("button", { name: /, [1-9]\d* activities$/ })
      .first()
      .click();
    await shot("calendar-dialog");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await shot("calendar-week");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "/login");
    assert.equal(
      await page
        .locator(".auth-form-wrap")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    assert.deepEqual(errors, []);
    results.push({ viewport: width, passed: true });
    await context.close();
  }
  writeFileSync(
    "screenshots/refresh/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log("Refresh flows passed at desktop and mobile widths.");
} finally {
  await browser.close();
}
