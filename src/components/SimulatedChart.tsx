import React, { useMemo } from 'react';
import { motion } from 'motion/react';

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
    const range = maxPrice - minPrice;
    
    const scaleY = (price: number) => padding + (1 - (price - minPrice) / range) * (chartHeight - 2 * padding);
    const scaleX = (index: number) => padding + (index / (data.length - 1)) * (width - 2 * padding);

    const pts = data.map((d, i) => ({
      x: scaleX(i),
      y: scaleY(d.close),
      open: scaleY(d.open),
      high: scaleY(d.high),
      low: scaleY(d.low),
      close: scaleY(d.close),
      isUp: d.close >= d.open
    }));

    // Calculate MA 10
    const maPts = [];
    if (indicators?.ma) {
      for (let i = 9; i < data.length; i++) {
        const slice = data.slice(i - 9, i + 1);
        const avg = slice.reduce((sum, d) => sum + d.close, 0) / 10;
        maPts.push({ x: scaleX(i), y: scaleY(avg) });
      }
    }

    // Calculate EMA 20
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

    // Calculate RSI 14
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
        
        // Smoothed moving average
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
        {/* Grid Lines */}
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

        {/* Price Axis Labels */}
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

        {/* Chart Content */}
        {type === 'AREA' && (
          <motion.path
            animate={{ d: areaPath }}
            fill="url(#areaGradient)"
            stroke="none"
            transition={{ duration: 0.2, ease: "linear" }}
          />
        )}

        {(type === 'LINE' || type === 'AREA') && (
          <motion.path
            animate={{ d: linePath }}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transition={{ duration: 0.2, ease: "linear" }}
          />
        )}

        {/* Indicators */}
        {indicators?.ma && maPath && (
          <motion.path
            d={maPath}
            animate={{ d: maPath }}
            fill="none"
            stroke="#eab308"
            strokeWidth="2"
            transition={{ duration: 0.2, ease: "linear" }}
          />
        )}
        {indicators?.ema && emaPath && (
          <motion.path
            d={emaPath}
            animate={{ d: emaPath }}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
            transition={{ duration: 0.2, ease: "linear" }}
          />
        )}

        {/* RSI Sub-chart */}
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
            <motion.path
              d={rsiPath}
              animate={{ d: rsiPath }}
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              transition={{ duration: 0.2, ease: "linear" }}
            />
          </g>
        )}

        {(type === 'CANDLE' || type === 'HOLLOW') && points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <motion.g 
              key={data[i].timeValue}
              initial={false}
              animate={{ x: 0 }}
            >
              {/* Wick */}
              <motion.line
                animate={{
                  x1: p.x,
                  y1: p.high,
                  x2: p.x,
                  y2: p.low,
                  stroke: p.isUp ? '#22c55e' : '#ef4444'
                }}
                transition={isLast ? { duration: 0.2, ease: "linear" } : { duration: 0 }}
                strokeWidth="1"
              />
              {/* Body */}
              <motion.rect
                animate={{
                  x: p.x - 3,
                  y: Math.min(p.open, p.close),
                  height: Math.max(1, Math.abs(p.open - p.close)),
                  fill: type === 'HOLLOW' && p.isUp ? 'transparent' : (p.isUp ? '#22c55e' : '#ef4444'),
                  stroke: p.isUp ? '#22c55e' : '#ef4444'
                }}
                transition={isLast ? { duration: 0.2, ease: "linear" } : { duration: 0 }}
                width="6"
                strokeWidth="1"
                rx="1"
              />
            </motion.g>
          );
        })}

        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Current Price Indicator */}
      <motion.div 
        className="absolute right-0 flex items-center gap-2 pointer-events-none"
        animate={{ top: points[points.length - 1].y - 10 }}
        transition={{ duration: 0.2, ease: "linear" }}
      >
        <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-l shadow-lg">
          ${data[data.length - 1].close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className="w-full border-t border-blue-600 border-dashed opacity-50"></div>
      </motion.div>
    </div>
  );
}
