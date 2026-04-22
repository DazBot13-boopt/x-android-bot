/**
 * Selectors for the X (Twitter) Android app.
 *
 * Tuned from real UI dumps of the French app (com.twitter.android). If you're
 * on the English app, most resource-ids are identical — only text / content-desc
 * values differ (we keep FR + EN fallbacks where needed).
 *
 * Selector syntax (webdriverio):
 *   "~label"                         → AccessibilityId (content-desc)
 *   "id=com.twitter.android:id/xyz"  → resource-id
 *   "android=new UiSelector()…"      → UiAutomator2 DSL (most flexible)
 *
 * If an action starts failing after an X app update, dump the screen again:
 *   npm run dump-ui -- <screen-label>
 * then adjust the constants below.
 */

const PKG = 'com.twitter.android';

export const selectors = {
    // ── Home / bottom nav ─────────────────────────────────────────────────
    home: {
        // Top-left avatar / hamburger. Opens the account-switcher bottom sheet.
        // FR: "Montrer le menu de navigation"   EN: "Show navigation drawer"
        navDrawerFr: '~Montrer le menu de navigation',
        navDrawerEn: '~Show navigation drawer',

        // Floating "compose new post" button (bottom-right).
        // resource-id is stable across locales; FR content-desc is "Nouveau post".
        composeFab: `id=${PKG}:id/composer_write`,

        // Bottom-nav tab "Home" / "Accueil" — used to reset navigation after an action.
        homeTabFr: 'android=new UiSelector().descriptionStartsWith("Accueil")',
        homeTabEn: 'android=new UiSelector().descriptionStartsWith("Home")',
    },

    // ── Side drawer (opens after tapping the nav-drawer avatar on Home) ───
    // Contains: top bar with quick-switch avatar shortcuts + "Permuter les comptes"
    // button, then the current account info, then Profil / Premium / Communautés /
    // Signets / Listes / Spaces / Creator Studio / Paramètres et support.
    sideDrawer: {
        // Root of the drawer — use to wait for it to finish animating in.
        container: `id=${PKG}:id/drawer`,
        // "Permuter les comptes" / "Switch accounts" button in the top-right of the
        // drawer avatar row. Tapping it opens the "Comptes" bottom sheet over the drawer.
        switchAccountsFr: '~Permuter les comptes',
        switchAccountsEn: '~Switch accounts',
    },

    // ── Account-switcher bottom sheet ─────────────────────────────────────
    // Opens when you tap "Permuter les comptes" inside the side drawer. Shows
    // "Comptes" header + list of logged-in accounts (display name + @handle) +
    // "Ajouter un compte".
    accountSwitcher: {
        // Wait for the sheet's container to appear.
        sheetContainer: `id=${PKG}:id/design_bottom_sheet`,
        // Each account row has a TextView with the @handle text, e.g. "@alice_on_x".
        accountRowByHandle: (handle: string) => {
            const h = handle.startsWith('@') ? handle : `@${handle}`;
            // Exact-text match on the @handle TextView — clicking it triggers the switch.
            return `android=new UiSelector().text("${h}")`;
        },
        // Marker on the currently-active account row.
        currentAccountMarker: '~Compte actuel',
        currentAccountMarkerEn: '~Current account',
    },

    // ── Composer (new post or reply) ──────────────────────────────────────
    composer: {
        // EditText for the tweet / reply body.
        textInput: `id=${PKG}:id/tweet_text`,
        // "POSTER" / "Post" button in the top-right of the composer.
        postButton: `id=${PKG}:id/button_tweet`,
        // Back / close button (discards draft).
        backButtonFr: '~Retourner en arrière',
        backButtonEn: '~Back',
        // Avatar inside the composer showing the currently-selected author. Tapping
        // it ALSO opens the account switcher bottom sheet — useful fallback if the
        // home-screen drawer fails.
        authorSwitcher: `id=${PKG}:id/userImage`,
    },

    // ── Inline tweet actions (timeline row + tweet-detail screen) ─────────
    // These resource-ids are the same whether the tweet is shown inline in the
    // timeline or on its own detail page after a deep-link navigation.
    tweetActions: {
        reply: `id=${PKG}:id/inline_reply`,
        retweet: `id=${PKG}:id/inline_retweet`,
        like: `id=${PKG}:id/inline_like`,
        bookmark: `id=${PKG}:id/inline_bookmark`,
        share: `id=${PKG}:id/inline_twitter_share`,
    },

    // ── Common ────────────────────────────────────────────────────────────
    common: {
        dismissDialogOk: 'id=android:id/button1',
        dismissDialogCancel: 'id=android:id/button2',
    },
};

export type Selectors = typeof selectors;
