import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange, ensureAppForeground } from '../utils/adb';
import { config } from '../config';

/**
 * Best-effort: make sure the X app is on the Home (timeline) tab before any
 * interaction. The account-switcher is only reachable from Home, so if the
 * user left the app on Search / Notifications / a tweet-detail, we'd fail.
 *
 * Strategy:
 *   1. Relaunch the X main activity via `adb am start`. Because the activity
 *      has singleTask / singleTop flags, this brings an already-running app
 *      to foreground on the Home tab without losing session.
 *   2. If the Home tab isn't focused (user was deep inside), tap the
 *      bottom-nav "Accueil"/"Home" element once as a fallback.
 */
async function ensureOnHomeTab(driver: WDIOBrowser): Promise<void> {
    try {
        ensureAppForeground(config.android.xAppPackage);
    } catch (err) {
        logger.warn(`[switchAccount] ensureAppForeground failed (continuing): ${(err as Error).message}`);
    }
    await sleep(randomRange(1200, 2000));

    // If the nav-drawer is already visible, we're done.
    const alreadyHome = await driver.$(selectors.home.navDrawerFr);
    if (await alreadyHome.isExisting()) return;
    const alreadyHomeEn = await driver.$(selectors.home.navDrawerEn);
    if (await alreadyHomeEn.isExisting()) return;

    // Otherwise, tap the bottom-nav Home tab.
    for (const sel of [selectors.home.homeTabFr, selectors.home.homeTabEn]) {
        const tab = await driver.$(sel);
        if (await tab.isExisting()) {
            await tab.click();
            await sleep(randomRange(800, 1500));
            return;
        }
    }
    logger.warn('[switchAccount] could not locate Home tab — will try nav-drawer anyway.');
}

/**
 * Switches the X app to the account whose @handle matches `username`.
 * Assumes the user has already logged this account in via the multi-account feature
 * of the X Android app — this function NEVER logs in, it only switches.
 *
 * Real UI flow (X Android v10+, French app, confirmed from live dump 2026-04):
 *   Home → tap avatar top-left ("Montrer le menu de navigation") →
 *   bottom-sheet "Comptes" opens showing all logged accounts →
 *   tap the row whose TextView reads "@<handle>" → sheet closes and app switches.
 *
 * Note: unlike older versions of the app, there is NO separate drawer+chevron step —
 * the avatar tap opens the account switcher directly as a bottom sheet.
 */
export async function switchAccount(driver: WDIOBrowser, username: string): Promise<void> {
    const handle = username.replace(/^@/, '');
    logger.info(`[switchAccount] → @${handle}`);

    // 0. Ensure the X app is on the Home tab; otherwise the nav-drawer button doesn't exist.
    await ensureOnHomeTab(driver);

    // 1. Open the account-switcher bottom sheet via the top-left avatar button.
    //    Try the FR label first, fall back to EN.
    let navBtn = await driver.$(selectors.home.navDrawerFr);
    if (!(await navBtn.isExisting())) {
        navBtn = await driver.$(selectors.home.navDrawerEn);
    }
    await navBtn.waitForExist({ timeout: 10_000 });
    await navBtn.click();
    await sleep(randomRange(800, 1500));

    // 2. Wait for the bottom sheet to render.
    const sheet = await driver.$(selectors.accountSwitcher.sheetContainer);
    await sheet.waitForExist({ timeout: 10_000 });

    // 3. Tap the row matching the exact @handle text.
    const row = await driver.$(selectors.accountSwitcher.accountRowByHandle(handle));
    await row.waitForExist({ timeout: 10_000 });
    await row.click();

    // 4. Sheet closes + app refreshes on Home under the new account.
    await sleep(randomRange(1500, 2500));
    logger.info(`[switchAccount] now on @${handle}`);
}
