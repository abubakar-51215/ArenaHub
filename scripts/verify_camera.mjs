// Item 3 in a real browser: the receipt upload and the profile picture both offer "Take photo" and
// "Choose from gallery" (and Cancel), with the file rules unchanged. A desktop browser cannot
// open a real camera, so what is proven here is the sheet, that Take photo asks the browser for
// the camera (the `capture` hint), that Gallery does not, the cancel path, the file rules, and
// the layout at 360, 375, 390 and 430 px. The real camera is on the real-phone sheet.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_camera.mjs

import {
  MOBILE, allResults, api, chromium, dismissNearMe, finish, fixture, freeSlots, lastOtpFor, layout, mobileLogin,
  newPage, record, sleep,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "camv1";
const WIDTHS = [360, 375, 390, 430];
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function step(name, fn, page) {
  try {
    await fn();
    return null;
  } catch (e) {
    if (page) {
      await page.screenshot({ path: `scripts/.ui_verify/FAIL-${name}.png` }).catch(() => {});
      const text = await page.locator("body").innerText().catch(() => "");
      console.log(`  [${name}] url=${page.url()} text=${text.replace(/\s+/g, " ").slice(0, 400)}`);
    }
    return `${name}: ${e.message.split("\n")[0]}`;
  }
}

async function see(page, text, timeout = 15000) {
  try {
    await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ timeout });
  } catch {
    throw new Error(`never saw "${text}"`);
  }
}

async function seeLike(page, text, timeout = 15000) {
  try {
    await page.getByText(text).filter({ visible: true }).first().waitFor({ timeout });
  } catch {
    throw new Error(`never saw text containing "${text}"`);
  }
}

async function sheetIsClean(page, width) {
  for (const t of ["Add a photo", "Take photo", "Choose from gallery", "Cancel"]) await see(page, t);
  const lay = await layout(page);
  if (lay.sideways) throw new Error(`sideways scroll ${lay.scrollWidth}>${lay.clientWidth}`);
  if (lay.leak) throw new Error(`header shows a route name: ${lay.leak}`);
  // the sheet's three buttons are the ones that must be easy to tap
  for (const t of ["Take photo", "Choose from gallery", "Cancel"]) {
    const box = await page.getByRole("button", { name: t, exact: true }).filter({ visible: true }).first().boundingBox();
    if (!box || box.height < 44) throw new Error(`"${t}" is ${Math.round(box?.height ?? 0)}px high at ${width}`);
  }
}

async function main() {
  const f = await fixture(TAG);
  // an unpaid booking paid by bank transfer, so the receipt screen opens
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ account_title: "Verify Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }),
  });
  await sleep(400);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code: lastOtpFor(f.owner) }) });
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  const made = await api("/bookings", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[0].id], payment_type: "full" }),
  });
  const gid = made.booking_group_id;
  const pay = await api("/payments/initiate", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: gid, payment_method: "bank_transfer" }),
  });
  const bankUrl = `${MOBILE}/booking/bank/${gid}?paymentId=${pay.payment.id}&arenaId=${f.arenaId}`;
  const browser = await chromium.launch();

  // ---- the sheet on the receipt screen, at every phone width ----
  for (const width of WIDTHS) {
    const { page, ctx } = await newPage(browser, { width, height: 844, mobile: true }, "camera-receipt");
    const err = await step(
      "camera-receipt",
      async () => {
        await mobileLogin(page, f.player);
        await page.goto(bankUrl, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        await see(page, "Upload a photo");
        await page.getByText("Upload a photo", { exact: true }).click();
        await sheetIsClean(page, width);
        // Cancel closes it and nothing is chosen
        await page.getByRole("button", { name: "Cancel", exact: true }).filter({ visible: true }).first().click();
        await page.waitForTimeout(500);
        if (await page.getByText("Add a photo", { exact: true }).filter({ visible: true }).count()) throw new Error("the sheet is still open after Cancel");
        if (await page.getByText("receipt.png", { exact: true }).count()) throw new Error("a photo was chosen although Cancel was tapped");
      },
      page,
    );
    record(`Camera sheet on the receipt screen @${width}`, "N/A", err ? "FAIL" : "PASS", err ?? "three options, taps >= 44px, Cancel closes it, no sideways scroll");
    await ctx.close();
  }

  // ---- Take photo asks for the camera; Gallery does not; the rules still apply ----
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "camera-choose");
    const err = await step(
      "camera-choose",
      async () => {
        await mobileLogin(page, f.player);
        await page.goto(bankUrl, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        await page.getByText("Upload a photo", { exact: true }).click();
        let [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Take photo", exact: true }).filter({ visible: true }).first().click()]);
        const hint = await chooser.element().getAttribute("capture");
        if (hint !== "environment") throw new Error(`Take photo did not ask for the camera (capture=${hint})`);
        await chooser.setFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
        await seeLike(page, "receipt.png");

        // choose another, this time from the gallery: no camera hint
        await page.getByText("receipt.png").filter({ visible: true }).first().click();
        await see(page, "Add a photo");
        [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Choose from gallery", exact: true }).filter({ visible: true }).first().click()]);
        if ((await chooser.element().getAttribute("capture")) !== null) throw new Error("Choose from gallery should not open the camera");
        // a file that is not a photo is still refused, in the same words as before
        await chooser.setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
        await seeLike(page, "That file is not a photo we can use.");
      },
      page,
    );
    record("Camera: Take photo asks for the camera, gallery does not, bad file refused", "N/A", err ? "FAIL" : "PASS", err ?? "capture=environment on Take photo only; a .txt file is refused as before");
    await ctx.close();
  }

  // ---- the profile picture uses the same sheet ----
  for (const width of [360, 430]) {
    const { page, ctx } = await newPage(browser, { width, height: 844, mobile: true }, "camera-profile");
    const err = await step(
      "camera-profile",
      async () => {
        await mobileLogin(page, f.player);
        await page.goto(`${MOBILE}/profile/edit`, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        await page.getByRole("button", { name: "Change profile photo" }).click();
        await sheetIsClean(page, width);
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Choose from gallery", exact: true }).filter({ visible: true }).first().click()]);
        await chooser.setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
        await page.waitForTimeout(800);
        const save = page.getByRole("button", { name: "Save changes" });
        if ((await save.getAttribute("aria-disabled")) === "true") throw new Error("Save changes stayed disabled after choosing a photo");
      },
      page,
    );
    record(`Camera sheet on the profile picture @${width}`, "N/A", err ? "FAIL" : "PASS", err ?? "same sheet, gallery photo accepted, Save changes enabled");
    await ctx.close();
  }

  await browser.close();
  finish({ name: "camera" });
  process.exit(allResults().some((r) => r.mobile === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
