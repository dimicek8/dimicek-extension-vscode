export interface GraphLine {
  kind: 'top' | 'bottom' | 'full';
  from: number;
  to: number;
  color: number;
}

export interface GraphRow {
  column: number;
  color: number;
  lines: GraphLine[];
  width: number;
}

export interface GraphCommit {
  hash: string;
  parents: readonly string[];
}

export class GraphBuilder {
  private lanes: (string | undefined)[] = [];
  private colors: number[] = [];
  private nextColor = 0;

  add(commits: readonly GraphCommit[]): GraphRow[] {
    return commits.map((commit) => this.addCommit(commit));
  }

  private allocate(hash: string, after = -1): number {
    let index = this.lanes.findIndex((lane, position) => lane === undefined && position > after);
    if (index === -1) {
      index = Math.max(this.lanes.length, after + 1);
    }
    this.lanes[index] = hash;
    this.colors[index] = this.nextColor++;
    return index;
  }

  private addCommit(commit: GraphCommit): GraphRow {
    const lanesBefore = [...this.lanes];
    const colorsBefore = [...this.colors];
    const lines: GraphLine[] = [];

    let column = lanesBefore.indexOf(commit.hash);
    if (column === -1) {
      column = this.allocate(commit.hash);
    }
    const color = this.colors[column]!;

    lanesBefore.forEach((hash, lane) => {
      if (hash === undefined) {
        return;
      }
      if (hash === commit.hash) {
        lines.push({ kind: 'top', from: lane, to: column, color: colorsBefore[lane]! });
        this.lanes[lane] = undefined;
      } else {
        lines.push({ kind: 'full', from: lane, to: lane, color: colorsBefore[lane]! });
      }
    });

    const [firstParent, ...otherParents] = commit.parents;
    if (firstParent === undefined) {
      this.lanes[column] = undefined;
    } else {
      this.lanes[column] = firstParent;
      this.colors[column] = color;
      lines.push({ kind: 'bottom', from: column, to: column, color });
    }
    for (const parent of otherParents) {
      let lane = this.lanes.indexOf(parent);
      if (lane === -1) {
        lane = this.allocate(parent, column);
      }
      lines.push({ kind: 'bottom', from: column, to: lane, color: this.colors[lane]! });
    }

    while (this.lanes.length > 0 && this.lanes[this.lanes.length - 1] === undefined) {
      this.lanes.pop();
      this.colors.pop();
    }

    const width = Math.max(column, ...lines.flatMap((line) => [line.from, line.to])) + 1;
    return { column, color, lines, width };
  }
}

export function linearRows(count: number): GraphRow[] {
  return Array.from({ length: count }, () => ({ column: 0, color: 0, lines: [], width: 1 }));
}
