import type { WDIOBrowser } from '../driver';
import { logger } from '../utils/logger';
import {
    sleep,
    randomRange,
    adb,
    getScreenSize,
} from '../utils/adb';
import { config } from '../config';

/**
 * POSIX single-quote a string for safe interpolation into a `sh -c` command.
 * `a'b` -> `'a'\''b'`.
 */
function shellSingleQuote(s: string): string {
    return "'" + s.replace(/'/g, `'\\''`) + "'";
}

/**
 * Selects a community as the audience of the currently-open composer.
 *
 * Flow:
 *   1. Click the "Tout le monde" / "Everyone" audience pill at the top of the
 *      composer to open the audience picker bottom sheet.
 *   2. Find the community row by its name and click it (scrolling the sheet
 *      up to 2× if the row is below the fold).
 *   3. The sheet auto-dismisses and the composer resumes with the community
 *      selected — the audience pill text flips from "Tout le monde" to the
 *      community name.
 *
 * We interact via Appium's UiSelector / .click() rather than `adb input tap`
 * + `uiautomator dump` because:
 *   - `adb shell uiautomator dump` hangs 5+ minutes on the composer when an
 *     Appium session holds the UIA2 instrumentation slot (verified with the
 *     user: 339s + 294s for two manual dumps).
 *   - `adb shell input tap` sometimes gets absorbed by the soft-keyboard IME
 *     when the composer's EditText is focused, never reaching the pill.
 * Appium's UiSelector resolves element bounds via AccessibilityNodeInfo
 * (no window-idle needed) and .click() fires performAction(CLICK) directly
 * on the node, bypassing the IME entirely.
 */

/**
 * Wrap a WebDriverIO UiSelector query. Using `~`-accessibility id and
 * `android=...` UiAutomator queries both go through the active UIA2
 * session, which:
 *   - clicks via AccessibilityNodeInfo.performAction(), bypassing focus
 *     and keyboard-intercept issues that break plain `input tap`;
 *   - does not require window-idle, unlike `adb shell uiautomator dump`.
 */
async function findByUiSelector(driver: WDIOBrowser, uiSelector: string) {
    return await driver.$(`android=${uiSelector}`);
}

async function selectCommunityAudience(
    driver: WDIOBrowser,
    communityName: string,
): Promise<void> {
    logger.info(`[post] selecting community audience "${communityName}"`);

    // 1. Click the audience pill via Appium.
    //    We tried `adb input tap` at screen-relative coords (PR #21), but
    //    with the composer's EditText focused and the soft keyboard up,
    //    Android sometimes routes the tap to the IME instead of the pill.
    //    Appium's .click() goes through AccessibilityNodeInfo, which fires
    //    the pill's onClick directly regardless of focus/IME state.
    const pillSelector =
        'new UiSelector().className("android.widget.TextView").textContains("Tout le monde")';
    const pill = await findByUiSelector(driver, pillSelector);
    await pill.waitForExist({ timeout: 10_000 });
    logger.info('[post] clicking audience pill via Appium');
    await pill.click();
    await sleep(randomRange(1500, 2200));

    // 2. Find and click the community row in the bottom sheet.
    //    Retry with a scroll if the row isn't visible yet.
    const { width, height } = getScreenSize();
    const rowSelector = `new UiSelector().textContains(${jsStringLiteralToUiAutomator(communityName)})`;
    let clicked = false;
    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
        const row = await findByUiSelector(driver, rowSelector);
        const exists = await row.isExisting();
        if (exists) {
            logger.info(`[post] clicking community row "${communityName}" via Appium`);
            await row.click();
            clicked = true;
            break;
        }
        if (attempt < 2) {
            logger.info(
                `[post] community "${communityName}" not visible yet, scrolling sheet up (attempt ${attempt + 1}/3)`,
            );
            const swipeX = Math.round(width * 0.5);
            const swipeY1 = Math.round(height * 0.75);
            const swipeY2 = Math.round(height * 0.375);
            adb(['shell', 'input', 'swipe', String(swipeX), String(swipeY1), String(swipeX), String(swipeY2), '400']);
            await sleep(randomRange(700, 1000));
        }
    }
    if (!clicked) {
        throw new Error(
            `[post] community "${communityName}" not found in audience sheet — is the account a member?`,
        );
    }

    // Sheet dismissal + composer re-render.
    await sleep(randomRange(1200, 1800));
}

/**
 * Escapes a string for embedding as a UiAutomator `textContains("...")`
 * argument. UiAutomator parses its own Java-ish string literal, so we must
 * escape backslashes and double quotes.
 */
function jsStringLiteralToUiAutomator(s: string): string {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface PostOptions {
    /**
     * If set, the post will be scoped to the community whose display name
     * matches this string (exact substring match against the row's text or
     * content-desc in the audience selector). The account must already be a
     * member. If unset, the post is public ("Tout le monde").
     */
    community?: string;
}

/**
 * Composes and publishes a tweet from whichever account is currently active.
 * Caller is responsible for calling switchAccount() first.
 *
 * Strategy (see earlier PRs for context on why each step exists):
 *   - Launch ComposerActivity directly by component name; pass SEND + EXTRA_TEXT
 *     to pre-fill the text. This skips the FAB + radial + typing entirely.
 *   - If a community is requested, tap the audience pill and pick the
 *     community in the bottom sheet before posting.
 *   - Tap POSTER using one-shot `uiautomator dump` + `adb input tap` so we
 *     never touch Appium/UIA2 during the fragile post-intent window.
 */
export async function post(
    driver: WDIOBrowser,
    text: string,
    options: PostOptions = {},
): Promise<void> {
    const { community } = options;
    logger.info(
        `[post] composing (${text.length} chars)${community ? ` in community "${community}"` : ''}`,
    );

    // 1. Launch the composer directly with pre-filled text.
    try {
        const cmd = [
            'am start',
            `-n ${config.android.xAppPackage}/com.twitter.composer.ComposerActivity`,
            '-a android.intent.action.SEND',
            '-t text/plain',
            `--es android.intent.extra.TEXT ${shellSingleQuote(text)}`,
        ].join(' ');
        adb(['shell', cmd]);
    } catch (err) {
        throw new Error(
            `[post] failed to launch ComposerActivity: ${(err as Error).message}`,
        );
    }

    // 2. Give the composer a beat to inflate.
    await sleep(randomRange(3500, 4500));

    // 3. Optionally switch audience to a community.
    if (community) {
        await selectCommunityAudience(driver, community);
    }

    // 4. Click the POSTER button via Appium. Same rationale as the pill:
    //    Appium's .click() bypasses focus/IME interception that breaks
    //    plain `input tap`, and doesn't require window-idle for discovery.
    const BTN_RES_ID = `${config.android.xAppPackage}:id/button_tweet`;
    const posterSelector = `new UiSelector().resourceId("${BTN_RES_ID}")`;
    const poster = await findByUiSelector(driver, posterSelector);
    try {
        await poster.waitForExist({ timeout: 15_000 });
    } catch {
        throw new Error(
            `[post] POSTER button (${BTN_RES_ID}) not found in composer — is the composer actually open?`,
        );
    }
    logger.info('[post] clicking POSTER via Appium');
    await poster.click();

    // 5. Let the tweet upload and the composer close.
    await sleep(randomRange(3500, 5000));

    logger.info(`[post] published`);
}
