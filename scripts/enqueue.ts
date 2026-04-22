/**
 * CLI to enqueue a single test job onto the BullMQ `twitter-actions` queue.
 *
 * Usage:
 *   npx ts-node scripts/enqueue.ts warmup --username k1lls3vr4q
 *   npx ts-node scripts/enqueue.ts post   --username k1lls3vr4q --text "Hello from x-android-bot"
 *   npx ts-node scripts/enqueue.ts autoLike    --username k1lls3vr4q --url https://x.com/elonmusk/status/1234
 *   npx ts-node scripts/enqueue.ts autoComment --username k1lls3vr4q --url https://x.com/elonmusk/status/1234 --count 2 --comments "Nice!" "Agree 💯"
 *
 * The worker (`npm run dev`) will pick up the job and execute it on the
 * currently-attached Android phone. Make sure the phone is on the Home screen
 * of the X app before enqueuing.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../src/config';

type Args = {
    action: string;
    username?: string;
    text?: string;
    url?: string;
    count?: number;
    comments?: string[];
    community?: string;
};

function parseArgs(argv: string[]): Args {
    const [action, ...rest] = argv;
    if (!action) {
        console.error(
            'Usage: npx ts-node scripts/enqueue.ts <action> --username <handle> [--text "..."] [--url https://...] [--count N] [--comments "A" "B" ...]'
        );
        process.exit(1);
    }
    const args: Args = { action };
    for (let i = 0; i < rest.length; i++) {
        const k = rest[i];
        const v = rest[i + 1];
        switch (k) {
            case '--username':
                args.username = v;
                i++;
                break;
            case '--text':
                args.text = v;
                i++;
                break;
            case '--url':
                args.url = v;
                i++;
                break;
            case '--community':
                args.community = v;
                i++;
                break;
            case '--count':
                args.count = Number(v);
                i++;
                break;
            case '--comments': {
                const rem = rest.slice(i + 1).filter((a) => !a.startsWith('--'));
                args.comments = rem;
                i += rem.length;
                break;
            }
            default:
                console.error(`Unknown flag: ${k}`);
                process.exit(1);
        }
    }
    if (!args.username) {
        console.error('Missing required --username <handle> (X @handle to switch to before the action).');
        process.exit(1);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const connection = new IORedis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: null,
    });

    const queue = new Queue(config.queueName, { connection });

    const jobData = {
        accountId: `cli-${Date.now()}`,
        action: args.action,
        config: {
            username: args.username!,
            text: args.text,
            url: args.url,
            count: args.count,
            comments: args.comments,
            community: args.community,
        },
    };

    const job = await queue.add(args.action, jobData, { removeOnComplete: true, removeOnFail: 100 });
    console.log(
        `✓ Enqueued job ${job.id} on queue "${config.queueName}":`,
        JSON.stringify(jobData, null, 2)
    );

    await queue.close();
    await connection.quit();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
