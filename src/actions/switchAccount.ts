import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange } from '../utils/adb';

/**
 * Switches the X app to the account identified by `username` (without the @).
 * Assumes the user has already logged this account in via the app's multi-account feature.
 *
 * Flow (X Android app, as of early 2025):
 *   Home → tap profile avatar (top-left) → opens nav drawer →
 *   tap the chevron / "Account menu" next to the current handle →
 *   list of logged-in accounts shows up → tap the one matching @username →
 *   back to Home as that account.
 */
export async function switchAccount(driver: WDIOBrowser, username: string): Promise<void> {
    const handle = username.replace(/^@/, '');
    logger.info(`[switchAccount] → @${handle}`);

    // Open nav drawer
    const drawer = await driver.$(selectors.home.profileDrawer);
    await drawer.waitForExist({ timeout: 10_000 });
    await drawer.click();
    await sleep(randomRange(800, 1500));

    // Open account switcher
    const chevron = await driver.$(selectors.accountSwitcher.dropdownChevron);
    if (await chevron.isExisting()) {
        await chevron.click();
        await sleep(randomRange(700, 1200));
    }

    // Tap the row matching @handle
    const row = await driver.$(selectors.accountSwitcher.accountRowByUsername(handle));
    await row.waitForExist({ timeout: 10_000 });
    await row.click();
    await sleep(randomRange(1500, 2500));

    logger.info(`[switchAccount] now on @${handle}`);
}
