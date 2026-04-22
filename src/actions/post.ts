import type { WDIOBrowser } from '../driver';
import { logger } from '../utils/logger';
import {
    sleep,
    randomRange,
    adb,
    dumpUiHierarchy,
    coordTap,
    parseBoundsCenter,
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
 * Looks for an element with `resource-id="com.twitter.android:id/<resId>"`
 * in a UIAutomator XML dump and returns its `bounds` attribute, or null if
 * not found.
 */
function findBoundsByResourceId(xml: string, resId: string): string | null {
    // Simple but robust regex: find a node element whose resource-id attribute
    // matches exactly, then capture its bounds attribute. We don't need a full
    // XML parser because uiautomator dumps use a stable, flat-attribute format.
    const re = new RegExp(
        `<node[^>]*resource-id="${resId.replace(/[.$^*+?()\\[\\]|]/g, '\\$&')}"[^>]*bounds="(\\[[^"]+\\])"`,
    );
    const m = xml.match(re);
    return m ? m[1] : null;
}

/**
 * Composes and publishes a tweet from whichever account is currently active.
 * Caller is responsible for calling switchAccount() first.
 *
 * Design: we avoid every known Appium/UIA2 failure mode in this path.
 *
 *  1. The compose FAB (+) is auto-hidden by the X app after a downward scroll,
 *     so warmup reliably breaks it.
 *  2. Revealing it via a reverse swipe works visually but UIA2 reports stale
 *     bounds, and coord-tapping empty space crashed the instrumentation.
 *  3. A plain `SEND` intent is routed to the in-app browser activity, which
 *     silently no-ops when the caller is already inside the X package.
 *
 * So we launch `com.twitter.composer.ComposerActivity` by component name
 * (allowed from `adb shell` even though it's `exported=false`) and pass the
 * tweet text as a `SEND` + `EXTRA_TEXT` extra so the composer pre-fills
 * itself. We then tap the "POSTER" button using one-shot `uiautomator dump`
 * + `adb input tap` — never going through the live Appium/UIA2 session for
 * the post step itself, because the activity transition consistently crashes
 * the UIA2 instrumentation mid-find.
 *
 * The Appium session remains open for the caller's benefit (e.g. chaining
 * another action), but this function does not make any UIA2 calls after the
 * intent fires.
 */
export async function post(driver: WDIOBrowser, text: string): Promise<void> {
    // We accept the driver argument to keep the signature stable for the
    // caller/worker but we deliberately do not use it here. Underscore-prefix
    // suppresses "unused" lint warnings.
    void driver;

    logger.info(`[post] composing (${text.length} chars)`);

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

    // 2. Give the composer a beat to inflate. This is the window during which
    //    UIA2 previously crashed if we tried findElement.
    await sleep(randomRange(3500, 4500));

    // 3. Find the POSTER button via a one-shot uiautomator dump (not Appium).
    //    Retry up to 3 times: the composer may need a couple of seconds to
    //    finish enabling the button after the text is committed.
    const BTN_RES_ID = `${config.android.xAppPackage}:id/button_tweet`;
    let bounds: string | null = null;
    for (let attempt = 0; attempt < 3 && !bounds; attempt++) {
        const xml = dumpUiHierarchy();
        bounds = findBoundsByResourceId(xml, BTN_RES_ID);
        if (!bounds) {
            logger.info(
                `[post] POSTER button not visible yet (attempt ${attempt + 1}/3), waiting…`,
            );
            await sleep(randomRange(1200, 1800));
        }
    }
    if (!bounds) {
        throw new Error(
            `[post] POSTER button (${BTN_RES_ID}) not found in composer — is the composer actually open?`,
        );
    }

    const center = parseBoundsCenter(bounds);
    if (!center) {
        throw new Error(`[post] could not parse POSTER bounds: ${bounds}`);
    }

    // 4. Fire a physical tap via `adb input tap`. Does not touch UIA2.
    logger.info(`[post] tapping POSTER at (${center.x}, ${center.y})`);
    coordTap(center.x, center.y);

    // 5. Let the tweet upload and the composer close.
    await sleep(randomRange(3500, 5000));

    logger.info(`[post] published`);
}
