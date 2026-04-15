'use dom';

import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

type PieChartProps = {
  data: Array<{
    key: string;
    value: number;
    color: string;
  }>;
  innerRadius?: number;
  dom?: import('expo/dom').DOMProps;
};

export default function PieChart({ data, innerRadius = 0 }: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}