// Pure-SVG charts, no client JS or external library — safe inside a server
// component. Hover effects are plain CSS (Tailwind hover: classes on SVG
// elements), which needs no interactivity/state.

const NAVY = '#001F5B'

export function MonthlyCollectionsChart({ months }: { months: { label: string; total: number }[] }) {
  const max = Math.max(...months.map(m => m.total), 1)
  const width = 340
  const height = 220
  const chartTop = 30
  const chartBottom = 170
  const chartHeight = chartBottom - chartTop
  const slot = width / months.length
  const barWidth = Math.min(36, slot * 0.6)

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ minWidth: 0 }}>
        {/* baseline */}
        <line x1={0} y1={chartBottom} x2={width} y2={chartBottom} stroke="#e2e8f0" strokeWidth={1} />
        {months.map((m, i) => {
          const barHeight = max > 0 ? (m.total / max) * chartHeight : 0
          const x = i * slot + (slot - barWidth) / 2
          const y = chartBottom - barHeight
          return (
            <g key={m.label}>
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="9" fill="#475569" fontWeight={600}>
                {m.total > 0 ? Math.round(m.total).toLocaleString() : '0'}
              </text>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 1)} rx={3}
                fill={NAVY} className="transition-colors hover:fill-[#C9A84C]" style={{ cursor: 'pointer' }}>
                <title>{`${m.label}: RWF ${Math.round(m.total).toLocaleString()}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={chartBottom + 16} textAnchor="middle" fontSize="10" fill="#64748b">
                {m.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface DonutSegment { label: string; count: number; color: string }

export function LoanPortfolioDonut({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0)
  const size = 220
  const center = size / 2
  const radius = 80
  const strokeWidth = 26
  const circumference = 2 * Math.PI * radius

  let cumulative = 0

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ minWidth: 200, minHeight: 200 }}>
        <g transform={`rotate(-90 ${center} ${center})`}>
          {total === 0 ? (
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
          ) : (
            segments.filter(s => s.count > 0).map(seg => {
              const fraction = seg.count / total
              const dash = fraction * circumference
              const offset = -cumulative
              cumulative += dash
              return (
                <circle key={seg.label} cx={center} cy={center} r={radius} fill="none"
                  stroke={seg.color} strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}>
                  <title>{`${seg.label}: ${seg.count} (${(fraction * 100).toFixed(0)}%)`}</title>
                </circle>
              )
            })
          )}
        </g>
        <text x={center} y={center - 4} textAnchor="middle" fontSize="22" fontWeight={700} fill="#1e293b">{total}</text>
        <text x={center} y={center + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">LOANS</text>
      </svg>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-slate-600 flex-1">{seg.label}</span>
            <span className="font-semibold text-slate-800">{seg.count}</span>
            <span className="text-slate-400 w-10 text-right">{total > 0 ? Math.round((seg.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
