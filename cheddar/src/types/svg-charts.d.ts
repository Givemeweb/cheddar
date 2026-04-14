declare module 'react-native-svg-charts' {
import { ComponentType } from 'react';
import { ViewProps } from 'react-native';

interface PieChartProps extends ViewProps {
data: Array<{
key: string;
value: number;
svg?: { fill: string };
}>;
innerRadius?: string | number;
padAngle?: number;
}

export const PieChart: ComponentType<PieChartProps>;
}