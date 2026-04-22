import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange, adb } from '../utils/adb';

/**
 * Deep-links to a tweet URL via the X app, then posts `count` reply comments
 * from the currently-active account. Caller must have switched accounts first.
 *
 * Real UI flow (confirmed from live dump 2026-04):
 *   adb shell am start -a android.intent.action.VIEW -d "https://x.com/.../status/..."
 *   → tweet detail screen (same inline_reply / inline_like resource-ids as timeline)
 *   → tap `inline_reply` → composer opens in reply mode (same `tweet_text` / `button_tweet`)
 *   → type, tap POSTER, wait for send
 *   → we land back on the tweet detail; loop.
 */
export async function commentOnUrl(
    driver: WDIOBrowser,
    url: string,
    comments: string[],
    count: number
): Promise<void> {
    logger.info(`[comment] navigating to ${url} (${count} comments)`);

    // X app accepts x.com and twitter.com links as VIEW intents; the app handles them.
    adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]);
    await sleep(randomRange(3000, 5000));

    for (let i = 0; i < count; i++) {
        // 1. Tap reply on the top tweet (the detail's main tweet).
        const reply = await driver.$(selectors.tweetActions.reply);
        await reply.waitForExist({ timeout: 10_000 });
        await reply.click();
        await sleep(randomRange(800, 1400));

        // 2. Type the reply body.
        const input = await driver.$(selectors.composer.textInput);
        await input.waitForExist({ timeout: 10_000 });
        await input.click();
        await sleep(randomRange(300, 600));

        const text = comments[i % comments.length] || comments[0] || 'Nice!';
        await input.setValue(text);
        await sleep(randomRange(600, 1200));

        // 3. Send.
        const postBtn = await driver.$(selectors.composer.postButton);
        await postBtn.waitForExist({ timeout: 10_000 });
        await postBtn.click();
        logger.info(`[comment] ${i + 1}/${count} posted: "${text.slice(0, 40)}"`);

        // After sending, the composer closes and we're back on the tweet detail.
        // Wait a bit to let Twitter register the reply before the next iteration.
        await sleep(randomRange(3500, 6500));
    }
}

/**
 * Likes the currently-displayed tweet (timeline row or tweet-detail main tweet).
 * Same resource-id works in both contexts.
 */
export async function likeCurrentTweet(driver: WDIOBrowser): Promise<void> {
    const like = await driver.$(selectors.tweetActions.like);
    if (await like.isExisting()) {
        await like.click();
        logger.info(`[like] done`);
    } else {
        logger.warn(`[like] like button not found (already liked, or screen changed)`);
    }
}
