import type { GraphLine, GraphRow } from '../../../src/shared/protocol';

export const LANE_WIDTH = 14;
const NODE_RADIUS = 3.5;
const PALETTE_SIZE = 8;

function x(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function linePath(line: GraphLine, height: number): string {
  const middle = height / 2;
  const x1 = x(line.from);
  const x2 = x(line.to);
  switch (line.kind) {
    case 'full':
      return `M ${x1} 0 L ${x1} ${height}`;
    case 'top':
      return x1 === x2
        ? `M ${x1} 0 L ${x2} ${middle}`
        : `M ${x1} 0 C ${x1} ${middle * 0.7} ${x2} ${middle * 0.3} ${x2} ${middle}`;
    case 'bottom':
      return x1 === x2
        ? `M ${x1} ${middle} L ${x2} ${height}`
        : `M ${x1} ${middle} C ${x1} ${middle + middle * 0.7} ${x2} ${middle + middle * 0.3} ${x2} ${height}`;
  }
}

function colorClass(color: number): string {
  return `graph-color-${color % PALETTE_SIZE}`;
}

interface GraphCellProps {
  row: GraphRow;
  height: number;
  isHead: boolean;
  isMerge: boolean;
}

export function GraphCell({ row, height, isHead, isMerge }: GraphCellProps) {
  const width = row.width * LANE_WIDTH;
  const cx = x(row.column);
  const cy = height / 2;
  return (
    <svg className="graph" width={width} height={height} aria-hidden="true">
      {row.lines.map((line, index) => (
        <path
          key={index}
          d={linePath(line, height)}
          className={`graph__line ${colorClass(line.color)}`}
        />
      ))}
      {isHead && (
        <circle
          cx={cx}
          cy={cy}
          r={NODE_RADIUS + 2.5}
          className={`graph__head ${colorClass(row.color)}`}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={NODE_RADIUS}
        className={`graph__node ${colorClass(row.color)}${isMerge ? ' graph__node--merge' : ''}`}
      />
    </svg>
  );
}
