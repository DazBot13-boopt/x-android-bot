/**
 * Selectors for the X (Twitter) Android app.
 *
 * These are STARTING POINTS — the X app updates its layout often and the exact
 * content-desc/resource-id may vary by version and language. We'll refine them
 * together by dumping the UI hierarchy with `npm run dump-ui` and inspecting it.
 *
 * Selector format is webdriverio-compatible:
 *   "~label"                         → AccessibilityId (android:contentDescription)
 *   "id=com.twitter.android:id/xyz"  → resource-id
 *   "android=new UiSelector().text(\"Post\")"  → UiAutomator2 DSL
 *   "//android.widget.Button[@text='Post']"    → XPath (slowest, last resort)
 */

export const selectors = {
    // ── Home / navigation ──────────────────────────────────────────────────
    home: {
        composeFab: '~Post', // bottom-right floating button (labelled "Post" in EN, "Poster" in FR)
        composeFabFr: '~Poster',
        profileDrawer: '~Show navigation drawer', // top-left hamburger / avatar
        timelineFirstTweet: 'id=com.twitter.android:id/timeline', // container; we tap children
    },

    // ── Account switcher (in nav drawer) ───────────────────────────────────
    accountSwitcher: {
        dropdownChevron: '~Account menu', // chevron next to current account name
        addExistingAccount: '~Add an existing account',
        // An account row is identified by the username text (@handle)
        accountRowByUsername: (handle: string) =>
            `android=new UiSelector().textContains("@${handle.replace(/^@/, '')}")`,
    },

    // ── Composer ───────────────────────────────────────────────────────────
    composer: {
        textInput: 'id=com.twitter.android:id/tweet_text',
        postButton: '~Post', // same content-desc as FAB on home — disambiguate by screen
        postButtonFr: '~Poster',
        closeButton: '~Close', // X button top-left of composer
    },

    // ── Tweet detail (reply / like / URL navigation) ───────────────────────
    tweetDetail: {
        likeButton: '~Like',
        likeButtonFr: '~J\u2019aime',
        unlikeButton: '~Liked',
        replyButton: '~Reply',
        replyButtonFr: '~R\u00e9pondre',
    },

    // ── Common ─────────────────────────────────────────────────────────────
    common: {
        backButton: '~Navigate up',
        dismissDialog: 'id=android:id/button1',
    },
};

export type Selectors = typeof selectors;
