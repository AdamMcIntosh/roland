/**
 * Loop PM session persistence — shared by lightweight Plan/Act and [DEPRECATED] legacy PM bridge.
 * `executionPath: 'pm_team'` indicates the deprecated LeadPM / team-orchestrator path.
 */
import fs from 'fs';
import path from 'path';
export const LOOP_PM_SESSION_FILE = 'loop-pm-session.json';
export function readLoopPmSession(stateDir) {
    const filePath = path.join(stateDir, LOOP_PM_SESSION_FILE);
    try {
        if (!fs.existsSync(filePath))
            return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function writeLoopPmSession(stateDir, session) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, LOOP_PM_SESSION_FILE), JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2), 'utf-8');
}
//# sourceMappingURL=loop-pm-session.js.map