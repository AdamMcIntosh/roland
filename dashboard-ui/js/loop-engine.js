/**
 * Loop Engine dashboard UI — timeline chips, phase metrics, health badge,
 * critique visualization, and HITL recovery actions for the Roland command center.
 * Consumes /api/loop-health and run-state loop fields; used by Overview and Command Board.
 */
(function (global) {
  'use strict';

  let loopHealth = null;
  let escHtmlFn = defaultEscHtml;

  function defaultEscHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function esc(s) {
    return escHtmlFn(s);
  }

  /** Wire shared dashboard utilities (call once after page utilities load). */
  function init(deps) {
    if (deps && typeof deps.escHtml === 'function') escHtmlFn = deps.escHtml;
  }

  function getHealth() {
    return loopHealth;
  }

  function setHealth(value) {
    loopHealth = value;
  }

  async function fetchHealth() {
    try {
      const res = await fetch('/api/loop-health');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loopHealth = await res.json();
    } catch {
      loopHealth = null;
    }
  }

  function togglePhaseDetail(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  }

  function renderSummary(rs, lh) {
    const health = lh !== undefined ? lh : loopHealth;
    const templateId = rs?.loopTemplateId || health?.loop?.templateId;
    if (!templateId && !health?.loop?.active) return '';

    const phase = rs?.loopPhase || health?.loop?.currentPhase || '—';
    const iter = (rs?.loopIteration ?? health?.loop?.iteration) != null
      ? ' · iter ' + (rs?.loopIteration ?? health?.loop?.iteration) : '';
    const lv = rs?.lastVerification;
    const pass = lv ? lv.pass : (health?.loop?.lastVerificationPass ?? null);
    const panelClass = pass === false || health?.status === 'escalated'
      ? 'loop-intel-panel fail' : 'loop-intel-panel';
    const statusLabel = pass === true ? '✓ Pass' : pass === false ? '✕ Fail' : '—';
    const healthBadge = health?.status
      ? '<span class="loop-health-badge ' + esc(health.status) + '">' + esc(health.status) + '</span>'
      : '';

    let strategyHtml = '';
    if (lv && Array.isArray(lv.strategies) && lv.strategies.length) {
      strategyHtml = lv.strategies.map(s => {
        const cls = s.pass ? 'loop-strategy-pass' : 'loop-strategy-fail';
        const icon = s.pass ? '✓' : '✕';
        return '<div class="loop-strategy-row"><span class="' + cls + '">' + icon + ' ' +
          esc(s.type) + '</span><span>' + esc(String(s.durationMs || 0)) + 'ms</span></div>';
      }).join('');
    }

    const summary = lv && lv.summary
      ? '<div style="margin-top:.3rem;color:var(--muted)">' + esc(lv.summary.slice(0, 120)) + '</div>'
      : '';

    const lc = rs?.lastCritique;
    let critiqueHtml = '';
    if (lc && lc.retryDecision) {
      const decCls = lc.retryDecision === 'escalate' ? 'escalate'
        : (lc.retryDecision === 'retry' || lc.retryDecision === 'retry_focused') ? 'retry' : 'proceed';
      const decLabel = lc.retryDecision === 'retry_focused' ? 'RETRY (focused)' : lc.retryDecision.toUpperCase();
      const modelLabel = lc.model === 'composer' ? 'Composer' : 'Grok';
      const retryNote = (rs?.loopRetryCount ?? health?.loop?.retryCount) != null
        ? ' · retry ' + (rs?.loopRetryCount ?? health?.loop?.retryCount) : '';
      const issueNote = lc.issueCount != null ? ' · ' + lc.issueCount + ' issue(s)' : '';
      critiqueHtml = '<div class="loop-critique-panel">' +
        '<span class="loop-critique-decision ' + decCls + '">' + esc(decLabel) + '</span>' +
        ' · ' + esc(modelLabel) + esc(retryNote) + esc(issueNote) +
        (lc.summary ? '<div style="margin-top:.2rem;color:var(--muted)">' + esc(lc.summary.slice(0, 140)) + '</div>' : '') +
        '</div>';
    }

    const m = health?.metrics;
    let metricsHtml = '';
    if (m) {
      metricsHtml = '<div class="loop-metrics-row">' +
        '<span>Success <strong>' + esc(String(m.successRate)) + '%</strong></span>' +
        '<span>Avg phase <strong>' + esc(String(m.avgPhaseDurationMs)) + 'ms</strong></span>' +
        '<span>Retries <strong>' + esc(String(m.retryCount)) + '</strong></span>' +
        '<span>ETA <strong>' + esc(String(m.estimatedCompletionPct)) + '%</strong></span>' +
        '</div>';
    }

    let timelineHtml = '';
    if (m && Array.isArray(m.phaseDurations) && m.phaseDurations.length) {
      const chips = m.phaseDurations.map((p, i) => {
        const chipId = 'loop-phase-detail-' + i;
        const cls = p.failureCount > 0 ? 'fail' : (p.phase === phase ? 'active' : 'ok');
        const detail = esc(p.phase) + ': ' + p.count + '× avg ' + p.avgMs + 'ms' +
          (p.failureCount ? ' (' + p.failureCount + ' fail)' : '');
        return '<span class="loop-phase-chip ' + cls + '" onclick="toggleLoopPhaseDetail(\'' + chipId + '\')">' +
          esc(p.phase) + '</span>' +
          '<div id="' + chipId + '" class="loop-phase-detail">' + detail + '</div>';
      }).join('');
      timelineHtml = '<div class="loop-timeline">' + chips + '</div>';
    }

    let errorActions = '';
    if (health?.actions && (health.actions.canResume || health.actions.canReplan || health.status === 'escalated')) {
      errorActions = '<div class="loop-error-actions">';
      if (health.actions.canResume) {
        errorActions += '<button class="btn-hitl btn-resume" onclick="doHitl(\'resume\')">▶ Resume Loop</button>';
      }
      if (health.actions.canReplan || health.status === 'escalated') {
        errorActions += '<button class="btn-hitl btn-replan" onclick="doHitl(\'replan\')">🔄 Replan Loop</button>';
      }
      errorActions += '</div>';
    }

    const diagHtml = health?.diagnostics?.length
      ? '<div style="margin-top:.3rem;color:#fca5a5;font-size:.68rem">' +
        esc(health.diagnostics.slice(0, 2).join(' · ')) + '</div>'
      : '';

    return '<div class="' + panelClass + '"><h4>Loop Engineering' + healthBadge + '</h4>' +
      '<div><strong>' + esc(templateId) + '</strong> · phase <strong>' + esc(phase) + '</strong>' + esc(iter) +
      ' · ' + statusLabel + (lv && lv.durationMs ? ' · ' + esc(String(lv.durationMs)) + 'ms' : '') + '</div>' +
      metricsHtml + timelineHtml + strategyHtml + summary + critiqueHtml + diagHtml + errorActions + '</div>';
  }

  global.LoopEngine = {
    init,
    getHealth,
    setHealth,
    fetchHealth,
    renderSummary,
    togglePhaseDetail,
  };

  global.toggleLoopPhaseDetail = togglePhaseDetail;
})(typeof window !== 'undefined' ? window : globalThis);
