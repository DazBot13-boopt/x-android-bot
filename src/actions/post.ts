import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange } from '../utils/adb';

/**
 * Composes and publishes a tweet from the current account.
 * Caller is responsible for switching to the right account first.
 */
export async function post(driver: WDIOBrowser, text: string): Promise<void> {
    logger.info(`[post] composing tweet (${text.length} chars)`);

    // Tap the compose FAB (EN = "Post", FR = "Poster")
    const fab =
        (await driver.$(selectors.home.composeFab).isExisting())
            ? await driver.$(selectors.home.composeFab)
            : await driver.$(selectors.home.composeFabFr);
    await fab.waitForExist({ timeout: 10_000 });
    await fab.click();
    await sleep(randomRange(1000, 2000));

    // Type into the composer
    const input = await driver.$(selectors.composer.textInput);
    await input.waitForExist({ timeout: 10_000 });
    await input.click();
    await sleep(randomRange(300, 600));
    // Typing char-by-char is slower but looks human. Use sendKeys for now.
    await input.setValue(text);
    await sleep(randomRange(800, 1600));

    // Press the Post button (same content-desc as FAB, but on the composer screen)
    const postBtn =
        (await driver.$(selectors.composer.postButton).isExisting())
            ? await driver.$(selectors.composer.postButton)
            : await driver.$(selectors.composer.postButtonFr);
    await postBtn.waitForExist({ timeout: 10_000 });
    await postBtn.click();
    await sleep(randomRange(2000, 4000));

    logger.info(`[post] published`);
}
