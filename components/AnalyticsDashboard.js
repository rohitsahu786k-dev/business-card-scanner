'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectOnDoodle, projectOnWorld } from '@/lib/geo';
import { DOODLE_VIEW_BOX, INDIA_DOODLE_PATH } from '@/lib/india-map';
import { WORLD_BOX, WORLD_LAND_PATH } from '@/lib/world-map';
import { formatInr, formatUsd } from '@/lib/config';

// Categorical hues, assigned in fixed order and never cycled. Validated for the
// light chart surface (lightness band, chroma floor, CVD separation, contrast).
const CATEGORICAL = ['#e63232', '#2563eb', '#0e9f6e', '#d97706', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];

// Single hues for magnitude (one-series) charts — one hue per chart, never a
// hue per bar, so length is the only thing encoding value.
const HUE = {
  brand: '#e63232',
  blue: '#2563eb',
  violet: '#8b5cf6',
  teal: '#0891b2',
  amber: '#d97706',
  green: '#0e9f6e',
};

const RANGES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

const fmtInt = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/* ------------------------------------------------------------------ Tooltip */
// One floating tooltip shared by every chart on the page, positioned against the
// dashboard container so it can never be clipped by a chart card's overflow.
function useTooltip() {
  const [tip, setTip] = useState(null); // { x, y, title, rows: [[label, value]] }
  const hostRef = useRef(null);

  const show = useCallback((event, content) => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    setTip({ ...content, x: event.clientX - box.left, y: event.clientY - box.top });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div className="dash-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <strong>{tip.title}</strong>
      {tip.rows.map(([label, value]) => (
        <span key={label}><i>{label}</i><b>{value}</b></span>
      ))}
    </div>
  ) : null;

  return { hostRef, show, hide, node };
}

/* ------------------------------------------------------------------- Charts */

function Kpi({ label, value, sub, tone, hero }) {
  return (
    <div className={`dash-kpi${hero ? ' hero' : ''}${tone ? ` tone-${tone}` : ''}`}>
      <span className="dash-kpi-label">{label}</span>
      <strong className="dash-kpi-value">{value}</strong>
      {sub && <span className="dash-kpi-sub">{sub}</span>}
    </div>
  );
}

function Timeline({ data, onHover, onLeave }) {
  if (!data.length) return <p className="dash-empty">No captures in this period.</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  const label = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  // Only label the ends and the middle — a date under every bar is unreadable.
  const ticks = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  return (
    <div className="dash-timeline" onMouseLeave={onLeave}>
      {data.map((d, i) => (
        <div
          className="dash-timeline-col"
          key={d.date}
          onMouseMove={(e) => onHover(e, { title: label(d.date), rows: [['Contacts', fmtInt(d.value)]] })}
        >
          <span className="dash-timeline-bar" style={{ height: `${Math.max((d.value / max) * 100, 3)}%` }} />
          <small>{ticks.has(i) ? label(d.date) : ' '}</small>
        </div>
      ))}
    </div>
  );
}

