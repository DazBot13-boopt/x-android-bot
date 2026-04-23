import type { WDIOBrowser } from '../driver';
import { logger } from '../utils/logger';
import {
    sleep,
    randomRange,
    adb,
    coordTap,
    parseBoundsCenter,
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
 * Escapes a user-supplied string for literal use inside a RegExp source.
 */
function reEscape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the first `<node>` in a uiautomator XML dump whose `resource-id`
 * attribute equals `resId`, and returns its `bounds` attribute (e.g.
 * "[528,152][576,200]") or null.
 */
function findBoundsByResourceId(xml: string, resId: string): string | null {
    const re = new RegExp(
        `<node[^>]*\\bresource-id="${reEscape(resId)}"[^>]*\\bbounds="(\\[[^"]+\\])"`,
    );
    const m = xml.match(re);
    return m ? m[1] : null;
}

/**
 * Finds the first `<node>` whose `text` attribute contains `needle` (exact
 * substring, case-sensitive) and returns its `bounds`, or null.
 */
function findBoundsByText(xml: string, needle: string): string | null {
    // Match nodes: ... text="...NEEDLE..." ... bounds="[x1,y1][x2,y2]" ...
    // Attributes can appear in any order — match bounds either side.
    const escNeedle = reEscape(needle);
    const patterns = [
        // bounds appears AFTER text
        new RegExp(`<node[^>]*\\btext="[^"]*${escNeedle}[^"]*"[^>]*\\bbounds="(\\[[^"]+\\])"`),
        // bounds appears BEFORE text (rare, but defensive)
        new RegExp(`<node[^>]*\\bbounds="(\\[[^"]+\\])"[^>]*\\btext="[^"]*${escNeedle}[^"]*"`),
    ];
    for (const re of patterns) {
        const m = xml.match(re);
        if (m) return m[1];
    }
    return null;
}

/**
 * Finds the first `<node>` whose `content-desc` attribute contains `needle`
 * (exact substring) and returns its `bounds`, or null.
 */
function findBoundsByContentDesc(xml: string, needle: string): string | null {
    const escNeedle = reEscape(needle);
    const patterns = [
        new RegExp(`<node[^>]*\\bcontent-desc="[^"]*${escNeedle}[^"]*"[^>]*\\bbounds="(\\[[^"]+\\])"`),
        new RegExp(`<node[^>]*\\bbounds="(\\[[^"]+\\])"[^>]*\\bcontent-desc="[^"]*${escNeedle}[^"]*"`),
    ];
    for (const re of patterns) {
        const m = xml.match(re);
        if (m) return m[1];
    }
    return null;
}

/**
 * Tries to find a community row in the audience-selector bottom sheet by name.
 * The row can match either on `text` (the community's display name) or on
 * `content-desc` (which typically reads "<name> <N> membres"), so we try both
 * strategies.
 */
function findCommunityRowBounds(xml: string, communityName: string): string | null {
    return (
        findBoundsByText(xml, communityName) ||
        findBoundsByContentDesc(xml, communityName)
    );
}

/**
 * Selects a community as the audience of the currently-open composer.
 *
 * Flow:
 *   1. Tap the "Tout le monde" / "Everyone" audience pill at the top of the
 *      composer to open the audience picker bottom sheet.
 *   2. Find the community row by its name (in text OR content-desc) and tap
 *      its center.
 *   3. The sheet auto-dismisses and the composer resumes with the community
 *      selected — the audience pill text flips from "Tout le monde" to the
 *      community name, which is how we confirm success.
 *
 * If the community name is not visible (e.g. hidden below the fold of the
 * sheet), we scroll the sheet up once and re-try. If still not found we throw
 * so the caller can surface a clear error.
 */
/**
 * Dumps the current UI via the live Appium/UIA2 session rather than the
 * `adb shell uiautomator dump` CLI. Critical because with an active Appium
 * session on the device, the CLI dump is starved of the single shared
 * UIAutomator instrumentation slot and hangs 5+ minutes on composer screens.
 * `driver.getPageSource()` goes through the session we already own and
 * returns instantly.
 */
async function dumpViaDriver(driver: WDIOBrowser): Promise<string> {
    return await driver.getPageSource();
}

async function selectCommunityAudience(
    driver: WDIOBrowser,
    communityName: string,
): Promise<void> {
    logger.info(`[post] selecting community audience "${communityName}"`);

    // 1. Tap the audience pill.
    //    We CANNOT dump the composer to find the pill: the composer has a
    //    focused EditText + visible soft keyboard, and `uiautomator dump`
    //    (even with --compressed) hangs forever waiting for window idle in
    //    that state on this device. Verified by running the dump from a
    //    separate terminal while the composer was open — it never returns.
    //
    //    Instead we tap at a screen-relative position derived from `wm size`.
    //    On the X Android composer the "Tout le monde / Everyone" pill is
    //    consistently at ~32% of the width, ~11% of the height, right of
    //    the avatar. Verified on 720x1600 (Tecno KM5) where that gives the
    //    center of the pill. Tapping the pill opens the audience sheet,
    //    which dismisses the keyboard — and after that, dumping works
    //    reliably again for the sheet's community rows.
    const { width, height } = getScreenSize();
    const pillX = Math.round(width * 0.32);
    const pillY = Math.round(height * 0.11);
    logger.info(
        `[post] tapping audience pill at (${pillX}, ${pillY}) on ${width}x${height}`,
    );
    coordTap(pillX, pillY);
    await sleep(randomRange(1800, 2500));

    // 2. Find and tap the community row in the bottom sheet.
    //    Retry with a scroll if the row isn't visible yet.
    let rowBounds: string | null = null;
    for (let attempt = 0; attempt < 3 && !rowBounds; attempt++) {
        const sheetXml = await dumpViaDriver(driver);
        rowBounds = findCommunityRowBounds(sheetXml, communityName);
        if (!rowBounds && attempt < 2) {
            logger.info(
                `[post] community "${communityName}" not visible yet, scrolling sheet up (attempt ${attempt + 1}/3)`,
            );
            // Scroll within the sheet (it occupies roughly the lower half of
            // the screen). Coordinates are screen-relative so this works on
            // any resolution — matches the 720x1600 baseline (50%, 75%→37.5%).
            const swipeX = Math.round(width * 0.5);
            const swipeY1 = Math.round(height * 0.75);
            const swipeY2 = Math.round(height * 0.375);
            adb(['shell', 'input', 'swipe', String(swipeX), String(swipeY1), String(swipeX), String(swipeY2), '400']);
            await sleep(randomRange(700, 1000));
        }
    }
    if (!rowBounds) {
        throw new Error(
            `[post] community "${communityName}" not found in audience sheet — is the account a member?`,
        );
    }
    const rowCenter = parseBoundsCenter(rowBounds);
    if (!rowCenter) throw new Error(`[post] bad community row bounds: ${rowBounds}`);
    logger.info(`[post] tapping community row at (${rowCenter.x}, ${rowCenter.y})`);
    coordTap(rowCenter.x, rowCenter.y);

    // Sheet dismissal + composer re-render.
    await sleep(randomRange(1200, 1800));
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

    // 4. Find & tap the POSTER button via one-shot dump + adb input tap.
    const BTN_RES_ID = `${config.android.xAppPackage}:id/button_tweet`;
    let bounds: string | null = null;
    for (let attempt = 0; attempt < 4 && !bounds; attempt++) {
        const xml = await dumpViaDriver(driver);
        bounds = findBoundsByResourceId(xml, BTN_RES_ID);
        if (!bounds) {
            logger.info(
                `[post] POSTER button not visible yet (attempt ${attempt + 1}/4), waiting…`,
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

    logger.info(`[post] tapping POSTER at (${center.x}, ${center.y})`);
    coordTap(center.x, center.y);

    // 5. Let the tweet upload and the composer close.
    await sleep(randomRange(3500, 5000));

    logger.info(`[post] published`);
}
