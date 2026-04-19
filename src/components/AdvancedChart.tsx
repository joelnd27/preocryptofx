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

export type ChartType = 'LINE' | 'CANDLE' | 'HOLLOW' | 'AREA';
export type Timeframe = '1S' | '1M' | '15M' | '1H' | '4H' | '1D' | '1W';

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
  };
}

export default function AdvancedChart({ data, type, timeframe, isDarkMode, symbol, indicators }: AdvancedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<any> | null>(null);

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
        height: 400,
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
      });

      chartRef.current = chart;

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
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

      // Handle Indicators (simplified update for performance)
      if (indicators?.ma && isCandle) {
        if (!maSeriesRef.current) {
          maSeriesRef.current = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1 });
        }
        const maData = data.map((d, i, arr) => {
          if (i < 10) return null;
          const sum = arr.slice(i - 10, i).reduce((acc, val) => acc + val.close, 0);
          return { time: d.timeValue as any, value: sum / 10 };
        }).filter(d => d !== null);
        maSeriesRef.current.setData(maData as any);
      } else if (maSeriesRef.current) {
        try {
          chart.removeSeries(maSeriesRef.current);
        } catch (e) {}
        maSeriesRef.current = null;
      }

      if (indicators?.ema && isCandle) {
        if (!emaSeriesRef.current) {
          emaSeriesRef.current = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1 });
        }
        const emaData = data.map((d, i, arr) => {
          if (i < 20) return null;
          const sum = arr.slice(i - 20, i).reduce((acc, val) => acc + val.close, 0);
          return { time: d.timeValue as any, value: sum / 20 };
        }).filter(d => d !== null);
        emaSeriesRef.current.setData(emaData as any);
      } else if (emaSeriesRef.current) {
        try {
          chart.removeSeries(emaSeriesRef.current);
        } catch (e) {}
        emaSeriesRef.current = null;
      }

    } catch (error) {
      console.error('Chart data update failed:', error);
    }

  }, [data, type, indicators, isDarkMode]);

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      {(!data || data.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
          <p className="text-slate-500 text-sm">Loading chart data...</p>
        </div>
      )}
    </div>
  );
}
