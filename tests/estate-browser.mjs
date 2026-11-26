/* global document -- Evaluated inside the page by Playwright. */
import assert from "node:assert/strict";

export async function testEstateJourney(page, goto, shot) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const room = page.getByRole("combobox", { name: "Room", exact: true });
  async function add(name, species, location, overdue = false) {
    await page.getByRole("link", { name: "Add plant", exact: true }).click();
    await page.getByRole("textbox", { name: "Plant name" }).fill(name);
    await page.getByLabel("Common name", { exact: true }).fill(species);
    await page.getByRole("combobox", { name: /^Location/ }).fill(location);
    if (overdue) {
      const added = page.locator('input[name="added_on"]'),
        date = new Date((await added.inputValue()) + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() - 10);
      const before = date.toISOString().slice(0, 10);
      await added.fill(before);
      await page.getByRole("checkbox", { name: /Watering routine/ }).check();
      await page.getByLabel("Watering first due").fill(before);
    }
    await button("Add plant").click();
    await button("Move plant").waitFor({ state: "visible" });
  }
  await goto("/demo/home");
  await add("Kitchen Aloe", "Aloe vera", "Kitchen Countertop");
  await page.getByText(/Kitchen countertop ·/).waitFor();
  await page
    .locator(".estate-facts")
    .getByText("Aloe rosette", { exact: true })
    .waitFor();
  await add("Garden Rose", "Rose", "Front Garden", true);
  await page.getByText(/Front garden ·/).waitFor();
  await page.getByText("High water stress", { exact: true }).waitFor();
  const canvas = await page.locator(".estate-world canvas").elementHandle();
  await button("Enter fullscreen").click();
  await button("Water").click();
  await page
    .getByText("Gardener visiting Garden Rose.", { exact: true })
    .waitFor();
  await page
    .getByText("Water recorded in care history.", { exact: true })
    .waitFor({ timeout: 90000 });
  await page.getByText("Recovering", { exact: true }).waitFor();
  assert.ok(
    await canvas.evaluate((node) => node.isConnected),
    "The viewer stays mounted during a health change",
  );
  assert.ok(await button("Water recorded today").isDisabled());
  await button("Exit fullscreen").click();
  await button("Move plant").click();
  await room.selectOption({ label: "Roof terrace" });
  await button("Save placement").click();
  await page
    .getByText("Garden Rose saved in Roof terrace.", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByText(/Roof terrace ·/).waitFor();
  assert.equal(
    await button("First floor").getAttribute("aria-pressed"),
    "true",
  );
  await page.getByText("Recovering", { exact: true }).waitFor();
  for (const view of ["Dollhouse", "Ground floor", "First floor", "Exterior"]) {
    await button(view).click();
    assert.equal(await button(view).getAttribute("aria-pressed"), "true");
  }
  await button("Rendering quality").click();
  await page
    .getByRole("combobox", { name: "Rendering quality" })
    .selectOption("low");
  await button("Rendering quality").click();
  await button("Rotate right").click();
  await button("Zoom in").click();
  await button("Fit scene").click();
  await shot("home");
  const plantPicker = page.getByRole("combobox", {
    name: "Plant",
    exact: true,
  });
  await plantPicker.selectOption({ label: "Kitchen Aloe" });
  await button("Walk as gardener").click();
  const viewport = page.locator(".estate-canvas");
  const live = viewport.locator("canvas");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".estate-canvas canvas")
        ?.getAttribute("data-walk-area") === "Kitchen",
  );
  const origin = await live.getAttribute("data-walk-position");
  await button("Water").click();
  await page
    .getByText("Water recorded in care history.", { exact: true })
    .waitFor({ timeout: 90000 });
  assert.equal(await live.getAttribute("data-walk-position"), origin);
  assert.ok(await button("Water recorded today").isDisabled());
  await viewport.focus();
  if (await page.locator(".estate-stick").isVisible()) {
    const pad = page.locator(".estate-stick");
    const r = await pad.boundingBox();
    assert.ok(r);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.82);
    await page.mouse.down();
    try {
      await page.waitForFunction(
        (start) =>
          document
            .querySelector(".estate-canvas canvas")
            ?.getAttribute("data-walk-position") !== start,
        origin,
      );
    } finally {
      await page.mouse.up();
    }
  } else {
    await page.keyboard.down("s");
    try {
      await page.waitForFunction(
        (start) =>
          document
            .querySelector(".estate-canvas canvas")
            ?.getAttribute("data-walk-position") !== start,
        origin,
      );
    } finally {
      await page.keyboard.up("s");
    }
  }
  await shot("home-on-foot");
  await button("Back to map").click();
  await button("Dollhouse").click();
  assert.equal(await button("Dollhouse").getAttribute("aria-pressed"), "true");

  await button("Exterior").click();
  await viewport.press("c");
  const camera = page.getByRole("combobox", { name: "Explore camera" });
  await camera.selectOption("eyes");
  const snapshot = () =>
    live.evaluate((c) => ({
      eye: c.dataset.cameraEye.split(",").map(Number),
      foot: c.dataset.walkPosition.split(",").map(Number),
    }));
  const ground = await snapshot();
  assert.ok(Math.abs(ground.eye[1] - ground.foot[1] - 1.65) < 0.004);
  await camera.selectOption("fly");
  await viewport.focus();
  await page.keyboard.down("e");
  try {
    await page.waitForFunction((y) => {
      const el = document.querySelector(".estate-canvas canvas");
      return (
        el?.dataset.walkView === "fly" &&
        Number(el.dataset.cameraEye.split(",")[1]) > y + 0.2
      );
    }, ground.eye[1]);
  } finally {
    await page.keyboard.up("e");
  }
  await camera.selectOption("eyes");
  await page.waitForFunction(
    () =>
      document.querySelector(".estate-canvas canvas")?.dataset.walkView ===
      "eyes",
  );
  await viewport.press("c");
  assert.equal(await button("Exterior").getAttribute("aria-pressed"), "true");
}
