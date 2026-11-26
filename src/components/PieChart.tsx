'use dom';

import { useEffect } from 'react';
import { PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import {
  CALLOUT_FONT_SIZE,
  placeCalloutText,
  type PieCallout,
} from '../utils/pieCallouts';
import { signalDomReady } from '../utils/domLoadRetry';

const RADIAN = Math.PI / 180;

type PieChartProps = {
  data: {
    key: string;
    value: number;
    color: string;
  }[];
  innerRadius?: number;
  width: number;
  height: number;
  dom?: import('expo/dom').DOMProps;
  // Slices to call out (see selectPieCallouts) plus the theme colors for the
  // label text and leader lines; omit callouts to render the bare pie.
  callouts?: PieCallout[];
  labelColor?: string;
  lineColor?: string;
  // Fill for labels flipped onto their own slice (see placeCalloutText);
  // falls back to labelColor. Should stay readable over the pastel slice
  // palette in both themes.
  flippedLabelColor?: string;
};

export default function PieChart({
  data,
  innerRadius = 0,
  width,
  height,
  callouts,
  labelColor = '#000000',
  lineColor = '#000000',
  flippedLabelColor,
}: PieChartProps) {
  useEffect(() => {
    signalDomReady();
  }, []);
  const flippedInk = flippedLabelColor ?? labelColor;
  const calloutByKey = new Map(
    (callouts ?? []).map((callout) => [callout.key, callout])
  );

  // Leader line from the slice's outer edge at its mid-angle to a two-line
  // label (name / percent) with a dot where the line meets the label. Slices
  // without a callout render nothing. Pie geometry is untouched.
  const renderCallout = (props: any) => {
    const { cx, cy, midAngle, outerRadius, payload } = props;
    const callout = payload ? calloutByKey.get(payload.key) : undefined;
    if (
      !callout ||
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      typeof outerRadius !== 'number'
    ) {
      return null;
    }
    const sin = Math.sin(-midAngle * RADIAN);
    const cos = Math.cos(-midAngle * RADIAN);
    const edgeX = cx + outerRadius * cos;
    const edgeY = cy + outerRadius * sin;
    const dotX = cx + (outerRadius + 12) * cos;
    const dotY = cy + (outerRadius + 12) * sin;
    const placement = placeCalloutText({
      dotX,
      edgeX,
      onRight: cos >= 0,
      chartWidth: width,
      name: callout.name,
      percent: callout.percent,
    });
    return (
      <g>
        <line
          x1={edgeX}
          y1={edgeY}
          x2={dotX}
          y2={dotY}
          stroke={lineColor}
          strokeWidth={1}
        />
        <circle cx={dotX} cy={dotY} r={2} fill={lineColor} />
        <text
          x={placement.textX}
          y={dotY}
          fill={placement.flipped ? flippedInk : labelColor}
          fontSize={CALLOUT_FONT_SIZE}
          textAnchor={placement.anchor}
        >
          <tspan x={placement.textX} dy={-3}>
            {callout.name}
          </tspan>
          <tspan x={placement.textX} dy={12}>
            {`${callout.percent}%`}
          </tspan>
        </text>
      </g>
    );
  };

  return (
    <RechartsPieChart
      width={width}
      height={height}
      style={{ touchAction: 'none', overflow: 'hidden' }}
    >
      <Pie
        data={data}
        dataKey="value"
        nameKey="key"
        cx="50%"
        cy="50%"
        innerRadius={innerRadius}
        outerRadius="80%"
        paddingAngle={2}
        label={callouts && callouts.length > 0 ? renderCallout : undefined}
        labelLine={false}
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
    </RechartsPieChart>
  );
}
