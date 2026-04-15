'use dom';

import { PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

type PieChartProps = {
  data: Array<{
    key: string;
    value: number;
    color: string;
  }>;
  innerRadius?: number;
  width: number;
  height: number;
  dom?: import('expo/dom').DOMProps;
};

export default function PieChart({ data, innerRadius = 0, width, height }: PieChartProps) {
  return (
    <RechartsPieChart width={width} height={height}>
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
  );
}