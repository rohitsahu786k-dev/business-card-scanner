'use client';
import { useEffect, useMemo, useState } from 'react';

// Brand-led categorical palette (OnePWS red first), used for donut/bar series.
const PALETTE = ['#e63232', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];

function Donut({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  // Precompute each segment's cumulative offset functionally (no render-time
  // variable reassignment) so the SVG arcs stack correctly.
  const segments = [];
  data.reduce((acc, d, i) => {
    const dash = total ? (d.value / total) * circumference : 0;
    segments.push({ label: d.label, value: d.value, dash, offset: acc, color: PALETTE[i % PALETTE.length] });
    return acc + dash;
  }, 0);
  if (!total) return null;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut-svg" role="img" aria-label="Distribution donut chart">
        <g transform="translate(70,70) rotate(-90)">
          {segments.map((s) => (
            <circle
              key={s.label}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
        <text x="70" y="66" textAnchor="middle" className="donut-total">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="donut-sub">scans</text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="legend-dot" style={{ background: s.color }}></span>
            {s.label}<strong>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({ data, accent = '#e63232', emptyLabel }) {
  if (!data.length) return <p className="chart-empty">{emptyLabel}</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <ul className="bar-list">
      {data.map((d) => (
        <li key={d.label}>
          <span className="bar-label" title={d.label}>{d.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: accent }}></span>
          </span>
          <span className="bar-value">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ data }) {
  if (!data.length) return <p className="chart-empty">No scans in this period yet.</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="timeline-chart" role="img" aria-label="Contacts captured over time">
      {data.map((d) => (
        <div className="timeline-col" key={d.date} title={`${d.date}: ${d.value}`}>
          <span className="timeline-bar" style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}></span>
          <small>{d.date.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export default function AnalyticsDashboard({ projectId, projectName }) {
  // Parent remounts this component via key={projectId}, so initial state below
  // is the reset — the effect only sets state from async callbacks.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    fetch(`/api/analytics${qs}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(json => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError('Could not load analytics. Please refresh.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [projectId]);

  const insight = useMemo(() => {
    if (!data) return '';
    const k = data.kpis;
    const bits = [];
    bits.push(`${k.totalContacts} contact${k.totalContacts === 1 ? '' : 's'} captured across ${k.uniqueCompanies} compan${k.uniqueCompanies === 1 ? 'y' : 'ies'}.`);
    if (data.topCompanies[0]) bits.push(`${data.topCompanies[0].label} leads with ${data.topCompanies[0].value}.`);
    if (k.duplicatesPrevented) bits.push(`${k.duplicatesPrevented} duplicate scan${k.duplicatesPrevented === 1 ? '' : 's'} prevented.`);
    if (data.industries[0]) bits.push(`Top industry: ${data.industries[0].label}.`);
    else if (k.pendingEnrichment) bits.push(`${k.pendingEnrichment} contacts awaiting AI enrichment for industry & seniority insights.`);
    return bits.join(' ');
  }, [data]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="kpi-grid">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="kpi-card skeleton" />)}
        </div>
        <div className="chart-grid">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="chart-card skeleton" style={{ height: 240 }} />)}
        </div>
      </div>
    );
  }

  if (error) return <div className="dashboard-page"><p className="chart-empty">{error}</p></div>;

  const k = data.kpis;
  const emptyEnrich = 'Pending AI enrichment — available after the enrichment phase.';

  return (
    <div className="dashboard-page">
      <div className="dashboard-head">
        <div>
          <h2>Analytics</h2>
          <span>{projectName || 'All contacts'} · updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {k.totalContacts === 0 ? (
        <p className="chart-empty">No contacts captured yet. Scan a card to see analytics here.</p>
      ) : (
        <>
          <div className="insight-panel">
            <i className="fas fa-wand-magic-sparkles"></i>
            <p>{insight}</p>
          </div>

          <div className="kpi-grid">
            <Kpi label="Total Contacts" value={k.totalContacts} accent="#e63232" />
            <Kpi label="Unique Companies" value={k.uniqueCompanies} />
            <Kpi label="With Email" value={k.withEmail} sub={`${k.totalContacts ? Math.round((k.withEmail / k.totalContacts) * 100) : 0}%`} />
            <Kpi label="With Mobile" value={k.withMobile} sub={`${k.totalContacts ? Math.round((k.withMobile / k.totalContacts) * 100) : 0}%`} />
            <Kpi label="Front + Back Cards" value={k.frontAndBack} />
            <Kpi label="Duplicates Prevented" value={k.duplicatesPrevented} accent="#16a34a" />
            <Kpi label="AI Scans" value={k.aiScans} />
            <Kpi label="QR / vCard Scans" value={k.qrScans} />
            <Kpi label="Data Completeness" value={`${k.dataCompleteness}%`} />
            <Kpi label="Decision Makers" value={k.decisionMakers} sub={k.decisionMakers ? undefined : 'needs enrichment'} />
            <Kpi label="High-Priority Leads" value={k.highPriorityLeads} sub={k.highPriorityLeads ? undefined : 'needs enrichment'} />
            <Kpi label="Total AI Scan Cost" value={`$${k.totalCost.toFixed(4)}`} />
          </div>

          <div className="chart-grid">
            <div className="chart-card wide">
              <h3>Contact Capture Timeline</h3>
              <Timeline data={data.timeline} />
            </div>

            <div className="chart-card">
              <h3>Scan Method</h3>
              <Donut data={data.scanMethods} />
            </div>

            <div className="chart-card">
              <h3>Top Companies</h3>
              <BarList data={data.topCompanies} emptyLabel="No company data yet." />
            </div>

            <div className="chart-card">
              <h3>Industries</h3>
              <BarList data={data.industries} accent="#2563eb" emptyLabel={emptyEnrich} />
            </div>

            <div className="chart-card">
              <h3>Seniority</h3>
              <BarList data={data.seniority} accent="#8b5cf6" emptyLabel={emptyEnrich} />
            </div>

            <div className="chart-card">
              <h3>Top Cities</h3>
              <BarList data={data.cities} accent="#0891b2" emptyLabel={emptyEnrich} />
            </div>

            <div className="chart-card">
              <h3>Data Quality — Missing Fields</h3>
              <BarList
                accent="#f59e0b"
                emptyLabel="All fields complete."
                data={[
                  { label: 'Email', value: data.dataQuality.missingEmail },
                  { label: 'Mobile', value: data.dataQuality.missingMobile },
                  { label: 'Company', value: data.dataQuality.missingCompany },
                  { label: 'Designation', value: data.dataQuality.missingDesignation },
                ].filter(d => d.value > 0)}
              />
            </div>
          </div>

          {!data.enrichmentReady && (
            <p className="enrich-note">
              <i className="fas fa-circle-info"></i>
              Industry, seniority, designation and location charts populate automatically once the AI enrichment phase is enabled.
            </p>
          )}
        </>
      )}
    </div>
  );
}
