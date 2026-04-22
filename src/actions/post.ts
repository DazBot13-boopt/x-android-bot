import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange, coordTap, parseBoundsCenter, adb } from '../utils/adb';

/**
 * The X Android feed auto-hides the compose FAB once the user scrolls down
 * (e.g. during warmup). Tapping where the FAB used to be becomes a no-op and
 * our subsequent `waitForExist(tweet_text)` then times out or — worse — keeps
 * UIAutomator2 busy long enough to crash. A short reverse swipe (top → bottom
 * finger motion, so the feed scrolls back toward the top) brings the FAB back.
 */
async function revealComposeFab(): Promise<void> {
    const sizeOut = adb(['shell', 'wm', 'size']);
    const m = sizeOut.match(/(\d+)x(\d+)/);
    const width = m ? parseInt(m[1], 10) : 1080;
    const height = m ? parseInt(m[2], 10) : 2400;
    const x = Math.floor(width * 0.5);
    const startY = Math.floor(height * 0.3);
    const endY = Math.floor(height * 0.75);
    adb(['shell', 'input', 'swipe', String(x), String(startY), String(x), String(endY), '350']);
}

/**
 * Composes and publishes a tweet from whichever account is currently active.
 * Caller is responsible for calling switchAccount() first.
 *
 * Real UI flow (X Android, FR app, confirmed from live dump 2026-04):
 *   Home → tap FAB `composer_write` → radial menu expands showing
 *   "Passer en direct / Spaces / Photos / Poster". The "Poster" entry is itself
 *   another `composer_write` button (same resource-id). Tap it again → the
 *   composer screen opens with an EditText `tweet_text`. Type → tap
 *   `button_tweet` ("POSTER") → composer closes, back to Home.
 *
 * We detect the composer by probing for `tweet_text` after the first tap; if
 * it's not there, we assume the radial menu is showing and tap `composer_write`
 * a second time to drill into the composer. This is tolerant to future app
 * versions where the FAB opens the composer directly.
 */
export async function post(driver: WDIOBrowser, text: string): Promise<void> {
    logger.info(`[post] composing (${text.length} chars)`);

    // 0. Reveal the FAB in case warmup scrolled the feed down and it auto-hid.
    //    A short top→bottom finger swipe scrolls the feed back toward the top,
    //    which causes X to re-show the compose FAB.
    await revealComposeFab();
    await sleep(randomRange(600, 1000));

    // 1. Tap the floating compose button. On current FR app this opens the
    //    radial menu (Passer en direct / Spaces / Photos / Poster). Use a real
    //    coord-tap via adb rather than webdriverio's .click(); the latter,
    //    applied twice in a row on the same `composer_write` id, tends to be
    //    treated by the app as "toggle radial" and we never reach the composer.
    const fab = await driver.$(selectors.home.composeFab);
    await fab.waitForExist({ timeout: 10_000 });
    const fabBounds = await fab.getAttribute('bounds');
    const fabCenter = fabBounds ? parseBoundsCenter(fabBounds) : null;
    // Reject degenerate bounds like [0,0][0,0] (element reported but not
    // actually laid out — e.g. hidden FAB that somehow still matches the id).
    if (fabCenter && fabCenter.x > 0 && fabCenter.y > 0) {
        coordTap(fabCenter.x, fabCenter.y);
    } else {
        logger.warn(`[post] fab bounds invalid (${fabBounds}); falling back to webdriverio click`);
        await fab.click();
    }
    await sleep(randomRange(700, 1200));

    // 2. If the composer didn't open directly, we're on the radial menu — tap
    //    `composer_write` a second time via coord-tap (same resource-id as the
    //    "Poster" entry; same bounds as the FAB itself).
    let input = await driver.$(selectors.composer.textInput);
    if (!(await input.isExisting())) {
        logger.info('[post] radial menu open — coord-tapping "Poster" (composer_write #2)');
        const fab2 = await driver.$(selectors.home.composeFab);
        await fab2.waitForExist({ timeout: 5_000 });
        const fab2Bounds = await fab2.getAttribute('bounds');
        const fab2Center = fab2Bounds ? parseBoundsCenter(fab2Bounds) : null;
        if (fab2Center && fab2Center.x > 0 && fab2Center.y > 0) {
            coordTap(fab2Center.x, fab2Center.y);
        } else {
            logger.warn(`[post] fab2 bounds invalid (${fab2Bounds}); falling back to webdriverio click`);
            await fab2.click();
        }
        await sleep(randomRange(700, 1200));
        input = await driver.$(selectors.composer.textInput);
    }

    // 3. Focus the input and type.
    await input.waitForExist({ timeout: 10_000 });
    await input.click();
    await sleep(randomRange(300, 600));
    await input.setValue(text);
    await sleep(randomRange(800, 1600));

    // 4. Tap the "POSTER" / "Post" button.
    const postBtn = await driver.$(selectors.composer.postButton);
    await postBtn.waitForExist({ timeout: 10_000 });
    await postBtn.click();
    await sleep(randomRange(2500, 4500));

    logger.info(`[post] published`);
}
