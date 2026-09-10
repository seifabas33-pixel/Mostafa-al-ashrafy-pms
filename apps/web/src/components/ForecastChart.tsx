import { useState } from 'react';
import { shortDate, weekday } from '../format';
import type { ForecastDay } from '../types';

/** 14-day occupancy forecast: booked-room bars with an occupancy % line, plain inline SVG. */
export function ForecastChart({ data, businessDate }: { data: ForecastDay[]; businessDate?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;
  const W = 720;
  const H = 200;
  const padL = 34;
  const padR = 34;
  const padT = 14;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxRooms = Math.max(1, ...data.map((d) => d.booked + d.available));
  const slot = innerW / data.length;
  const barW = Math.max(6, slot * 0.58);
  const yRooms = (v: number) => padT + innerH - (v / maxRooms) * innerH;
  const yPct = (v: number) => padT + innerH - (v / 100) * innerH;
  const points = data.map((d, i) => `${padL + slot * i + slot / 2},${yPct(d.occupancyPct)}`).join(' ');
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="14-day occupancy forecast">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yPct(t)} y2={yPct(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={W - padR + 6} y={yPct(t) + 4} fontSize="10" fill="var(--text-3)">
              {t}%
            </text>
          </g>
        ))}
        <text x={padL - 6} y={padT + 4} fontSize="10" fill="var(--text-3)" textAnchor="end">
          {maxRooms}
        </text>
        <text x={padL - 6} y={padT + innerH} fontSize="10" fill="var(--text-3)" textAnchor="end">
          0
        </text>
        {data.map((d, i) => {
          const x = padL + slot * i + (slot - barW) / 2;
          const isToday = d.date === businessDate;
          const active = hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill={active ? 'var(--surface-3)' : 'transparent'} />
              <rect x={x} y={yRooms(d.booked)} width={barW} height={Math.max(0, padT + innerH - yRooms(d.booked))} rx="3" fill={isToday ? 'var(--primary)' : 'var(--blue-soft)'} stroke={isToday ? 'none' : 'var(--blue)'} strokeWidth="1" />
              <text x={padL + slot * i + slot / 2} y={H - padB + 14} fontSize="10" textAnchor="middle" fill={isToday ? 'var(--primary)' : 'var(--text-2)'} fontWeight={isToday ? 700 : 400}>
                {shortDate(d.date)}
              </text>
              <text x={padL + slot * i + slot / 2} y={H - padB + 26} fontSize="9" textAnchor="middle" fill="var(--text-3)">
                {weekday(d.date)}
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
        {data.map((d, i) => (
          <circle key={d.date} cx={padL + slot * i + slot / 2} cy={yPct(d.occupancyPct)} r={hover === i ? 5 : 3} fill="var(--teal)" stroke="var(--surface)" strokeWidth="1.5" pointerEvents="none" />
        ))}
      </svg>
      <div className="row row-between">
        <div className="legend">
          <span>
            <span className="dot dot-blue" />
            Rooms booked
          </span>
          <span>
            <span className="dot dot-teal" />
            Occupancy %
          </span>
        </div>
        <div className="chart-tip">
          {hover !== null ? (
            <>
              <strong>{data[hover].date}</strong> · {data[hover].booked} booked · {data[hover].available} available · {data[hover].occupancyPct.toFixed(1)}%
            </>
          ) : (
            'Hover a day for details'
          )}
        </div>
      </div>
    </div>
  );
}
