import React, { useMemo } from 'react';

interface SimulatedChartProps {
  data: any[];
  type: 'LINE' | 'CANDLE' | 'HOLLOW' | 'AREA';
  isDarkMode: boolean;
  indicators?: {
    rsi: boolean;
    ma: boolean;
    ema: boolean;
  };
}

export default function SimulatedChart({ data, type, isDarkMode, indicators }: SimulatedChartProps) {
  const width = 800;
  const height = 400;
  const padding = 40;
  const rsiHeight = 60;
  const chartHeight = indicators?.rsi ? height - rsiHeight - padding : height;

  const { min, max, points, maPoints, emaPoints, rsiPoints } = useMemo(() => {
    if (!data || data.length === 0) return { min: 0, max: 0, points: [], maPoints: [], emaPoints: [], rsiPoints: [] };

    const prices = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    
    const minPrice = Math.min(...lows);
    const maxPrice = Math.max(...highs);
    const range = maxPrice - minPrice || 1;
    
    const scaleY = (price: number) => padding + (1 - (price - minPrice) / range) * (chartHeight - 2 * padding);
    const scaleX = (index: number) => padding + (index / (data.length - 1 || 1)) * (width - 2 * padding);

    const pts = data.map((d, i) => ({
      x: scaleX(i),
      y: scaleY(d.close),
      open: scaleY(d.open),
      high: scaleY(d.high),
      low: scaleY(d.low),
      close: scaleY(d.close),
      isUp: d.close >= d.open
    }));

    const maPts = [];
    if (indicators?.ma) {
      for (let i = 9; i < data.length; i++) {
        const slice = data.slice(i - 9, i + 1);
        const avg = slice.reduce((sum, d) => sum + d.close, 0) / 10;
        maPts.push({ x: scaleX(i), y: scaleY(avg) });
      }
    }

    const emaPts = [];
    if (indicators?.ema) {
      let ema = data[0].close;
      const k = 2 / (20 + 1);
      for (let i = 0; i < data.length; i++) {
        ema = data[i].close * k + ema * (1 - k);
        if (i >= 19) {
          emaPts.push({ x: scaleX(i), y: scaleY(ema) });
        }
      }
    }

    const rsiPts = [];
    if (indicators?.rsi && data.length > 14) {
      let gains = [];
      let losses = [];
      
      for (let i = 1; i < data.length; i++) {
        const diff = data[i].close - data[i-1].close;
        gains.push(Math.max(0, diff));
        losses.push(Math.max(0, -diff));
      }

      let avgGain = gains.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
      let avgLoss = losses.slice(0, 14).reduce((a, b) => a + b, 0) / 14;

      for (let i = 14; i < data.length; i++) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        const rsiY = height - padding - (rsi / 100) * (rsiHeight - 10);
        rsiPts.push({ x: scaleX(i), y: rsiY });
        
        avgGain = (avgGain * 13 + gains[i-1]) / 14;
        avgLoss = (avgLoss * 13 + losses[i-1]) / 14;
      }
    }

    return { min: minPrice, max: maxPrice, points: pts, maPoints: maPts, emaPoints: emaPts, rsiPoints: rsiPts };
  }, [data, chartHeight, width, indicators]);

  if (points.length === 0) return null;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;
  
  const maPath = maPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const emaPath = emaPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const rsiPath = rsiPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="w-full h-full relative bg-slate-50 dark:bg-slate-950 rounded-xl overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1={padding}
            y1={padding + p * (chartHeight - 2 * padding)}
            x2={width - padding}
            y2={padding + p * (chartHeight - 2 * padding)}
            stroke={isDarkMode ? '#1e293b' : '#e2e8f0'}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <text
            key={i}
            x={width - padding + 5}
            y={padding + p * (chartHeight - 2 * padding)}
            fill={isDarkMode ? '#64748b' : '#94a3b8'}
            fontSize="10"
            alignmentBaseline="middle"
          >
            ${(max - p * (max - min)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </text>
        ))}

        {type === 'AREA' && (
          <path
            d={areaPath}
            fill="url(#areaGradient)"
            stroke="none"
          />
        )}

        {(type === 'LINE' || type === 'AREA') && (
          <path
            d={linePath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {indicators?.ma && maPath && (
          <path
            d={maPath}
            fill="none"
            stroke="#eab308"
            strokeWidth="2"
          />
        )}
        {indicators?.ema && emaPath && (
          <path
            d={emaPath}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
          />
        )}

        {indicators?.rsi && rsiPath && (
          <g>
            <line
              x1={padding}
              y1={height - padding - rsiHeight / 2}
              x2={width - padding}
              y2={height - padding - rsiHeight / 2}
              stroke={isDarkMode ? '#1e293b' : '#e2e8f0'}
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text x={padding - 30} y={height - padding - rsiHeight + 10} fill="#64748b" fontSize="8">70</text>
            <text x={padding - 30} y={height - padding - 10} fill="#64748b" fontSize="8">30</text>
            <path
              d={rsiPath}
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
            />
          </g>
        )}

        {(type === 'CANDLE' || type === 'HOLLOW') && points.map((p, i) => {
          return (
            <g key={i}>
              <line
                x1={p.x}
                y1={p.high}
                x2={p.x}
                y2={p.low}
                stroke={p.isUp ? '#10b981' : '#ef4444'}
                strokeWidth="1"
              />
              <rect
                x={p.x - 3}
                y={Math.min(p.open, p.close)}
                width="6"
                height={Math.max(2, Math.abs(p.close - p.open))}
                fill={p.isUp ? (type === 'HOLLOW' ? 'transparent' : '#10b981') : '#ef4444'}
                stroke={p.isUp ? '#10b981' : '#ef4444'}
                strokeWidth="1"
                rx="1"
              />
            </g>
          );
        })}

        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute right-0 flex items-center gap-2 pointer-events-none">
        <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-l shadow-lg">
          ${data[data.length - 1].close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className="w-full border-t border-blue-600 border-dashed opacity-50"></div>
      </div>
    </div>
  );
}
