/**
 * render.ts — pure Markdown views over the PM data (Phase 4).
 *
 * No I/O, no state: every function takes a structure from lead-pm and returns a
 * Markdown string that renders cleanly in the Cursor chat panel. The point is
 * that the PM never has to read raw JSON — `pm_standup` shows the board, the
 * blockers (with the exact unblock call), and what to do next, at a glance.
 */
// -- small formatters --------------------------------------------------------
function humanAge(sinceMs) {
    if (!sinceMs)
        return '';
    const mins = Math.max(0, Math.round((Date.now() - sinceMs) / 60000));
    if (mins < 1)
        return 'just now';
    if (mins < 60)
        return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)
        return `${hrs}h`;
    return `${Math.round(hrs / 24)}d`;
}
function tokens(n) {
    if (n < 1000)
        return `${n}`;
    return `${(n / 1000).toFixed(1)}k`;
}
// -- views -------------------------------------------------------------------
/** The morning-standup view: directive, triage (blockers→reviews→ready), board, usage, next 3. */
export function renderStandup(ctx) {
    const s = ctx.summary;
    const active = s.open + s.in_progress + s.blocked + s.in_review;
    const lines = [];
    lines.push(`## ☀ Standup`);
    lines.push(`**${ctx.directive}**`);
    lines.push('');
    // Idle / done state.
    if (active === 0) {
        lines.push(s.done > 0
            ? `✅ Team idle — ${s.done} task(s) done. Run \`synthesize_deliverable\`, or start the next goal with \`spawn_task\` / \`start_team_recipe\`.`
            : `Nothing on the board yet. Decompose a goal with \`spawn_task\`, or kick off a workflow with \`start_team_recipe\`.`);
        return lines.join('\n');
    }
    const byKind = (k) => ctx.needsAttention.filter((a) => a.kind === k);
    // 🔴 Unblock first — always leads.
    const blockerItems = byKind('blocker');
    if (blockerItems.length > 0) {
        lines.push(`### 🔴 Unblock first (${blockerItems.length})`);
        for (const a of blockerItems) {
            const b = ctx.blockers.find((x) => x.key === a.blockerKey);
            const age = b ? humanAge(b.createdAt) : '';
            lines.push(`- ${a.reason}${age ? ` _(open ${age})_` : ''}`);
            lines.push(`  - \`${a.action}\``);
        }
        lines.push('');
    }
    // 🟡 Review queue.
    const reviews = byKind('review');
    if (reviews.length > 0) {
        lines.push(`### 🟡 Review queue (${reviews.length})`);
        for (const a of reviews)
            lines.push(`- ${a.reason}\n  - \`${a.action}\``);
        lines.push('');
    }
    // 🟠 Stalled.
    const stalled = byKind('stalled');
    if (stalled.length > 0) {
        lines.push(`### 🟠 Stalled (${stalled.length})`);
        for (const a of stalled)
            lines.push(`- ${a.reason}`);
        lines.push('');
    }
    // 🟢 Ready to start.
    const ready = byKind('ready');
    if (ready.length > 0) {
        lines.push(`### 🟢 Ready to start (${ready.length})`);
        for (const a of ready)
            lines.push(`- ${a.reason}\n  - \`${a.action}\``);
        lines.push('');
    }
    lines.push(`**Board:** open ${s.open} · in_progress ${s.in_progress} · blocked ${s.blocked} · in_review ${s.in_review} · done ${s.done}`);
    const u = ctx.usage;
    lines.push(`**Usage:** ${tokens(u.totalInputTokens + u.totalOutputTokens)} tokens across ${Object.keys(u.byEngineer).length} engineer(s) · ${u.totalRequests} request(s) _(Cursor subscription)_`);
    if (ctx.nextActions.length > 0) {
        lines.push('');
        lines.push(`### ▶ Next actions`);
        ctx.nextActions.slice(0, 3).forEach((a, i) => lines.push(`${i + 1}. \`${a}\``));
    }
    return lines.join('\n');
}
/** A kanban-style board grouped by lifecycle status. */
export function renderBoard(tasks) {
    const cols = [
        ['Open', 'open'],
        ['In progress', 'in_progress'],
        ['Blocked', 'blocked'],
        ['In review', 'in_review'],
        ['Done', 'done'],
    ];
    const lines = ['## 📋 Board'];
    for (const [label, status] of cols) {
        const inCol = tasks.filter((t) => t.status === status);
        lines.push(`\n### ${label} (${inCol.length})`);
        if (inCol.length === 0)
            lines.push('- _(none)_');
        for (const t of inCol) {
            const who = t.value.assignee ? ` — ${t.value.assignee}` : '';
            lines.push(`- **${t.key}** ${t.value.title}${who}`);
        }
    }
    return lines.join('\n');
}
/** Token usage attribution: by engineer, by task. */
export function renderUsage(usage) {
    const lines = ['## 📊 Cursor usage', `_${usage.note}_`, ''];
    lines.push(`**Total:** ${tokens(usage.totalInputTokens)} in · ${tokens(usage.totalOutputTokens)} out · ${usage.totalRequests} request(s)`);
    const byEng = Object.entries(usage.byEngineer);
    if (byEng.length > 0) {
        lines.push('\n### By engineer');
        for (const [name, r] of byEng.sort((a, b) => b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens))) {
            lines.push(`- **${name}** (${r.model ?? '—'}): ${tokens(r.inputTokens)} in · ${tokens(r.outputTokens)} out · ${r.requests} req`);
        }
    }
    const byTask = Object.entries(usage.byTask);
    if (byTask.length > 0) {
        lines.push('\n### By task');
        for (const [key, r] of byTask.sort((a, b) => b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens))) {
            lines.push(`- **${key}**: ${tokens(r.inputTokens + r.outputTokens)} tokens · ${r.requests} req`);
        }
    }
    return lines.join('\n');
}
/** Copy-paste launch instructions for an engineer dispatch. */
export function renderCursorLaunch(input) {
    const files = input.contextFiles.length ? input.contextFiles.join(', ') : '(none — engineer should gather its own)';
    return [
        `▶ Launch in Cursor (${input.engineer} for ${input.taskKey}):`,
        `  1. Open a new AI chat / Composer pane.`,
        `  2. Select model: ${input.model}`,
        `  3. Paste the brief below as the engineer's instructions.`,
        `  4. Attach context: ${files}`,
        `  5. The engineer reports back by calling complete_task (include model + input_tokens/output_tokens for usage).`,
        ``,
        `--- BRIEF ---`,
        input.brief,
    ].join('\n');
}
/** Full dispatch view (brief + launch). */
export function renderDispatch(packet) {
    return [
        `## 🚀 Dispatch — ${packet.taskKey}`,
        `**Engineer:** ${packet.persona.name} · **Model:** ${packet.recommendedModel} · ${packet.routing.rationale}`,
        '',
        '```',
        packet.cursorLaunch,
        '```',
    ].join('\n');
}
/** A reverse-chronological event timeline. */
export function renderTimeline(events) {
    if (events.length === 0)
        return '## 🕓 Timeline\n- _(no events yet)_';
    const lines = ['## 🕓 Timeline'];
    for (const e of events) {
        const when = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19);
        const who = e.actor ? ` [${e.actor}]` : '';
        const what = e.taskKey ? ` ${e.taskKey}` : '';
        const detail = e.detail ? ` — ${e.detail}` : '';
        lines.push(`- \`${when}\` **${e.action}**${what}${who}${detail}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=render.js.map