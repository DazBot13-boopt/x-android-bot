import type { WDIOBrowser } from '../driver';
import { selectors } from '../selectors';
import { logger } from '../utils/logger';
import { sleep, randomRange } from '../utils/adb';
import { adb } from '../utils/adb';

/**
 * Opens a tweet URL via Android deep-link and posts `count` reply comments.
 * URLs look like https://x.com/<handle>/status/<id> or https://twitter.com/<handle>/status/<id>.
 */
export async function commentOnUrl(
    driver: WDIOBrowser,
    url: string,
    comments: string[],
    count: number
): Promise<void> {
    logger.info(`[comment] navigating to ${url} (${count} comments)`);

    // Use the app's deep-link handler
    adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]);
    await sleep(randomRange(3000, 5000));

    for (let i = 0; i < count; i++) {
        const reply =
            (await driver.$(selectors.tweetDetail.replyButton).isExisting())
                ? await driver.$(selectors.tweetDetail.replyButton)
                : await driver.$(selectors.tweetDetail.replyButtonFr);
        await reply.waitForExist({ timeout: 10_000 });
        await reply.click();
        await sleep(randomRange(800, 1400));

        const input = await driver.$(selectors.composer.textInput);
        await input.waitForExist({ timeout: 10_000 });
        await input.click();
        await sleep(randomRange(300, 600));

        const text = comments[i % comments.length] || comments[0] || 'Nice!';
        await input.setValue(text);
        await sleep(randomRange(600, 1200));

        const postBtn =
            (await driver.$(selectors.composer.postButton).isExisting())
                ? await driver.$(selectors.composer.postButton)
                : await driver.$(selectors.composer.postButtonFr);
        await postBtn.click();
        logger.info(`[comment] ${i + 1}/${count} posted: "${text.slice(0, 40)}..."`);
        await sleep(randomRange(3000, 6000)); // let Twitter send, then scroll back to tweet detail
    }
}

export async function likeCurrentTweet(driver: WDIOBrowser): Promise<void> {
    const like =
        (await driver.$(selectors.tweetDetail.likeButton).isExisting())
            ? await driver.$(selectors.tweetDetail.likeButton)
            : await driver.$(selectors.tweetDetail.likeButtonFr);
    if (await like.isExisting()) {
        await like.click();
        logger.info(`[like] done`);
    } else {
        logger.warn(`[like] like button not found (maybe already liked)`);
    }
}
