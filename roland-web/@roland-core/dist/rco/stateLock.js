/**
 * Simple fs-based lock for parallel-swarm shared state access
 */
import fs from 'fs';
import path from 'path';
function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
const LOCK_SUFFIX = '.rco-state.lock';
const RETRY_MS = 50;
const MAX_WAIT_MS = 5000;
export function acquireLock(stateFilePath) {
    const lockPath = stateFilePath.replace(/\.json$/i, '') + LOCK_SUFFIX;
    const start = Date.now();
    while (true) {
        try {
            ensureDir(lockPath);
            fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
            return () => {
                try {
                    fs.unlinkSync(lockPath);
                }
                catch {
                    // ignore
                }
            };
        }
        catch (err) {
            if (err.code !== 'EEXIST')
                throw err;
            if (Date.now() - start > MAX_WAIT_MS)
                throw new Error('RCO state lock timeout');
            const delay = RETRY_MS + Math.floor(Math.random() * 50);
            const deadline = Date.now() + delay;
            while (Date.now() < deadline) {
                // busy wait
            }
        }
    }
}
export function readStateUnlocked(stateFilePath) {
    try {
        const raw = fs.readFileSync(stateFilePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function writeStateUnlocked(stateFilePath, state) {
    ensureDir(stateFilePath);
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
}
//# sourceMappingURL=stateLock.js.map