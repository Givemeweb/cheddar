'use dom';

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type BarChartProps = {
  data: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
  width?: number;
  height?: number;
  dom?: import('expo/dom').DOMProps;
};

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatShort(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

export default function BarChart({ data, width = 400, height = 300 }: BarChartProps) {
  if (data.length === 0) {
    return null;
  }

  const maxValue = Math.max(...data.flatMap(d => [d.income, d.expense]));
  const yMax = Math.ceil(maxValue * 1.1) || 100;

  const customXAxisTick = ({
    x,
    y,
    payload,
  }: {
    x: number;
    y: number;
    payload: { value: string; index: number };
  }) => {
    const dataItem = data[payload.index];
    if (!dataItem) return null;

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fill="#9CA3AF"
          fontSize={12}
          fontWeight="500"
        >
          {dataItem.month}
        </text>
        <text
          x={0}
          y={16}
          textAnchor="middle"
          fill="rgba(59, 130, 246, 0.8)"
          fontSize={10}
        >
          {formatShort(dataItem.income)}
        </text>
        <text
          x={0}
          y={30}
          textAnchor="middle"
          fill="rgba(239, 68, 68, 0.8)"
          fontSize={10}
        >
          {formatShort(dataItem.expense)}
        </text>
      </g>
    );
  };

  return (
    <ResponsiveContainer width={width} height={height} style={{ touchAction: 'none', overflow: 'hidden' }}>
      <RechartsBarChart
        data={data}
        margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
        style={{ touchAction: 'none' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
        <XAxis
          dataKey="month"
          tick={customXAxisTick}
          tickLine={false}
          axisLine={{ stroke: "#374151" }}
        />
        <YAxis
          domain={[0, yMax]}
          tickFormatter={formatCurrency}
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
                      color: "rgba(59, 130, 246, 0.8)",
                      fontSize: "14px",
                      fontWeight: "bold",
                      margin: 0,
                    }}
                  >
                    Income: {formatCurrency(data.income)}
                  </p>
                  <p
                    style={{
                      color: "rgba(239, 68, 68, 0.8)",
                      fontSize: "14px",
                      fontWeight: "bold",
                      margin: 0,
                    }}
                  >
                    Expense: {formatCurrency(data.expense)}
                  </p>
                </div>
              );
            }
            return null;
          }}
        />
        <Bar
          dataKey="income"
          fill="rgba(59, 130, 246, 0.5)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expense"
          fill="rgba(239, 68, 68, 0.5)"
          radius={[4, 4, 0, 0]}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}