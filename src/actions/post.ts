import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange } from '../utils/adb';

/**
 * Composes and publishes a tweet from whichever account is currently active.
 * Caller is responsible for calling switchAccount() first.
 *
 * Real UI flow (confirmed from live dump 2026-04):
 *   Home → tap FAB resource-id `composer_write` →
 *   composer screen opens with an EditText `tweet_text` →
 *   type text → tap button `button_tweet` ("POSTER") →
 *   composer closes, back to Home.
 */
export async function post(driver: WDIOBrowser, text: string): Promise<void> {
    logger.info(`[post] composing (${text.length} chars)`);

    // 1. Tap the floating compose button.
    const fab = await driver.$(selectors.home.composeFab);
    await fab.waitForExist({ timeout: 10_000 });
    await fab.click();
    await sleep(randomRange(1000, 2000));

    // 2. Focus the input and type.
    const input = await driver.$(selectors.composer.textInput);
    await input.waitForExist({ timeout: 10_000 });
    await input.click();
    await sleep(randomRange(300, 600));
    await input.setValue(text);
    await sleep(randomRange(800, 1600));

    // 3. Tap the "POSTER" / "Post" button.
    const postBtn = await driver.$(selectors.composer.postButton);
    await postBtn.waitForExist({ timeout: 10_000 });
    await postBtn.click();
    await sleep(randomRange(2500, 4500));

    logger.info(`[post] published`);
}
