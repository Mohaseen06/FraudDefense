import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, api } from './api.js';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0));
const shortDate = (value) => value ? new Date(value).toLocaleString() : '—';
const amountOf = (transaction = {}) => transaction.amt ?? transaction.amount ?? 0;

function RiskBadge({ tier }) {
  const style = tier === 'high' ? 'badge-high' : tier === 'borderline' ? 'badge-borderline' : 'badge-low';
  return <span className={`badge ${style}`}>{tier ?? 'unscored'}</span>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('analyst@example.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = await api('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) }); onLogin(result); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-art"><div className="brand-mark">FD</div><div className="eyebrow light">PAYMENTS INTELLIGENCE</div><h1>See the signal.<br />Protect every swipe.</h1><p>One clear view of transaction risk, active cases, and the decisions that keep payments moving.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-dot"/></div>
    <form className="login-card" onSubmit={submit}><div className="eyebrow">ANALYST ACCESS</div><h2>Welcome back</h2><p className="muted">Sign in to your Fraud Defense workspace.</p>
      <label>Email address<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div className="error-box">{error}</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<span>→</span></button>
      <div className="login-foot">Demo credentials are configured in the backend <code>.env</code>.</div>
    </form>
  </main>;
}

function Sidebar({ page, analyst, navigate, logout }) {
  const links = [['dashboard', '◫', 'Live dashboard'], ['cases', '▤', 'Cases'], ['model', '⌁', 'Model']];
  return <aside className="sidebar"><div className="brand"><span className="brand-mark small">FD</span><span>Fraud<span className="brand-light">Defense</span></span></div>
    <div className="nav-label">WORKSPACE</div><nav>{links.map(([key, icon, label]) => <button key={key} className={`nav-item ${page === key || (key === 'cases' && page === 'case-detail') ? 'active' : ''}`} onClick={() => navigate(key)}><span className="nav-icon">{icon}</span>{label}{key === 'cases' && <span className="nav-arrow">›</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="system-pill"><span className="status-dot"/>All services operational</div><div className="analyst"><div className="avatar">{(analyst?.displayName ?? 'A').slice(0, 1)}</div><div className="analyst-info"><strong>{analyst?.displayName ?? 'Analyst'}</strong><span>{analyst?.email}</span></div><button className="logout" title="Sign out" onClick={logout}>↗</button></div></div>
  </aside>;
}

function Header({ title, subtitle, action }) {
  return <header className="page-header"><div><div className="eyebrow">FRAUD DEFENSE / OPERATIONS</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}

function Dashboard({ token, onOpenCase }) {
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const refresh = async () => {
    try { const [summary, feed] = await Promise.all([api('/api/stats', token), api('/api/transactions?limit=12', token)]); setStats(summary); setTransactions(feed.items); setError(''); }
    catch (reason) { setError(reason.message); }
  };
  useEffect(() => { refresh(); const interval = setInterval(refresh, 8000); const socket = io(API_URL, { auth: { token } });
    socket.on('transaction:new', (event) => { const item = event.transaction; setTransactions((current) => [item, ...current.filter((entry) => entry._id !== item._id)].slice(0, 12)); });
    socket.on('connect_error', () => {});
    return () => { clearInterval(interval); socket.disconnect(); };
  }, [token]);
  const points = useMemo(() => transactions.slice(0, 12).reverse().map((item, index) => `${index * 32},${102 - Math.round((item.riskScore ?? 0) * 82)}`).join(' '), [transactions]);
  return <><Header title="Live dashboard" subtitle="Transaction activity and risk signals, as they happen." action={<div className="live-indicator"><span className="pulse-dot"/> LIVE FEED</div>} />
    {error && <div className="error-box inline-error">{error}</div>}
    <section className="metric-grid">
      <Metric label="Transactions" value={stats?.total ?? '—'} detail="All received" symbol="↗" />
      <Metric label="Flagged for review" value={stats?.flagged ?? '—'} detail={`${stats?.openCases ?? 0} open cases`} symbol="◎" accent />
      <Metric label="Fraud rate" value={stats ? `${(stats.fraudRate * 100).toFixed(2)}%` : '—'} detail={`${stats?.fraud ?? 0} confirmed fraud`} symbol="⌁" />
      <Metric label="Avg. scoring latency" value={stats ? `${Math.round(stats.averageLatencyMs)} ms` : '—'} detail="ML service response" symbol="◷" />
    </section>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><div className="eyebrow">RISK ACTIVITY</div><h2>Recent transaction scores</h2></div><span className="chart-caption">Latest {transactions.length} transactions</span></div>
      {transactions.length ? <div className="chart-wrap"><div className="chart-y"><span>High</span><span>Medium</span><span>Low</span></div><svg viewBox="0 0 352 120" preserveAspectRatio="none" role="img" aria-label="Recent risk score chart"><line x1="0" y1="20" x2="352" y2="20"/><line x1="0" y1="60" x2="352" y2="60"/><line x1="0" y1="102" x2="352" y2="102"/>{points && <polyline points={points} />}</svg></div> : <Empty text="Transactions will appear here as the simulator streams them." />}
      <div className="chart-legend"><span><i className="legend-green"/>Low risk</span><span><i className="legend-amber"/>Borderline</span><span><i className="legend-red"/>High risk</span></div>
    </section><section className="panel watch-panel"><div className="panel-heading"><div><div className="eyebrow">NEEDS ATTENTION</div><h2>Open cases</h2></div><button className="text-button" onClick={() => { location.hash = '#/cases'; }}>View all →</button></div>
      {transactions.filter((item) => item.caseId).slice(0, 4).map((item) => <button className="watch-item" key={item._id} onClick={() => item.caseId && onOpenCase(item.caseId)}><span className="watch-symbol">!</span><span className="watch-copy"><strong>{item.transaction?.merchant ?? 'Transaction review'}</strong><small>{money(amountOf(item.transaction))} · {shortDate(item.receivedAt)}</small></span><RiskBadge tier={item.riskTier} /></button>)}
      {!transactions.some((item) => item.caseId) && <Empty text="No open cases in this feed." />}
    </section></div>
    <section className="panel feed-panel"><div className="panel-heading"><div><div className="eyebrow">STREAM</div><h2>Recent transactions</h2></div><span className="table-count">{transactions.length} records</span></div><TransactionTable items={transactions} onOpenCase={onOpenCase} /></section>
  </>;
}

function Metric({ label, value, detail, symbol, accent }) {
  return <article className={`metric-card ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><span className="metric-symbol">{symbol}</span></div><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>;
}

function TransactionTable({ items, onOpenCase }) {
  if (!items.length) return <Empty text="Waiting for incoming transactions." />;
  return <div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>AMOUNT</th><th>RISK SCORE</th><th>RISK TIER</th><th>STATUS</th><th>RECEIVED</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} onClick={() => item.caseId && onOpenCase(item.caseId)} className={item.caseId ? 'clickable' : ''}><td><strong>{item.transaction?.merchant ?? 'Card transaction'}</strong><small>{item.externalId ?? String(item._id).slice(-8)}</small></td><td>{money(amountOf(item.transaction))}</td><td>{item.riskScore == null ? '—' : `${(item.riskScore * 100).toFixed(1)}%`}</td><td><RiskBadge tier={item.riskTier} /></td><td><span className="status-text">{(item.status ?? '').replaceAll('_', ' ')}</span></td><td className="date-cell">{shortDate(item.receivedAt)}</td></tr>)}</tbody></table></div>;
}

function Cases({ token, onOpenCase }) {
  const [status, setStatus] = useState(''); const [data, setData] = useState([]); const [error, setError] = useState('');
  useEffect(() => { api(`/api/cases?limit=100${status ? `&status=${status}` : ''}`, token).then((result) => { setData(result.items); setError(''); }).catch((reason) => setError(reason.message)); }, [token, status]);
  return <><Header title="Case review" subtitle="Investigate flagged transactions and record analyst decisions." action={<span className="case-total">{data.length} cases</span>} />
    {error && <div className="error-box inline-error">{error}</div>}<section className="panel cases-panel"><div className="panel-heading"><div><div className="eyebrow">INVESTIGATION QUEUE</div><h2>Cases</h2></div><select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending_investigation">Pending investigation</option><option value="awaiting_human">Awaiting analyst</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
      {!data.length ? <Empty text="No cases match this filter." /> : <div className="table-scroll"><table><thead><tr><th>CASE</th><th>TRANSACTION</th><th>AMOUNT</th><th>RISK</th><th>STATUS</th><th>OPENED</th><th /></tr></thead><tbody>{data.map((item) => <tr key={item._id} className="clickable" onClick={() => onOpenCase(item._id)}><td><strong>#{String(item._id).slice(-7).toUpperCase()}</strong></td><td><strong>{item.transaction?.merchant ?? 'Card transaction'}</strong><small>{item.transaction?.category ?? 'Unknown category'}</small></td><td>{money(amountOf(item.transaction))}</td><td><RiskBadge tier={item.riskTier} /><small>{(item.riskScore * 100).toFixed(1)}% score</small></td><td><span className={`case-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td><td className="date-cell">{shortDate(item.createdAt)}</td><td className="row-chevron">›</td></tr>)}</tbody></table></div>}
    </section></>;
}

function CaseDetail({ token, caseId, navigate }) {
  const [item, setItem] = useState(null); const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = () => api(`/api/cases/${caseId}`, token).then(setItem).catch((reason) => setError(reason.message));
  useEffect(() => { setItem(null); setError(''); refresh(); }, [caseId, token]);
  async function decide(action) { setBusy(true); setError(''); try { const result = await api(`/api/cases/${caseId}/${action}`, token, { method: 'POST', body: JSON.stringify({ note }) }); setItem(result); } catch (reason) { setError(reason.message); } finally { setBusy(false); } }
  if (error && !item) return <><Header title="Case detail" subtitle="The requested case could not be loaded."/><div className="error-box">{error}</div></>;
  if (!item) return <><Header title="Loading case…" subtitle="Retrieving investigation details."/><div className="panel loading-panel">Loading case details</div></>;
  const transaction = item.transaction ?? {};
  const trace = item.agentTrace?.length ? item.agentTrace : item.investigation?.agent_trace ?? [];
  const decided = ['approved', 'rejected'].includes(item.status);
  return <><button className="back-link" onClick={() => navigate('cases')}>← Back to cases</button><Header title={`Case #${String(item._id).slice(-7).toUpperCase()}`} subtitle={`Opened ${shortDate(item.createdAt)}`} action={<RiskBadge tier={item.riskTier} />} />
    {error && <div className="error-box inline-error">{error}</div>}
    {item.highValue && <div className="high-value-banner"><span>◆</span><div><strong>High-value transaction</strong><p>This case is held for analyst review because the amount exceeds the configured threshold.</p></div></div>}
    <div className="detail-grid"><div className="detail-main"><section className="panel detail-panel"><div className="panel-heading"><div><div className="eyebrow">PAYMENT DETAILS</div><h2>Transaction</h2></div><span className={`case-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></div>
        <div className="detail-amount">{money(amountOf(transaction))}<span>USD</span></div><div className="detail-fields"><Detail label="Merchant" value={transaction.merchant}/><Detail label="Category" value={transaction.category}/><Detail label="Transaction ID" value={transaction.trans_num ?? transaction.transaction_id}/><Detail label="Date and time" value={transaction.trans_date_trans_time}/><Detail label="Cardholder" value={[transaction.first, transaction.last].filter(Boolean).join(' ')}/><Detail label="Location" value={[transaction.city, transaction.state].filter(Boolean).join(', ')}/><Detail label="Customer job" value={transaction.job}/><Detail label="Scoring latency" value={item.transactionId?.latencyMs != null ? `${item.transactionId.latencyMs} ms` : 'Recorded with transaction'}/></div>
      </section><section className="panel detail-panel"><div className="panel-heading"><div><div className="eyebrow">MODEL ASSESSMENT</div><h2>Risk score</h2></div><span className="score-number">{(item.riskScore * 100).toFixed(1)}<small>%</small></span></div><div className="score-track"><span style={{ width: `${item.riskScore * 100}%` }} /></div><div className="score-ends"><span>0 · lower risk</span><span>100 · higher risk</span></div>
        <h3 className="subheading">Top contributing features</h3>{item.topContributingFeatures?.length ? <div className="feature-list">{item.topContributingFeatures.map((feature, index) => <div className="feature-row" key={`${feature.feature}-${index}`}><span>{feature.feature}</span><span className={feature.contribution >= 0 ? 'contribution-up' : 'contribution-down'}>{feature.contribution >= 0 ? '+' : ''}{Number(feature.contribution).toFixed(3)}</span></div>)}</div> : <p className="muted">No feature contributions were returned.</p>}
      </section></div>
      <aside className="detail-side"><section className="panel trace-panel"><div className="eyebrow">INVESTIGATION</div><h2>Agent trace</h2><p className="muted">Investigation steps returned by the service adapter.</p>{trace.length ? <div className="trace-list">{trace.map((entry, index) => <div className="trace-item" key={index}><span className="trace-node"/><div><strong>{entry.agent}</strong><small>{entry.action} · {shortDate(entry.timestamp)}</small><p>{entry.summary}</p></div></div>)}</div> : <div className="placeholder-box"><span>◌</span><strong>No agent trace yet</strong><p>The investigation stub may be unavailable, or no trace has been returned.</p></div>}</section>
        <section className="panel decision-panel"><div className="eyebrow">ANALYST DECISION</div><h2>{decided ? `Case ${item.status}` : 'Review this case'}</h2>{decided ? <><p className="muted">Decision recorded {shortDate(item.decidedAt)}.</p>{item.analystNote && <blockquote>{item.analystNote}</blockquote>}</> : <><label className="note-label">Decision note<textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short reason for your decision…" /></label><button disabled={busy} className="button button-primary button-full" onClick={() => decide('approve')}>Approve transaction <span>✓</span></button><button disabled={busy} className="button button-danger button-full" onClick={() => decide('reject')}>Reject transaction <span>×</span></button></>}</section></aside>
    </div>
  </>;
}

function Detail({ label, value }) { return <div className="detail-field"><span>{label}</span><strong>{value || '—'}</strong></div>; }

function ModelPage({ token }) {
  const [metrics, setMetrics] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api('/api/model-info', token).then(setMetrics).catch((reason) => setError(reason.message)); }, [token]);
  return <><Header title="Model performance" subtitle="Validation and holdout performance for the active fraud model."/>{error && <div className="error-box inline-error">{error}</div>}
    {metrics?.status === 'not_trained' ? <div className="panel not-trained"><div className="model-icon">⌁</div><h2>Model not trained yet</h2><p>Run <code>python ml-service/training/train.py</code> to create the model and evaluation metrics.</p></div> : metrics ? <><section className="metric-grid model-grid"><Metric label="Precision" value={formatMetric(metrics.precision)} detail="At 0.50 score threshold" symbol="◎"/><Metric label="Recall" value={formatMetric(metrics.recall)} detail="At 0.50 score threshold" symbol="⌁" accent/><Metric label="F1 score" value={formatMetric(metrics.f1)} detail="Precision and recall balance" symbol="◈"/><Metric label="PR-AUC" value={formatMetric(metrics.pr_auc)} detail="Precision-recall area" symbol="⌁"/></section><section className="panel model-info"><div className="eyebrow">EVALUATION SETUP</div><h2>Time-based validation</h2><p className="muted">The model was evaluated on the latest 20% of the training file, held out by transaction timestamp.</p><div className="detail-fields"><Detail label="Training rows" value={metrics.time_split?.train_rows?.toLocaleString()}/><Detail label="Validation rows" value={metrics.time_split?.validation_rows?.toLocaleString()}/><Detail label="Training window" value={`${metrics.time_split?.train_start ?? '—'} → ${metrics.time_split?.train_end ?? '—'}`}/><Detail label="Validation window" value={`${metrics.time_split?.validation_start ?? '—'} → ${metrics.time_split?.validation_end ?? '—'}`}/><Detail label="Training fraud rows" value={metrics.fraud_counts?.train?.toLocaleString()}/><Detail label="Scale positive weight" value={Number(metrics.scale_pos_weight ?? 0).toFixed(2)}/></div><p className="updated-at">Metrics generated {shortDate(metrics.created_at)} · Source: {metrics.source_file}</p></section>{metrics.holdout_evaluation ? <HoldoutEvaluation data={metrics.holdout_evaluation}/> : <div className="panel loading-panel">No holdout evaluation artifact found yet.</div>}</> : <div className="panel loading-panel">Loading model metrics…</div>}
  </>;
}

function HoldoutEvaluation({ data }) {
  const queued = data.metrics_at_review_queue_threshold;
  const high = data.metrics_at_high_threshold;
  const tiers = data.tiers ?? {};
  const matrix = queued?.confusion_matrix ?? {};
  const proposal = data.validation_threshold_review?.proposal_for_at_most_five_percent_review_queue;
  const queueShare = tiers.borderline_plus_high_share ?? 0;
  return <section className="panel model-info holdout-info"><div className="eyebrow">UNTOUCHED HOLDOUT</div><h2>fraudTest.csv performance</h2><p className="muted">One evaluation on {Number(data.holdout_rows).toLocaleString()} rows. Borderline and high transactions form the review queue.</p>
    <section className="metric-grid model-grid"><Metric label="PR-AUC" value={formatMetric(data.pr_auc)} detail="Average precision on holdout" symbol="P" accent/><Metric label="Precision" value={formatMetric(queued?.precision)} detail="Borderline + high queue" symbol="P"/><Metric label="Recall" value={formatMetric(queued?.recall)} detail="Borderline + high queue" symbol="R" accent/><Metric label="F1 score" value={formatMetric(queued?.f1)} detail="Borderline + high queue" symbol="F1"/></section>
    <div className="detail-fields holdout-summary"><Detail label="Holdout fraud rate" value={formatMetric(data.fraud_rate)}/><Detail label="Current thresholds" value={`LOW_MAX ${Number(data.thresholds?.low_max).toFixed(2)} / HIGH_MIN ${Number(data.thresholds?.high_min).toFixed(2)}`}/><Detail label="Review queue share" value={formatMetric(queueShare)}/><Detail label="High-only precision / recall / F1" value={`${formatMetric(high?.precision)} / ${formatMetric(high?.recall)} / ${formatMetric(high?.f1)}`}/></div>
    <h3 className="subheading">Traffic and fraud rate by tier</h3><div className="table-scroll"><table><thead><tr><th>TIER</th><th>TRANSACTIONS</th><th>TRAFFIC SHARE</th><th>FRAUD RATE IN TIER</th></tr></thead><tbody>{['low', 'borderline', 'high'].map((tier) => <tr key={tier}><td><RiskBadge tier={tier}/></td><td>{Number(tiers[tier]?.count ?? 0).toLocaleString()}</td><td>{formatMetric(tiers[tier]?.share)}</td><td>{formatMetric(tiers[tier]?.fraud_rate)}</td></tr>)}</tbody></table></div>
    <h3 className="subheading">Review queue confusion matrix</h3><p className="muted">Rows are actual labels; columns are predicted labels at LOW_MAX = {Number(data.thresholds?.low_max).toFixed(2)}.</p><div className="table-scroll"><table><thead><tr><th>ACTUAL / PREDICTED</th><th>Not flagged</th><th>Flagged</th></tr></thead><tbody><tr><td>Not fraud</td><td>{Number(matrix.true_negative ?? 0).toLocaleString()} (TN)</td><td>{Number(matrix.false_positive ?? 0).toLocaleString()} (FP)</td></tr><tr><td>Fraud</td><td>{Number(matrix.false_negative ?? 0).toLocaleString()} (FN)</td><td>{Number(matrix.true_positive ?? 0).toLocaleString()} (TP)</td></tr></tbody></table></div>
    <h3 className="subheading">Live /score latency</h3><div className="detail-fields"><Detail label="Requests measured" value={Number(data.latency?.measured_requests ?? 0).toLocaleString()}/><Detail label="p50" value={`${Number(data.latency?.p50_ms ?? 0).toFixed(2)} ms`}/><Detail label="p95" value={`${Number(data.latency?.p95_ms ?? 0).toFixed(2)} ms`}/><Detail label="Method" value={data.latency?.method}/></div>
    {queueShare > 0.05 && proposal && <div className="error-box queue-warning">Current review traffic exceeds 5%. Validation-only candidate thresholds: LOW_MAX {Number(proposal.low_max).toFixed(4)}, HIGH_MIN {Number(proposal.high_min).toFixed(4)}. They were not applied. See docs/ml-evaluation.md for the validation tradeoff.</div>}
    <p className="updated-at">Holdout evaluation generated {shortDate(data.created_at)}. See docs/ml-evaluation.md.</p>
  </section>;
}

function formatMetric(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—'; }
function Empty({ text }) { return <div className="empty-state"><span>⌁</span><p>{text}</p></div>; }

export default function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('fraud-defense-session')); } catch { return null; } });
  const [hash, setHash] = useState(location.hash || '#/dashboard');
  useEffect(() => { const onHash = () => setHash(location.hash || '#/dashboard'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const route = hash.replace(/^#\/?/, '').split('/');
  const page = route[0] || 'dashboard';
  const caseId = page === 'cases' && route[1] ? route[1] : null;
  function onLogin(result) { localStorage.setItem('fraud-defense-session', JSON.stringify(result)); setSession(result); location.hash = '#/dashboard'; }
  function logout() { localStorage.removeItem('fraud-defense-session'); setSession(null); }
  function navigate(target) { location.hash = `#/${target}`; }
  if (!session?.token) return <Login onLogin={onLogin}/>;
  return <div className="app-shell"><Sidebar page={caseId ? 'case-detail' : page} analyst={session.analyst} navigate={navigate} logout={logout}/><main className="main-content">
    {page === 'dashboard' && <Dashboard token={session.token} onOpenCase={(id) => navigate(`cases/${id}`)}/>}
    {page === 'cases' && (caseId ? <CaseDetail token={session.token} caseId={caseId} navigate={navigate}/> : <Cases token={session.token} onOpenCase={(id) => navigate(`cases/${id}`)}/>)}
    {page === 'model' && <ModelPage token={session.token}/>}
    {!['dashboard', 'cases', 'model'].includes(page) && <><Header title="Page not found" subtitle="Choose a page from the workspace navigation."/><button className="button button-primary" onClick={() => navigate('dashboard')}>Go to dashboard</button></>}
  </main></div>;
}
