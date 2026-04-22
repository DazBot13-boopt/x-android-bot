import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { logger } from './utils/logger';
import { getDriver } from './driver';
import { switchAccount } from './actions/switchAccount';
import { post } from './actions/post';
import { commentOnUrl, likeCurrentTweet } from './actions/comment';
import { warmup } from './actions/warmup';

const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
});

connection.on('connect', () => logger.info(`Connected to Redis ${config.redis.host}:${config.redis.port}`));
connection.on('error', (err) => logger.error('Redis error:', err.message));

/**
 * Job payload pushed by the SAAS backend:
 * {
 *   accountId: string,       // TwitterAccount.id in the SAAS DB
 *   action: 'post' | 'autoComment' | 'autoLike' | 'warmup',
 *   config: { text?, url?, count?, comments?[], username? }
 * }
 *
 * We receive a `username` so the mobile worker knows which logged-in account to switch to.
 * The SAAS backend is responsible for injecting `username` into every job's config before enqueueing,
 * since the mobile worker has no DB access (by design — keeps it simple/stateless).
 */
export function startWorker() {
    const worker = new Worker(
        config.queueName,
        async (job: Job) => {
            const { action, config: jobConfig } = job.data as {
                action: string;
                config: {
                    username?: string;
                    text?: string;
                    url?: string;
                    count?: number;
                    comments?: string[];
                };
            };
            logger.info(`[job ${job.id}] action=${action} username=${jobConfig?.username || '?'}`);

            const driver = await getDriver();

            if (!jobConfig?.username) {
                throw new Error(
                    `Job ${job.id}: missing config.username. The SAAS backend must send the X handle to switch to.`
                );
            }

            await switchAccount(driver, jobConfig.username);
            await warmup(driver, 20_000); // short warmup between each action

            switch (action) {
                case 'post':
                case 'autoPost': {
                    const text = jobConfig.text || '';
                    if (!text) throw new Error('post action requires config.text');
                    await post(driver, text);
                    break;
                }
                case 'autoComment':
                case 'spamComments': {
                    if (!jobConfig.url) throw new Error('autoComment action requires config.url');
                    const comments = jobConfig.comments || [
                        'Great content! 🔥',
                        'Nice 👌',
                        'Love this!',
                        'So true',
                        'Agree 💯',
                    ];
                    await commentOnUrl(driver, jobConfig.url, comments, jobConfig.count || 10);
                    break;
                }
                case 'autoLike': {
                    if (!jobConfig.url) throw new Error('autoLike action requires config.url');
                    // Deep-link to tweet
                    const { adb } = await import('./utils/adb');
                    adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', jobConfig.url]);
                    await new Promise((r) => setTimeout(r, 3000));
                    await likeCurrentTweet(driver);
                    break;
                }
                case 'warmup': {
                    await warmup(driver, 60_000);
                    break;
                }
                default:
                    logger.warn(`[job ${job.id}] unknown action: ${action}, skipping.`);
            }

            return { ok: true };
        },
        {
            connection,
            concurrency: config.workerConcurrency,
        }
    );

    worker.on('completed', (job) => logger.info(`[job ${job.id}] completed`));
    worker.on('failed', (job, err) => logger.error(`[job ${job?.id}] failed: ${err.message}`));
    worker.on('error', (err) => logger.error('Worker error:', err));

    logger.info(`Worker listening on queue "${config.queueName}" (concurrency=${config.workerConcurrency})`);
    return worker;
}
