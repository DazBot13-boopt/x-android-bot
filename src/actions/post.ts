import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange, adb } from '../utils/adb';
import { config } from '../config';

/**
 * POSIX single-quote a string for safe interpolation into a `sh -c` command.
 * Strategy: wrap the whole thing in single quotes, and escape any literal
 * single quote inside by closing the quote, writing a backslash-escaped
 * quote, and reopening: `a'b` -> `'a'\''b'`.
 */
function shellSingleQuote(s: string): string {
    return "'" + s.replace(/'/g, `'\\''`) + "'";
}

/**
 * Composes and publishes a tweet from whichever account is currently active.
 * Caller is responsible for calling switchAccount() first.
 *
 * We bypass the floating compose button (+) and its radial menu entirely by
 * sending an Android SEND intent directly to the X app. This is the same
 * intent the system uses when you tap "Share → X" from any other app, and
 * the X app handles it by opening its composer with the text pre-filled.
 *
 * The relevant intent filter in AndroidManifest.xml:
 *     <activity name="com.twitter.browser.BrowserActivity">
 *       <intent-filter>
 *         <action name="android.intent.action.SEND" />
 *         <data mimeType="text/plain" />
 *       </intent-filter>
 *     </activity>
 *
 * Advantages over the FAB flow:
 *   - no "FAB hidden after scroll" problem (warmup kills the FAB)
 *   - no radial menu to traverse (two-tap trap)
 *   - no UIAutomator2 pressure during the risky window
 *   - works identically in FR / EN / any locale (pure intent, no text match)
 *
 * Fallback: if the composer doesn't render within ~10 s we try the deep-link
 * `twitter://post` as a second attempt; if that also fails we surface a
 * clear error rather than thrashing on the FAB.
 */
export async function post(driver: WDIOBrowser, text: string): Promise<void> {
    logger.info(`[post] composing (${text.length} chars)`);

    // 1. Fire the SEND intent scoped to the X package. Pre-fills `tweet_text`.
    //
    //    `adb shell` joins all extra argv with spaces into a single command
    //    string and hands it to `sh` on the device, which re-splits on spaces.
    //    So `--es EXTRA_TEXT "hello world"` as separate JS argv elements would
    //    be reinterpreted as two args on the device side and `world` would
    //    leak into the `-p` slot. We therefore build the full command string
    //    ourselves with proper POSIX quoting and pass it as a single argv.
    try {
        const cmd = [
            'am start',
            '-a android.intent.action.SEND',
            '-t text/plain',
            `--es android.intent.extra.TEXT ${shellSingleQuote(text)}`,
            `-p ${config.android.xAppPackage}`,
        ].join(' ');
        adb(['shell', cmd]);
    } catch (err) {
        logger.warn(`[post] SEND intent failed: ${(err as Error).message}`);
    }
    await sleep(randomRange(1200, 2000));

    // 2. Wait for the composer's EditText to appear.
    let input = await driver.$(selectors.composer.textInput);
    const composerOpened = await input
        .waitForExist({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

    if (!composerOpened) {
        // 3. Fallback: deep-link to the compose screen. Some X versions route
        //    SEND through an intermediate "send as post / DM" chooser; the
        //    twitter://post deep link skips that.
        logger.warn('[post] SEND did not open composer — trying twitter://post deeplink');
        try {
            const cmd = [
                'am start',
                '-a android.intent.action.VIEW',
                '-d twitter://post',
                `-p ${config.android.xAppPackage}`,
            ].join(' ');
            adb(['shell', cmd]);
        } catch (err) {
            logger.warn(`[post] VIEW intent failed: ${(err as Error).message}`);
        }
        await sleep(randomRange(1200, 2000));
        input = await driver.$(selectors.composer.textInput);
        await input.waitForExist({ timeout: 10_000 });
        // Deep link opens an empty composer — we need to type the text ourselves.
        await input.click();
        await sleep(randomRange(300, 600));
        await input.setValue(text);
        await sleep(randomRange(800, 1600));
    } else {
        // SEND path already pre-filled the text; just confirm focus so some X
        // versions that re-render on focus don't drop the content.
        // (We intentionally do NOT re-type — that would duplicate the text.)
    }

    // 4. Tap the "POSTER" / "Post" button.
    const postBtn = await driver.$(selectors.composer.postButton);
    await postBtn.waitForExist({ timeout: 10_000 });
    await postBtn.click();
    await sleep(randomRange(2500, 4500));

    logger.info(`[post] published`);
}
