'use dom';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type DotChartProps = {
  data: Array<{
    month: string;
    value: number;
  }>;
  width?: number;
  height?: number;
  currencySymbol?: string;
};

function formatCurrency(value: number, symbol: string): string {
  if (Math.abs(value) >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}K`;
  }
  return `${symbol}${value.toFixed(0)}`;
}

export default function DotChart({ data, width = 400, height = 300, currencySymbol = '$' }: DotChartProps) {
  if (data.length === 0) {
    return null;
  }

  const chartData = data.map((item) => ({
    month: item.month,
    value: item.value,
  }));

  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const padding = (maxValue - minValue) || 100;
  const yMin = Math.floor(minValue - padding * 0.1);
  const yMax = Math.ceil(maxValue + padding * 0.1);

  return (
    <ResponsiveContainer width={width} height={height} style={{ touchAction: 'none', overflow: 'hidden' }}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
        style={{ touchAction: 'none' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
        <XAxis
          dataKey="month"
          stroke="#9CA3AF"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(value) => formatCurrency(value, currencySymbol)}
          stroke="#9CA3AF"
          fontSize={12}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div
                  style={{
                    backgroundColor: "#26282D",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    padding: "8px 12px",
                  }}
                >
                  <p style={{ color: "#9CA3AF", fontSize: "12px", margin: 0 }}>
                    {data.month}
                  </p>
                  <p
                    style={{
                      color: "#FFB800",
                      fontSize: "14px",
                      fontWeight: "bold",
                      margin: 0,
                    }}
                  >
                    {formatCurrency(data.value, currencySymbol)}
                  </p>
                </div>
              );
            }
            return null;
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#FFB800"
          strokeWidth={2}
          dot={{ r: 6, fill: "#FFB800", stroke: "#FFB800", strokeWidth: 2 }}
          activeDot={{
            r: 8,
            fill: "#FFB800",
            stroke: "#FFB800",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}