# x-android-bot

Mobile worker that pilots a **physical Android phone** via ADB + Appium to run automated actions (post, comment, like, warmup) against the X (Twitter) app, on behalf of the SAAS dashboard.

## Why this exists

Running Playwright against `x.com` from a datacenter IP gets detected fast — captchas, shadowbans, session kicks. Piloting the **real X Android app on your own phone** bypasses all of that because Twitter sees a real device, a real IP, and a real fingerprint. The cost: no parallelism (one phone = one account at a time, sequential execution).

This worker connects to the same Redis/BullMQ queue as the SAAS backend. The backend stays responsible for orchestration (when MAIN posts, push N jobs for the supports); the mobile worker just executes whatever lands in the queue.

## Architecture

```
┌───────────────────────────┐       Redis       ┌──────────────────────────┐       USB + ADB      ┌─────────────┐
│ SAAS backend (on your PC) │ ───── queue ────▶ │ x-android-bot (this app) │ ───── Appium ─────▶ │   Android   │
│  Next.js + Express API    │                    │  BullMQ consumer         │                      │   X app     │
└───────────────────────────┘                    └──────────────────────────┘                      └─────────────┘
```

## Prerequisites

Tested on **Kali / Debian / Ubuntu** Linux. Windows works but is more painful for ADB/Appium.

### 1. System packages

```bash
sudo apt update
sudo apt install -y nodejs npm adb openjdk-17-jdk git curl
# Node 20+ recommended — if apt gives you an older version:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Appium

```bash
sudo npm install -g appium
appium driver install uiautomator2
# Sanity check
appium --version
```

### 3. Phone setup

On your Android phone:
1. Settings → About phone → tap "Build number" 7 times → developer mode unlocked
2. Settings → System → Developer options → enable **USB debugging**
3. Plug the phone into your PC with a USB cable
4. Your phone shows "Allow USB debugging?" dialog → check "Always allow from this computer" → OK
5. On your PC:
   ```bash
   adb devices
   # Expected: abcd1234    device
   ```

If you see `unauthorized`, tap OK on the phone. If you see nothing, the cable is probably a charge-only cable — use a data cable.

### 4. Log all X accounts into the X app (manually, once)

Open the X app → nav drawer → profile chevron → "Add existing account" → log in with each handle you want to bot. Do this **now**, before running the worker. The worker only switches between already-logged-in accounts, it never logs in itself.

## Install

```bash
git clone https://github.com/DazBot13-boopt/x-android-bot.git
cd x-android-bot
npm install
cp .env.example .env
# Edit .env — set REDIS_HOST (probably 127.0.0.1 if SAAS stack is local), etc.
```

## Run

Open 2 terminals.

**Terminal 1 — Appium server** (stays running):
```bash
appium
```

**Terminal 2 — the worker** (stays running, auto-reloads in dev):
```bash
npm run dev
```

First log should show `ADB devices: <serial>(device)` + `Connected to Redis …` + `Worker listening on queue "twitter-actions"`. Then it idles waiting for jobs.

## Triggering a job (manual test)

From the SAAS backend you can enqueue a test job via a small script:

```ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const q = new Queue('twitter-actions', { connection: new IORedis() });
await q.add('manual-test', {
    accountId: 'local-test',
    action: 'autoComment',
    config: {
        username: 'alice_on_x', // the handle to switch to
        url: 'https://x.com/elonmusk/status/1234567890',
        count: 3,
        comments: ['Nice!', 'Love it', 'Agree 💯'],
    },
});
```

The mobile worker will pick it up, switch to `@alice_on_x`, warmup for ~20s, then post 3 replies on that tweet.

## Debugging selectors

The X app updates its UI regularly. If an action fails with "element not found", capture the current screen:

```bash
# Position the X app on the screen you want (e.g. composer open)
npm run dump-ui -- composer
# → dumps/composer.xml
```

Open the XML, find the element you care about (look for `content-desc`, `resource-id`, or `text` attributes), and update `src/selectors.ts`.

## Known limitations

- **Sequential**: your phone can only do one action at a time. A MAIN post + 5 supports × 10 comments = ~25-30 minutes.
- **Your phone is busy**: while the worker runs, you can't use the phone normally.
- **Account switching quirk**: X sometimes shows an interstitial ("Check out what's new") after login switches; we dismiss the common cases but you may need to add selectors for your locale.
- **No captcha solver yet**: if Twitter challenges with Arkose, the worker will stall. Add 2Captcha later if needed.

## Files

| File | What it does |
|---|---|
| `src/index.ts` | Entrypoint — checks for an attached device, starts the worker. |
| `src/queue.ts` | BullMQ consumer — dispatches each job to the right action. |
| `src/driver.ts` | Connects to Appium + negotiates a UiAutomator2 session on the phone. |
| `src/selectors.ts` | All UI selectors for the X app (FR + EN). Refine these as the app updates. |
| `src/actions/switchAccount.ts` | Open nav drawer, tap account row matching `@username`. |
| `src/actions/post.ts` | Compose + publish a tweet. |
| `src/actions/comment.ts` | Open a tweet URL, post N reply comments; also has `likeCurrentTweet`. |
| `src/actions/warmup.ts` | Scroll the home feed for a few seconds — run between actions. |
| `src/utils/adb.ts` | Wrapper around raw ADB commands + helpers. |
| `src/utils/dump.ts` | CLI for dumping the current UI XML (for selector refinement). |
| `src/utils/logger.ts` | Tiny leveled logger. |

## License

Private. Don't publish.
