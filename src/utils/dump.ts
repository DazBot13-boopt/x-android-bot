/**
 * Helper CLI: dumps the current UI hierarchy of the phone to a local XML file.
 * Use it to find the correct selectors for the X app screens.
 *
 * Usage:
 *   npm run dump-ui -- home
 *   npm run dump-ui -- compose-tweet
 *
 * The label is just a filename hint — the current state of the phone is captured as-is.
 */
import fs from 'fs';
import path from 'path';
import { dumpUiHierarchy, listDevices } from './adb';
import { logger } from './logger';

async function main() {
    const label = process.argv[2] || `dump-${Date.now()}`;
    const devices = listDevices();
    if (devices.length === 0) {
        logger.error('No device detected. Run `adb devices` and ensure USB debugging is authorized.');
        process.exit(1);
    }
    logger.info(`Using device: ${devices[0].serial} (${devices[0].state})`);

    const xml = dumpUiHierarchy();
    const outDir = path.resolve(__dirname, '../../dumps');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${label}.xml`);
    fs.writeFileSync(outPath, xml, 'utf-8');
    logger.info(`UI hierarchy written to ${outPath} (${xml.length} bytes)`);
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});
