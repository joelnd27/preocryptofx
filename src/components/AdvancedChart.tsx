import React, { useEffect, useRef } from 'react';
import { 
  createChart, 
  ColorType, 
  IChartApi, 
  ISeriesApi,
  CandlestickSeries,
  AreaSeries,
  LineSeries
} from 'lightweight-charts';
import { ChartType, Timeframe } from '../types';

interface AdvancedChartProps {
  data: any[];
  type: ChartType;
  timeframe: Timeframe;
  isDarkMode: boolean;
  symbol: string;
  indicators?: {
    rsi: boolean;
    ma: boolean;
    ema: boolean;
    fibonacci: boolean;
  };
}

export default function AdvancedChart({ data, type, timeframe, isDarkMode, symbol, indicators }: AdvancedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const fibLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: isDarkMode ? '#020617' : '#ffffff' },
          textColor: isDarkMode ? '#94a3b8' : '#64748b',
        },
        grid: {
          vertLines: { color: isDarkMode ? '#1e293b' : '#f1f5f9' },
          horzLines: { color: isDarkMode ? '#1e293b' : '#f1f5f9' },
        },
        width: chartContainerRef.current.clientWidth || 800,
        height: chartContainerRef.current.clientHeight || 480,
        timeScale: {
          timeVisible: true,
          secondsVisible: timeframe === '1S' || timeframe === '1M',
          rightOffset: 12, // Give some space at the right edge
          barSpacing: 10, // Maintain a decent size for bars/candles
          minBarSpacing: 1,
          shiftVisibleRangeOnNewBar: true, // This makes old bars "vanish" to the left
          tickMarkFormatter: (time: number) => {
            const date = new Date(time * 1000);
            return date.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            });
          },
        },
        localization: {
          timeFormatter: (time: number) => {
            const date = new Date(time * 1000);
            return date.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit', 
              second: (timeframe === '1S' || timeframe === '1M') ? '2-digit' : undefined,
              hour12: false
            });
          },
        },
        leftPriceScale: {
          visible: false, // Hidden by default on mobile unless needed
          borderVisible: false,
        },
        rightPriceScale: {
          visible: true,
          borderVisible: false,
        },
      });

      // Responsive price scale adjustments
      if (chartContainerRef.current.clientWidth > 640) {
        chart.applyOptions({
          leftPriceScale: { visible: indicators?.rsi === true }
        });
      }

      chartRef.current = chart;

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
        maSeriesRef.current = null;
        emaSeriesRef.current = null;
        rsiSeriesRef.current = null;
        fibLinesRef.current = [];
      };
    } catch (error) {
      console.error('Chart initialization failed:', error);
    }
  }, [isDarkMode, timeframe]);

  const lastDataRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return;
    const chart = chartRef.current;

    try {
      const isCandle = type === 'CANDLE' || type === 'HOLLOW';
      
      // Data is "new" if coin changed, length changed, or the timestamps/prices at start/end changed
      const isNewData = !lastDataRef.current.length || 
                       symbol !== (lastDataRef.current as any).symbol ||
                       data.length !== lastDataRef.current.length || 
                       (data.length > 0 && lastDataRef.current.length > 0 && (
                         data[0].timeValue !== lastDataRef.current[0].timeValue ||
                         data[0].close !== lastDataRef.current[0].close
                       ));
      
      // Create or update main series
      if (!seriesRef.current || seriesRef.current.seriesType() !== (isCandle ? 'Candlestick' : (type === 'AREA' ? 'Area' : 'Line')) || isNewData) {
        if (seriesRef.current && (seriesRef.current.seriesType() !== (isCandle ? 'Candlestick' : (type === 'AREA' ? 'Area' : 'Line')))) {
          try {
            chart.removeSeries(seriesRef.current);
            seriesRef.current = null;
          } catch (e) {
            console.warn('Failed to remove old series:', e);
          }
        }
        
        if (!seriesRef.current) {
          if (isCandle) {
            seriesRef.current = chart.addSeries(CandlestickSeries, {
              upColor: '#22c55e',
              downColor: '#ef4444',
              borderVisible: true,
              wickUpColor: '#22c55e',
              wickDownColor: '#ef4444',
              ...(type === 'HOLLOW' ? { 
                fillUpColor: 'transparent',
                fillDownColor: 'transparent',
              } : {}),
            });
          } else if (type === 'AREA') {
            seriesRef.current = chart.addSeries(AreaSeries, {
              lineColor: '#3b82f6',
              topColor: 'rgba(59, 130, 246, 0.4)',
              bottomColor: 'rgba(59, 130, 246, 0)',
            });
          } else {
            seriesRef.current = chart.addSeries(LineSeries, {
              color: '#3b82f6',
              lineWidth: 2,
            });
          }
        }
        
        // Initial data set
        if (isCandle) {
          seriesRef.current.setData(data.map(d => ({
            time: d.timeValue,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          })));
        } else {
          seriesRef.current.setData(data.map(d => ({
            time: d.timeValue,
            value: d.close,
          })));
        }
        
        // Only fit content when the coin changes (Initial Load)
        // This prevents candles from getting smaller as more data is added
        const isNewCoin = !lastDataRef.current.length || symbol !== (lastDataRef.current as any).symbol;
        if (isNewCoin) {
          chart.timeScale().fitContent();
        }
      } else {
        // Real-time update
        const lastPoint = data[data.length - 1];
        if (isCandle) {
          seriesRef.current.update({
            time: lastPoint.timeValue,
            open: lastPoint.open,
            high: lastPoint.high,
            low: lastPoint.low,
            close: lastPoint.close,
          });
        } else {
          seriesRef.current.update({
            time: lastPoint.timeValue,
            value: lastPoint.close,
          });
        }
      }

      lastDataRef.current = data;
      (lastDataRef.current as any).symbol = symbol;

      // Handle Indicators
      // 1. Moving Averages (MA/EMA) - Now visible on all chart types
      if (indicators?.ma) {
        if (!maSeriesRef.current) {
          maSeriesRef.current = chart.addSeries(LineSeries, { 
            color: '#f59e0b', 
            lineWidth: 1,
            priceLineVisible: false,
          });
        }
        const maData = data.map((d, i, arr) => {
          const period = 10;
          if (i < period) return null;
          const sum = arr.slice(i - period, i).reduce((acc, val) => acc + val.close, 0);
          return { time: d.timeValue as any, value: sum / period };
        }).filter(d => d !== null);
        maSeriesRef.current.setData(maData as any);
      } else if (maSeriesRef.current) {
        try { chart.removeSeries(maSeriesRef.current); } catch (e) {}
        maSeriesRef.current = null;
      }

      if (indicators?.ema) {
        if (!emaSeriesRef.current) {
          emaSeriesRef.current = chart.addSeries(LineSeries, { 
            color: '#9333ea', 
            lineWidth: 1,
            priceLineVisible: false,
          });
        }
        const emaData = data.map((d, i, arr) => {
          const period = 20;
          if (i < period) return null;
          const sum = arr.slice(i - period, i).reduce((acc, val) => acc + val.close, 0);
          return { time: d.timeValue as any, value: sum / period };
        }).filter(d => d !== null);
        emaSeriesRef.current.setData(emaData as any);
      } else if (emaSeriesRef.current) {
        try { chart.removeSeries(emaSeriesRef.current); } catch (e) {}
        emaSeriesRef.current = null;
      }

      // 2. RSI (Relative Strength Index) - Separate pane (overlay with own scale)
      if (indicators?.rsi) {
        if (!rsiSeriesRef.current) {
          rsiSeriesRef.current = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 1,
            priceScaleId: 'left',
            priceLineVisible: false,
          });
          rsiSeriesRef.current.priceScale().applyOptions({
            scaleMargins: {
              top: 0.8, // RSI at the bottom
              bottom: 0.05,
            },
          });
        }
        
        // Calculate RSI (14 period)
        const calculateRSI = (prices: number[]) => {
          if (prices.length < 15) return 50;
          let gains = 0;
          let losses = 0;
          for (let i = 1; i < 15; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
          }
          const avgGain = gains / 14;
          const avgLoss = losses / 14;
          if (avgLoss === 0) return 100;
          const rs = avgGain / avgLoss;
          return 100 - (100 / (1 + rs));
        };

        const rsiData = data.map((d, i, arr) => {
          if (i < 14) return null;
          const slice = arr.slice(i - 14, i + 1).map(x => x.close);
          return { time: d.timeValue as any, value: calculateRSI(slice) };
        }).filter(d => d !== null);
        rsiSeriesRef.current.setData(rsiData as any);
      } else if (rsiSeriesRef.current) {
        try { chart.removeSeries(rsiSeriesRef.current); } catch (e) {}
        rsiSeriesRef.current = null;
      }

      // 3. Fibonacci Retracement
      // Clear existing Fibonacci lines
      if (seriesRef.current) {
        fibLinesRef.current.forEach(line => {
          try { seriesRef.current?.removePriceLine(line); } catch (e) {}
        });
        fibLinesRef.current = [];

        if (indicators?.fibonacci && data.length > 20) {
          const highs = data.map(d => d.high || d.close);
          const lows = data.map(d => d.low || d.close);
          const max = Math.max(...highs);
          const min = Math.min(...lows);
          const range = max - min;

          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#4f46e5'];

          levels.forEach((lvl, idx) => {
            const price = max - (range * lvl);
            const line = seriesRef.current?.createPriceLine({
              price: price,
              color: colors[idx],
              lineWidth: 1,
              lineStyle: idx === 0 || idx === 6 ? 0 : 2, // Solid for boundary, dashed for mid
              axisLabelVisible: true,
              title: `FIB ${lvl}`,
            });
            if (line) fibLinesRef.current.push(line);
          });
        }
      }

    } catch (error) {
      console.error('Chart data update failed:', error);
    }

  }, [data, type, indicators, isDarkMode]);

  return (
    <div className="w-full h-full min-h-[300px] relative font-sans">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* Indicator Legend Overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none z-10">
        {indicators?.rsi && (
          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-100 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">RSI (14)</span>
          </div>
        )}
        {indicators?.ma && (
          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-100 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">MA (10)</span>
          </div>
        )}
        {indicators?.ema && (
          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-100 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">EMA (20)</span>
          </div>
        )}
        {indicators?.fibonacci && (
          <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-100 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">Fibonacci Levels</span>
          </div>
        )}
      </div>

      {(!data || data.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
          <p className="text-slate-500 text-sm">Loading chart data...</p>
        </div>
      )}
    </div>
  );
}