function Donut({ data, total, unit }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const segments = [];
  data.reduce((offset, d, i) => {
    const dash = total ? (d.value / total) * circumference : 0;
    segments.push({ ...d, dash, offset, color: CATEGORICAL[i % CATEGORICAL.length] });
    return offset + dash;
  }, 0);
  if (!total) return <p className="dash-empty">Nothing to show yet.</p>;
  return (
    <div className="dash-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${unit} breakdown`}>
        <g transform="translate(70,70) rotate(-90)">
          {segments.map((s) => (
            <circle
              key={s.label}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              /* 2px surface gap between adjacent segments */
              strokeDasharray={`${Math.max(s.dash - 2, 0)} ${circumference - Math.max(s.dash - 2, 0)}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
        <text x="70" y="67" textAnchor="middle" className="dash-donut-total">{fmtInt(total)}</text>
        <text x="70" y="85" textAnchor="middle" className="dash-donut-sub">{unit}</text>
      </svg>
      <ul className="dash-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="dash-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="dash-legend-label">{s.label}</span>
            <b>{fmtInt(s.value)}</b>
            <i>{pct(s.value, total)}%</i>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({ data, hue = HUE.brand, empty }) {
  if (!data.length) return <p className="dash-empty">{empty}</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <ul className="dash-bars">
      {data.map((d) => (
        <li key={d.label}>
          <span className="dash-bar-label" title={d.label}>{d.label}</span>
          <span className="dash-bar-track">
            <span className="dash-bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: hue }} />
          </span>
          <b className="dash-bar-value">{fmtInt(d.value)}</b>
        </li>
      ))}
    </ul>
  );
}

// Two views over the same contacts: the hand-drawn India artwork with a bubble
// per city, and a world outline with a bubble per country. Both project through
// lib/geo.js, so bubbles and outlines can never drift apart.
//
// India stays the default — it is where the contacts are — and the world tab is
// how a contact outside India becomes visible at all.
const VIEWS = {
  india: {
    label: 'India',
    box: `${DOODLE_VIEW_BOX.x} ${DOODLE_VIEW_BOX.y} ${DOODLE_VIEW_BOX.width} ${DOODLE_VIEW_BOX.height}`,
    path: INDIA_DOODLE_PATH,
    project: projectOnDoodle,
    // Radii are in each map's own units, so they scale with the artwork.
    radius: (ratio) => 24 + Math.sqrt(ratio) * 92,
    aria: 'Contacts by city across India',
    heading: 'Top cities',
    empty: 'No Indian locations resolved yet. Run AI enrichment so contacts get a city.',
  },
  world: {
    label: 'World',
    box: `0 0 ${WORLD_BOX.lngMax - WORLD_BOX.lngMin} ${WORLD_BOX.latMax - WORLD_BOX.latMin}`,
    path: WORLD_LAND_PATH,
    project: projectOnWorld,
    radius: (ratio) => 1.6 + Math.sqrt(ratio) * 6,
    aria: 'Contacts by country worldwide',
    heading: 'By country',
    empty: 'No countries resolved yet. Run AI enrichment so contacts get a country.',
  },
};

function LocationMap({ cityPoints, countryPoints, states, outsideIndia, onHover, onLeave }) {
  const [view, setView] = useState('india');
  const [active, setActive] = useState(null);

  const config = VIEWS[view];
  const points = view === 'india' ? cityPoints : countryPoints;
  const max = Math.max(...points.map(p => p.count), 1);
  // Biggest first so a small bubble is never buried under a large one.
  const ordered = [...points].sort((a, b) => b.count - a.count);

  const pick = (next) => { setView(next); setActive(null); onLeave(); };

  return (
    <>
      <div className="dash-map-tabs" role="group" aria-label="Map view">
        {Object.entries(VIEWS).map(([id, v]) => (
          <button key={id} type="button" className={view === id ? 'active' : ''} onClick={() => pick(id)}>
            {v.label}
          </button>
        ))}
        {outsideIndia > 0 && view === 'india' && (
          <span className="dash-map-note">
            <i className="fas fa-circle-info" aria-hidden="true" />
            {fmtInt(outsideIndia)} outside India — see World
          </span>
        )}
      </div>

      <div className={`dash-map view-${view}`}>
        <svg
          viewBox={config.box}
          className="dash-map-svg"
          role="img"
          aria-label={config.aria}
          onMouseLeave={() => { setActive(null); onLeave(); }}
        >
          <path d={config.path} className="dash-map-ink" />
          {ordered.map((p) => {
            const { x, y } = config.project(p.lat, p.lng);
            return (
              <circle
                key={`${p.label}-${p.lat}-${p.lng}`}
                cx={x}
                cy={y}
                r={config.radius(p.count / max)}
                className={`dash-map-bubble${active === p.label ? ' active' : ''}`}
                onMouseMove={(event) => {
                  setActive(p.label);
                  onHover(event, {
                    title: p.label,
                    rows: [
                      ['Contacts', fmtInt(p.count)],
                      ['Companies', fmtInt(p.companies)],
                      ['Decision makers', fmtInt(p.decisionMakers)],
                    ],
                  });
                }}
              />
            );
          })}
        </svg>

        <div className="dash-map-side">
          {points.length === 0 ? (
            <>
              <h4>{config.heading}</h4>
              <p className="dash-empty">{config.empty}</p>
            </>
          ) : (
            <>
              <h4>{config.heading}</h4>
              <ol className="dash-map-list">
                {ordered.slice(0, 7).map((p) => (
                  <li
                    key={p.label}
                    className={active === p.label ? 'active' : ''}
                    onMouseEnter={() => setActive(p.label)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <span>{p.label}</span>
                    <b>{fmtInt(p.count)}</b>
                  </li>
                ))}
              </ol>
              {view === 'india' && states.length > 0 && (
                <>
                  <h4 className="dash-map-subhead">By state</h4>
                  <ol className="dash-map-list">
                    {states.slice(0, 5).map((s) => (
                      <li key={s.label}><span>{s.label}</span><b>{fmtInt(s.value)}</b></li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Dashboard */

export default function AnalyticsDashboard({ projectId, projectName }) {
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [range, setRange] = useState('all');
  const [showTable, setShowTable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { hostRef, show, hide, node: tooltip } = useTooltip();

  // What is on screen is whatever the last settled fetch produced, tagged with
  // the query it answered. Anything else means a newer query is still in flight,
  // so `loading` is derived rather than flipped by hand in the effect.
  const queryKey = `${projectId || 'all'}|${range}|${reloadKey}`;
  const [view, setView] = useState({ key: null, data: null, error: '' });
  const loading = view.key !== queryKey;
  const { data, error } = view;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    const days = RANGES.find(r => r.id === range)?.days;
    if (days) {
      const from = new Date();
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      params.set('startDate', from.toISOString());
    }
    fetch(`/api/analytics?${params.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(json => { if (!cancelled) setView({ key: queryKey, data: json, error: '' }); })
      .catch(() => {
        if (!cancelled) setView({ key: queryKey, data: null, error: 'Could not load analytics. Please refresh.' });
      });
    return () => { cancelled = true; };
  }, [projectId, range, queryKey]);

  // Drain the enrichment backlog (the endpoint processes 20 per call), then
  // reload so the industry / seniority / location charts fill in.
  const runEnrichment = async () => {
    setEnriching(true);
    setEnrichProgress(0);
    try {
      for (let i = 0; i < 25; i += 1) {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: true }),
        });
        if (!res.ok) break;
        const r = await res.json();
        setEnrichProgress(p => p + (r.processed || 0));
        if (!r.processed || r.remaining === 0) break;
      }
    } catch {
      // Partial progress still persists — the button simply reappears.
    } finally {
      setEnriching(false);
      setReloadKey(k => k + 1);
    }
  };

  const insight = useMemo(() => {
    if (!data || !data.kpis.totalContacts) return '';
    const k = data.kpis;
    const bits = [`${fmtInt(k.totalContacts)} contact${k.totalContacts === 1 ? '' : 's'} captured across ${fmtInt(k.uniqueCompanies)} compan${k.uniqueCompanies === 1 ? 'y' : 'ies'}.`];
    if (data.topCompanies[0]) bits.push(`${data.topCompanies[0].label} leads with ${data.topCompanies[0].value}.`);
    if (k.decisionMakers) bits.push(`${fmtInt(k.decisionMakers)} decision maker${k.decisionMakers === 1 ? '' : 's'} identified.`);
    if (k.duplicatesPrevented) bits.push(`${fmtInt(k.duplicatesPrevented)} duplicate scan${k.duplicatesPrevented === 1 ? '' : 's'} prevented.`);
    if (data.industries[0]) bits.push(`Top industry: ${data.industries[0].label}.`);
    else if (k.pendingEnrichment) bits.push(`${fmtInt(k.pendingEnrichment)} contacts still awaiting AI enrichment.`);
    return bits.join(' ');
  }, [data]);

  if (loading) {
    return (
      <div className="dash">
        <div className="dash-kpis">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="dash-kpi skeleton" />)}
        </div>
        <div className="dash-charts">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="dash-card skeleton" style={{ height: 260 }} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash">
        <div className="dash-card">
          <p className="dash-empty">{error}</p>
          <button type="button" className="btn-outline" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const scanTotal = data.scanMethods.reduce((sum, s) => sum + s.value, 0);
  const needsEnrichment = 'No data yet — run AI enrichment to classify captured contacts.';

  return (
    <div className="dash" ref={hostRef}>
      {tooltip}

      <header className="dash-head">
        <div>
          <h2>{projectName || 'All contacts'}</h2>
          <p>Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="dash-head-actions">
          <div className="dash-range" role="group" aria-label="Time range">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                className={range === r.id ? 'active' : ''}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {k.pendingEnrichment > 0 && (
            <button type="button" className="dash-enrich" onClick={runEnrichment} disabled={enriching}>
              <i className={`fas ${enriching ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} />
              {enriching ? `Enriching… ${enrichProgress}` : `Enrich ${k.pendingEnrichment}`}
            </button>
          )}
        </div>
      </header>

      {k.totalContacts === 0 ? (
        <div className="dash-card dash-blank">
          <i className="fas fa-chart-line" />
          <h3>No contacts in this view</h3>
          <p>Scan a card — or widen the time range — and the analytics will fill in here.</p>
        </div>
      ) : (
        <>
          <p className="dash-insight"><i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{insight}</p>

          <div className="dash-kpis">
            <Kpi hero label="Contacts captured" value={fmtInt(k.totalContacts)} sub={`${fmtInt(k.uniqueCompanies)} unique companies`} tone="brand" />
            <Kpi label="Decision makers" value={fmtInt(k.decisionMakers)} sub={`${pct(k.decisionMakers, k.totalContacts)}% of contacts`} />
            <Kpi label="High-priority leads" value={fmtInt(k.highPriorityLeads)} sub={`${pct(k.highPriorityLeads, k.totalContacts)}% of contacts`} tone="good" />
            <Kpi label="Data completeness" value={`${k.dataCompleteness}%`} sub="Across 5 core fields" />
            <Kpi label="Duplicates prevented" value={fmtInt(k.duplicatesPrevented)} sub="Merged, not re-created" />
            <Kpi label="AI scan cost" value={formatUsd(k.totalCost)} sub={`≈ ${formatInr(k.totalCost)} · ${fmtInt(k.qrScans)} QR scans were free`} />
          </div>

          <div className="dash-strip">
            <span><i className="fas fa-envelope" />{fmtInt(k.withEmail)} with email<b>{pct(k.withEmail, k.totalContacts)}%</b></span>
            <span><i className="fas fa-mobile-screen" />{fmtInt(k.withMobile)} with mobile<b>{pct(k.withMobile, k.totalContacts)}%</b></span>
            <span><i className="fas fa-clone" />{fmtInt(k.frontAndBack)} front + back<b>{pct(k.frontAndBack, k.totalContacts)}%</b></span>
            <span><i className="fas fa-star" />{fmtInt(k.favorites)} favorites<b>{pct(k.favorites, k.totalContacts)}%</b></span>
          </div>

          <div className="dash-charts">
            <section className="dash-card span-2">
              <h3>Capture timeline</h3>
              <Timeline data={data.timeline} onHover={show} onLeave={hide} />
            </section>

            <section className="dash-card span-2 dash-card-map">
              <h3>Where contacts come from</h3>
              <LocationMap
                cityPoints={data.map || []}
                countryPoints={data.world || []}
                states={data.states || []}
                outsideIndia={data.outsideIndia || 0}
                onHover={show}
                onLeave={hide}
              />
            </section>

            <section className="dash-card">
              <h3>Scan method</h3>
              <Donut data={data.scanMethods} total={scanTotal} unit="scans" />
            </section>

            <section className="dash-card">
              <h3>Industries</h3>
              <BarList data={data.industries.slice(0, 8)} hue={HUE.blue} empty={needsEnrichment} />
            </section>

            <section className="dash-card">
              <h3>Seniority</h3>
              <BarList data={data.seniority.slice(0, 8)} hue={HUE.violet} empty={needsEnrichment} />
            </section>

            <section className="dash-card">
              <h3>Top companies</h3>
              <BarList data={data.topCompanies} hue={HUE.brand} empty="No company names captured yet." />
            </section>

            <section className="dash-card">
              <h3>Departments</h3>
              <BarList data={(data.departments || []).slice(0, 8)} hue={HUE.teal} empty={needsEnrichment} />
            </section>

            <section className="dash-card">
              <h3>Missing fields</h3>
              <BarList
                hue={HUE.amber}
                empty="Every contact has all core fields."
                data={[
                  { label: 'Email', value: data.dataQuality.missingEmail },
                  { label: 'Mobile', value: data.dataQuality.missingMobile },
                  { label: 'Company', value: data.dataQuality.missingCompany },
                  { label: 'Designation', value: data.dataQuality.missingDesignation },
                ].filter(d => d.value > 0)}
              />
            </section>
          </div>

          <button type="button" className="dash-table-toggle" onClick={() => setShowTable(v => !v)} aria-expanded={showTable}>
            <i className={`fas fa-chevron-${showTable ? 'up' : 'down'}`} />
            {showTable ? 'Hide data table' : 'View the same data as a table'}
          </button>

          {showTable && (
            <div className="dash-card dash-table-wrap">
              <table className="dash-table">
                <caption>Every chart above, as numbers.</caption>
                <thead>
                  <tr><th scope="col">Category</th><th scope="col">Value</th><th scope="col">Count</th></tr>
                </thead>
                <tbody>
                  {[
                    ...data.scanMethods.map(d => ['Scan method', d.label, d.value]),
                    ...(data.world || []).map(d => ['Country', d.label, d.count]),
                    ...(data.states || []).map(d => ['State', d.label, d.value]),
                    ...data.cities.map(d => ['City', d.label, d.value]),
                    ...data.industries.map(d => ['Industry', d.label, d.value]),
                    ...data.seniority.map(d => ['Seniority', d.label, d.value]),
                    ...(data.departments || []).map(d => ['Department', d.label, d.value]),
                    ...data.topCompanies.map(d => ['Company', d.label, d.value]),
                    ...data.timeline.map(d => ['Captured on', d.date, d.value]),
                  ].map(([group, label, value], i) => (
                    <tr key={`${group}-${label}-${i}`}>
                      <td>{group}</td><td>{label}</td><td>{fmtInt(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
