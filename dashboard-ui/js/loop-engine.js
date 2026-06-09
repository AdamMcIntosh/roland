/**
 * Loop Engine dashboard UI — Closed-Loop Harness visualization.
 *
 * Renders PACVRE phase timeline, EvaluationGate confidence, specialist spawns,
 * PR draft on completion, health badge, and HITL controls for Live Status +
 * Command Board. Consumes run-state loop fields and /api/loop-health (WebSocket).
 */
(function (global) {
  'use strict';

  /** Canonical PACVRE phase order with icons and short labels. */
  var PHASES = [
    { id: 'plan',     icon: '📋', label: 'Plan',     hint: 'Scope and task decomposition' },
    { id: 'act',      icon: '⚡', label: 'Act',      hint: 'Implementation wave execution' },
    { id: 'verify',   icon: '✓',  label: 'Verify',   hint: 'EvaluationGate automated checks' },
    { id: 'critique', icon: '🔍', label: 'Critique', hint: 'Quality review and retry decision' },
    { id: 'retry',    icon: '↻',  label: 'Retry',    hint: 'Focused or full retry backoff' },
    { id: 'escalate', icon: '🚨', label: 'Escalate', hint: 'Human operator handoff' },
    { id: 'observe',  icon: '👁', label: 'Observe',  hint: 'Retrospective and memory extract' },
  ];

  var loopHealth = null;
  var escHtmlFn = defaultEscHtml;
  var getPmModelId = function () { return 'gpt-5.4-nano'; };
  var getEngModelId = function () { return 'composer-2.5'; };
  var onHitl = null;
  var confirmFn = function (msg) { return global.confirm ? global.confirm(msg) : true; };
  var isMobileFn = function () { return global.innerWidth != null && global.innerWidth < 768; };

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
    if (!deps) return;
    if (typeof deps.escHtml === 'function') escHtmlFn = deps.escHtml;
    if (typeof deps.getPmModelId === 'function') getPmModelId = deps.getPmModelId;
    if (typeof deps.getEngModelId === 'function') getEngModelId = deps.getEngModelId;
    if (typeof deps.onHitl === 'function') onHitl = deps.onHitl;
    if (typeof deps.confirmFn === 'function') confirmFn = deps.confirmFn;
    if (typeof deps.isMobile === 'function') isMobileFn = deps.isMobile;
  }

  function getHealth() {
    return loopHealth;
  }

  function setHealth(value) {
    loopHealth = value;
  }

  async function fetchHealth() {
    try {
      var res = await fetch('/api/loop-health');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loopHealth = await res.json();
    } catch {
      loopHealth = null;
    }
  }

  function phaseIndex(phaseId) {
    for (var i = 0; i < PHASES.length; i++) {
      if (PHASES[i].id === phaseId) return i;
    }
    return -1;
  }

  function normalizePhaseId(raw) {
    return String(raw ?? '').toLowerCase().trim();
  }

  /** Merge run-state and loop-health into a single view model. */
  function buildViewModel(rs, lh) {
    var health = lh !== undefined ? lh : loopHealth;
    var templateId = rs?.loopTemplateId || health?.loop?.templateId;
    if (!templateId && !health?.loop?.active) return null;

    var currentPhase = normalizePhaseId(rs?.loopPhase || health?.loop?.currentPhase);
    var iteration = rs?.loopIteration ?? health?.loop?.iteration ?? 1;
    var retryCount = rs?.loopRetryCount ?? health?.loop?.retryCount ?? 0;
    var loopStatus = rs?.loopStatus || health?.loop?.runStatus || 'running';
    var lv = rs?.lastVerification;
    var confidence = lv?.confidence ?? health?.loop?.confidence ?? null;
    var verificationAccepted = lv?.accepted ?? health?.loop?.verificationAccepted ?? null;
    var healthStatus = health?.status || 'unknown';
    var metrics = health?.metrics || null;
    var phaseHistory = health?.phaseHistory || rs?.loopPhaseHistory || [];
    var specialistSpawns = health?.specialistSpawns || [];
    var closedLoopPr = health?.closedLoopPr || null;
    var isPaused = Boolean(rs?.hitlPaused);
    var isAbortPending = Boolean(rs?.hitlAbortPending);

    return {
      templateId: templateId,
      currentPhase: currentPhase,
      iteration: iteration,
      retryCount: retryCount,
      loopStatus: loopStatus,
      healthStatus: healthStatus,
      metrics: metrics,
      phaseHistory: phaseHistory,
      specialistSpawns: specialistSpawns,
      closedLoopPr: closedLoopPr,
      lastVerification: lv,
      lastCritique: rs?.lastCritique,
      lastRetry: rs?.lastRetry,
      confidence: confidence,
      verificationAccepted: verificationAccepted,
      diagnostics: health?.diagnostics || [],
      actions: health?.actions || {},
      checkpoint: health?.checkpoint,
      isPaused: isPaused,
      isAbortPending: isAbortPending,
      isActive: loopStatus === 'running',
    };
  }

  /** Derive per-phase status for timeline chips. */
  function resolvePhaseStatus(phaseId, vm) {
    var idx = phaseIndex(phaseId);
    var curIdx = phaseIndex(vm.currentPhase);
    var history = vm.phaseHistory.filter(function (h) {
      return normalizePhaseId(h.phase) === phaseId;
    });
    var last = history.length ? history[history.length - 1] : null;

    if (last && last.completedAt != null) {
      if (last.success === false) return 'failed';
      return 'success';
    }
    if (phaseId === vm.currentPhase && vm.isActive) return 'running';
    if (vm.loopStatus === 'completed' || vm.loopStatus === 'failed' || vm.loopStatus === 'escalated') {
      if (last) return last.success === false ? 'failed' : 'success';
      return 'skipped';
    }
    if (curIdx >= 0 && idx >= 0 && idx < curIdx) return 'success';
    return 'pending';
  }

  function computeProgressPct(vm) {
    if (vm.metrics && typeof vm.metrics.estimatedCompletionPct === 'number') {
      return Math.min(100, Math.max(0, vm.metrics.estimatedCompletionPct));
    }
    var curIdx = phaseIndex(vm.currentPhase);
    if (curIdx < 0) return 0;
    var base = (curIdx / PHASES.length) * 100;
    if (vm.isActive) base += (100 / PHASES.length) * 0.45;
    return Math.min(Math.round(base), 99);
  }

  function formatConfidence(confidence) {
    if (confidence == null || Number.isNaN(Number(confidence))) return '—';
    var pct = Math.round(Number(confidence) * 100);
    return pct + '%';
  }

  function healthBadgeClass(status) {
    if (status === 'healthy' || status === 'idle') return 'healthy';
    if (status === 'degraded') return 'degraded';
    if (status === 'escalated') return 'escalated';
    return 'unknown';
  }

  function healthBadgeLabel(status) {
    var labels = {
      healthy: 'Healthy',
      degraded: 'Degraded',
      escalated: 'Escalated',
      idle: 'Idle',
      unknown: 'Unknown',
    };
    return labels[status] || status;
  }

  function etaLabel(vm) {
    if (vm.loopStatus === 'completed') return 'Complete';
    if (vm.loopStatus === 'escalated') return 'Escalated — operator review';
    if (vm.loopStatus === 'failed') return 'Failed';
    if (vm.isPaused) return 'Paused';
    if (vm.metrics && vm.metrics.estimatedCompletionPct != null) {
      var remain = Math.max(0, 100 - vm.metrics.estimatedCompletionPct);
      if (remain <= 5) return 'Finishing up…';
      return '~' + Math.round(remain) + '% remaining';
    }
    return 'Iteration ' + vm.iteration;
  }

  function phaseDetailContent(phaseId, vm) {
    var history = vm.phaseHistory.filter(function (h) {
      return normalizePhaseId(h.phase) === phaseId;
    });
    var last = history.length ? history[history.length - 1] : null;
    var lines = [];

    if (last) {
      if (last.summary) lines.push(last.summary);
      if (last.completedAt && last.startedAt) {
        lines.push('Duration: ' + (last.completedAt - last.startedAt) + 'ms');
      }
      if (last.success === false) lines.push('Outcome: failed');
      else if (last.success === true) lines.push('Outcome: success');
    }

    if (phaseId === 'verify' && vm.lastVerification) {
      var lv = vm.lastVerification;
      lines.push('Gate: ' + (lv.pass ? 'PASS' : 'FAIL'));
      if (lv.confidence != null) lines.push('Confidence: ' + formatConfidence(lv.confidence));
      if (lv.summary) lines.push(lv.summary);
      if (Array.isArray(lv.strategies)) {
        lv.strategies.forEach(function (s) {
          lines.push((s.pass ? '✓' : '✕') + ' ' + s.type + ' (' + (s.durationMs || 0) + 'ms)');
        });
      }
    }

    if (phaseId === 'critique' && vm.lastCritique) {
      var lc = vm.lastCritique;
      lines.push('Decision: ' + String(lc.retryDecision || '').toUpperCase());
      if (lc.summary) lines.push(lc.summary);
      if (Array.isArray(lc.issues) && lc.issues.length) {
        lines.push('Issues: ' + lc.issues.slice(0, 3).join('; '));
      }
    }

    if (phaseId === 'retry' && vm.lastRetry) {
      var lr = vm.lastRetry;
      lines.push('Attempt ' + lr.attempt + ' · ' + lr.strategy + ' retry');
      if (lr.focusAreas && lr.focusAreas.length) {
        lines.push('Focus: ' + lr.focusAreas.join(', '));
      }
      if (lr.backoffMs) lines.push('Backoff: ' + lr.backoffMs + 'ms');
    }

    var spawns = vm.specialistSpawns.filter(function (s) {
      return normalizePhaseId(s.phase) === phaseId;
    });
    if (spawns.length) {
      lines.push('Specialists: ' + spawns.map(function (s) { return s.primaryAgent; }).join(', '));
    }

    if (!lines.length) {
      var meta = PHASES.find(function (p) { return p.id === phaseId; });
      return meta ? meta.hint : 'No details yet';
    }
    return lines.join('\n');
  }

  function renderTimeline(vm, opts) {
    opts = opts || {};
    var compact = opts.compact === true;
    var chips = [];
    var details = [];

    PHASES.forEach(function (meta, i) {
      var status = resolvePhaseStatus(meta.id, vm);
      var chipId = 'loop-phase-detail-' + meta.id + '-' + i;
      var cls = 'loop-phase-chip loop-phase-card status-' + status;
      if (meta.id === vm.currentPhase && vm.isActive) cls += ' active running';
      var statusIcon = status === 'running' ? '●' : status === 'success' ? '✓' : status === 'failed' ? '✕' : status === 'skipped' ? '—' : '○';
      var detail = esc(phaseDetailContent(meta.id, vm)).replace(/\n/g, '<br>');

      chips.push(
        '<button type="button" class="' + cls + '" data-phase="' + esc(meta.id) + '" ' +
          'onclick="toggleLoopPhaseDetail(\'' + chipId + '\')" ' +
          'title="' + esc(meta.label + ' — ' + meta.hint) + '" aria-label="' + esc(meta.label) + '">' +
          '<span class="loop-phase-icon">' + meta.icon + '</span>' +
          '<span class="loop-phase-label">' + esc(meta.label) + '</span>' +
          '<span class="loop-phase-status-icon" aria-hidden="true">' + statusIcon + '</span>' +
        '</button>'
      );

      details.push(
        '<div id="' + chipId + '" class="loop-phase-detail" role="region" aria-label="' + esc(meta.label) + ' details">' + detail + '</div>'
      );
    });

    return (
      '<div class="loop-phase-timeline">' +
        '<h5>PACVRE Timeline · Iteration ' + esc(String(vm.iteration)) +
          (vm.retryCount ? ' · Retry ' + esc(String(vm.retryCount)) : '') +
          (vm.confidence != null ? ' · Confidence ' + esc(formatConfidence(vm.confidence)) : '') +
        '</h5>' +
        '<div class="loop-timeline loop-timeline-scroll">' + chips.join('') + '</div>' +
        '<div class="loop-phase-details-stack">' + details.join('') + '</div>' +
      '</div>'
    );
  }

  function renderControls(vm) {
    if (!vm.isActive && vm.loopStatus !== 'escalated') return '';

    if (vm.isAbortPending) {
      return '<div class="loop-controls-bar">' +
        '<div class="loop-control-banner abort">Abort queued — stopping after current wave</div></div>';
    }

    var html = '<div class="loop-controls-bar" role="toolbar" aria-label="Loop controls">';
    html += '<span class="loop-controls-label">Loop</span>';

    if (vm.isPaused) {
      html += '<button type="button" class="btn-hitl btn-resume loop-ctrl-btn" data-loop-cmd="resume" title="Resume closed loop">▶ Resume</button>';
    } else if (vm.isActive) {
      html += '<button type="button" class="btn-hitl btn-pause loop-ctrl-btn" data-loop-cmd="pause" title="Pause before next phase">⏸ Pause</button>';
    }

    if (vm.isActive) {
      html += '<button type="button" class="btn-hitl btn-escalate loop-ctrl-btn" data-loop-cmd="escalate" title="Request immediate escalation">🚨 Escalate Now</button>';
    }

    html += '<button type="button" class="btn-hitl btn-replan loop-ctrl-btn" data-loop-cmd="replan" title="Ask PM to replan remaining work">🔄 Replan</button>';

    if (vm.isActive) {
      html += '<button type="button" class="btn-hitl btn-abort loop-ctrl-btn" data-loop-cmd="abort" title="Stop after current wave">🛑 Abort</button>';
    }

    html += '</div>';

    if (vm.isPaused) {
      html += '<div class="loop-control-banner paused">⏸ Loop paused — Resume to continue PACVRE cycle</div>';
    }

    return html;
  }

  function renderSpecialists(vm) {
    if (!vm.specialistSpawns.length) return '';
    var rows = vm.specialistSpawns.slice(-8).reverse().map(function (s) {
      var support = s.supportingAgents && s.supportingAgents.length
        ? ' +' + s.supportingAgents.join(', ') : '';
      return '<div class="loop-specialist-row">' +
        '<span class="loop-specialist-agent">' + esc(s.primaryAgent) + esc(support) + '</span>' +
        '<span class="loop-specialist-meta">' + esc(s.phase) + ' · iter ' + esc(String(s.iteration)) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="loop-specialists-panel">' +
      '<h5>Spawned Specialists</h5>' + rows + '</div>';
  }

  function renderPrDraft(vm) {
    var pr = vm.closedLoopPr;
    if (!pr || !pr.title) return '';
    var statusCls = pr.status === 'completed' ? 'success' : pr.status === 'escalated' ? 'escalated' : '';
    var bodyPreview = pr.body ? esc(pr.body.slice(0, 280)).replace(/\n/g, '<br>') : '';
    return '<div class="loop-pr-draft ' + statusCls + '">' +
      '<h5>PR Draft</h5>' +
      '<div class="loop-pr-title">' + esc(pr.title) + '</div>' +
      (bodyPreview ? '<div class="loop-pr-body">' + bodyPreview + (pr.body.length > 280 ? '…' : '') + '</div>' : '') +
      '<div class="loop-pr-meta">' + esc(pr.status) + ' · iteration ' + esc(String(pr.iteration)) + '</div>' +
      '</div>';
  }

  function renderCritiquePanel(vm) {
    var lc = vm.lastCritique;
    if (!lc || !lc.retryDecision) return '';
    var decCls = lc.retryDecision === 'escalate' ? 'escalate'
      : (lc.retryDecision === 'retry' || lc.retryDecision === 'retry_focused') ? 'retry' : 'proceed';
    var decLabel = lc.retryDecision === 'retry_focused' ? 'RETRY (focused)' : lc.retryDecision.toUpperCase();
    var modelLabel = lc.model === 'composer' ? getEngModelId() : getPmModelId();
    var issueNote = lc.issueCount != null ? ' · ' + lc.issueCount + ' issue(s)' : '';
    return '<div class="loop-critique-panel">' +
      '<span class="loop-critique-decision ' + decCls + '">' + esc(decLabel) + '</span>' +
      ' · ' + esc(modelLabel) + issueNote +
      (lc.summary ? '<div class="loop-critique-summary">' + esc(lc.summary.slice(0, 200)) + '</div>' : '') +
      '</div>';
  }

  function renderMetricsRow(vm) {
    var m = vm.metrics;
    if (!m) return '';
    return '<div class="loop-metrics-row">' +
      '<span title="Phase success rate">Success <strong>' + esc(String(m.successRate)) + '%</strong></span>' +
      '<span title="Average phase duration">Avg phase <strong>' + esc(String(m.avgPhaseDurationMs)) + 'ms</strong></span>' +
      '<span title="Retry count this run">Retries <strong>' + esc(String(m.retryCount)) + '</strong></span>' +
      '<span title="Estimated loop completion">Progress <strong>' + esc(String(computeProgressPct(vm))) + '%</strong></span>' +
      '</div>';
  }

  function renderHarnessCore(vm, opts) {
    opts = opts || {};
    var compact = opts.compact === true;
    var pass = vm.lastVerification ? vm.lastVerification.pass : vm.verificationAccepted;
    var panelClass = 'loop-harness-panel loop-intel-panel';
    if (pass === false || vm.healthStatus === 'escalated' || vm.loopStatus === 'failed') {
      panelClass += ' fail';
    } else if (vm.healthStatus === 'degraded') {
      panelClass += ' degraded';
    }
    if (vm.isActive) panelClass += ' live';

    var badgeCls = healthBadgeClass(vm.healthStatus);
    var progressPct = computeProgressPct(vm);
    var currentMeta = PHASES.find(function (p) { return p.id === vm.currentPhase; });
    var phaseLabel = currentMeta ? currentMeta.icon + ' ' + currentMeta.label : vm.currentPhase || '—';

    var checkpointNote = '';
    if (vm.checkpoint && vm.checkpoint.present && vm.checkpoint.phase) {
      checkpointNote = '<span class="loop-checkpoint-note" title="Last checkpoint saved">💾 ' + esc(vm.checkpoint.phase) + '</span>';
    }

    var diagHtml = vm.diagnostics.length
      ? '<div class="loop-diagnostics">' + esc(vm.diagnostics.slice(0, 2).join(' · ')) + '</div>'
      : '';

    var header = '<div class="loop-harness-header">' +
      '<h4>Closed-Loop Harness' +
        '<span class="loop-health-badge ' + esc(badgeCls) + '" title="Overall loop health">' +
          esc(healthBadgeLabel(vm.healthStatus)) +
        '</span>' +
      '</h4>' +
      (vm.isActive ? '<span class="loop-live-dot" title="Loop running">LIVE</span>' : '') +
      '</div>';

    var metaRow = '<div class="loop-harness-meta">' +
      '<strong>' + esc(vm.templateId) + '</strong>' +
      ' · <span title="Current PACVRE phase">' + esc(phaseLabel) + '</span>' +
      ' · Iter <strong>' + esc(String(vm.iteration)) + '</strong>' +
      (vm.retryCount ? ' · Retry <strong>' + esc(String(vm.retryCount)) + '</strong>' : '') +
      (vm.confidence != null ? ' · Gate <strong>' + esc(formatConfidence(vm.confidence)) + '</strong>' : '') +
      checkpointNote +
      '</div>';

    var progressBlock = compact ? '' : (
      '<div class="loop-progress-section">' +
        '<div class="loop-progress-label-row">' +
          '<span>' + esc(phaseLabel) + '</span>' +
          '<span>' + esc(String(progressPct)) + '% · ' + esc(etaLabel(vm)) + '</span>' +
        '</div>' +
        '<div class="loop-progress-bar" role="progressbar" aria-valuenow="' + progressPct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="loop-progress-fill" style="width:' + progressPct + '%"></div>' +
        '</div>' +
      '</div>'
    );

    var errorActions = '';
    if (vm.actions && (vm.actions.canResume || vm.actions.canReplan || vm.healthStatus === 'escalated')) {
      errorActions = '<div class="loop-error-actions">';
      if (vm.actions.canResume) {
        errorActions += '<button type="button" class="btn-hitl btn-resume loop-ctrl-btn" data-loop-cmd="resume">▶ Resume Loop</button>';
      }
      if (vm.actions.canReplan || vm.healthStatus === 'escalated') {
        errorActions += '<button type="button" class="btn-hitl btn-replan loop-ctrl-btn" data-loop-cmd="replan">🔄 Replan Loop</button>';
      }
      errorActions += '</div>';
    }

    return panelClass + '|' + (
      '<div class="' + panelClass + '" data-loop-harness="1">' +
        header + metaRow + progressBlock +
        renderMetricsRow(vm) +
        renderTimeline(vm, opts) +
        renderCritiquePanel(vm) +
        renderSpecialists(vm) +
        renderPrDraft(vm) +
        diagHtml + errorActions +
      '</div>'
    );
  }

  /** Compact summary for Command Board and inline embeds. */
  function renderSummary(rs, lh) {
    var vm = buildViewModel(rs, lh);
    if (!vm) return '';
    var parts = renderHarnessCore(vm, { compact: true }).split('|');
    var panelClass = parts[0];
    var inner = parts[1] || parts[0];
    if (!inner.startsWith('<div')) {
      inner = '<div class="' + panelClass + '" data-loop-harness="1">' + inner + '</div>';
    }
    return inner;
  }

  /** Full live panel with loop HITL controls (Live Status section). */
  function renderLivePanel(rs, lh) {
    var vm = buildViewModel(rs, lh);
    if (!vm) return '';
    var parts = renderHarnessCore(vm, { compact: false }).split('|');
    var inner = parts[1] || parts[0];
    return renderControls(vm) + inner;
  }

  function togglePhaseDetail(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('open');
    if (isMobileFn()) {
      var open = el.classList.contains('open');
      if (open) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  function doControl(cmd) {
    if (!onHitl) {
      console.warn('[LoopEngine] onHitl not wired');
      return;
    }
    if (cmd === 'abort') {
      if (!confirmFn('Abort the current run?\n\nThe run will stop after the current wave completes.')) return;
      onHitl('abort');
      return;
    }
    if (cmd === 'escalate') {
      if (!confirmFn('Escalate this closed loop now?\n\nThe operator will be notified for manual review.')) return;
      onHitl('inject', { text: 'ESCALATE: Operator requested immediate closed-loop escalation via dashboard.' });
      return;
    }
    onHitl(cmd);
  }

  /** Bind loop control buttons after Live Status re-render. */
  function bindLivePanel(root) {
    var container = root || document.getElementById('live-section');
    if (!container) return;
    container.querySelectorAll('.loop-ctrl-btn[data-loop-cmd]').forEach(function (btn) {
      if (btn.dataset.loopBound) return;
      btn.dataset.loopBound = '1';
      btn.addEventListener('click', function () {
        doControl(btn.getAttribute('data-loop-cmd'));
      });
    });
  }

  global.LoopEngine = {
    init: init,
    getHealth: getHealth,
    setHealth: setHealth,
    fetchHealth: fetchHealth,
    renderSummary: renderSummary,
    renderLivePanel: renderLivePanel,
    bindLivePanel: bindLivePanel,
    togglePhaseDetail: togglePhaseDetail,
    doControl: doControl,
    buildViewModel: buildViewModel,
    PHASES: PHASES,
  };

  global.toggleLoopPhaseDetail = togglePhaseDetail;
})(typeof window !== 'undefined' ? window : globalThis);
