import { describe, expect, it } from 'vitest';
import { GraphBuilder, type GraphCommit, type GraphRow } from '../../../src/git/graph/graphBuilder';

const commit = (hash: string, ...parents: string[]): GraphCommit => ({ hash, parents });

function describeRow(row: GraphRow): string {
  const lines = row.lines
    .map((line) => `${line.kind}:${line.from}>${line.to}`)
    .sort()
    .join(' ');
  return `@${row.column} w${row.width} ${lines}`;
}

describe('GraphBuilder', () => {
  it('keeps a linear history in one lane', () => {
    const rows = new GraphBuilder().add([commit('c', 'b'), commit('b', 'a'), commit('a')]);
    expect(rows.map(describeRow)).toEqual([
      '@0 w1 bottom:0>0',
      '@0 w1 bottom:0>0 top:0>0',
      '@0 w1 top:0>0',
    ]);
    expect(new Set(rows.map((row) => row.color)).size).toBe(1);
  });

  it('opens a lane for a merged branch and closes it where the branches meet', () => {
    const rows = new GraphBuilder().add([
      commit('m', 'c', 'f'),
      commit('f', 'b'),
      commit('c', 'b'),
      commit('b', 'a'),
      commit('a'),
    ]);
    expect(rows.map(describeRow)).toEqual([
      '@0 w2 bottom:0>0 bottom:0>1',
      '@1 w2 bottom:1>1 full:0>0 top:1>1',
      '@0 w2 bottom:0>0 full:1>1 top:0>0',
      '@0 w2 bottom:0>0 top:0>0 top:1>0',
      '@0 w1 top:0>0',
    ]);
  });

  it('gives each branch its own color and keeps the color along the first parent', () => {
    const rows = new GraphBuilder().add([
      commit('m', 'c', 'f'),
      commit('f', 'b'),
      commit('c', 'b'),
      commit('b'),
    ]);
    const [merge, feature, main, base] = rows;
    expect(feature!.color).not.toBe(merge!.color);
    expect(main!.color).toBe(merge!.color);
    expect(base!.color).toBe(merge!.color);
    expect(merge!.lines.find((line) => line.to === 1)?.color).toBe(feature!.color);
  });

  it('places unmerged branch tips next to each other and joins them at the fork point', () => {
    const rows = new GraphBuilder().add([commit('x', 'a'), commit('y', 'a'), commit('a')]);
    expect(rows.map(describeRow)).toEqual([
      '@0 w1 bottom:0>0',
      '@1 w2 bottom:1>1 full:0>0',
      '@0 w2 top:0>0 top:1>0',
    ]);
  });

  it('reuses free lanes for later branches', () => {
    const rows = new GraphBuilder().add([
      commit('m', 'c', 'f'),
      commit('f', 'c'),
      commit('c', 'b'),
      commit('t', 'b'),
      commit('b'),
    ]);
    expect(rows[3]!.column).toBe(1);
    expect(rows.every((row) => row.width <= 2)).toBe(true);
  });

  it('produces the same rows when commits arrive in pages', () => {
    const commits = [
      commit('m', 'c', 'f'),
      commit('f', 'e'),
      commit('c', 'b'),
      commit('e', 'b'),
      commit('b', 'a'),
      commit('a'),
    ];
    const whole = new GraphBuilder().add(commits);
    const paged = new GraphBuilder();
    expect([...paged.add(commits.slice(0, 2)), ...paged.add(commits.slice(2))]).toEqual(whole);
  });

  it('keeps lanes open for parents that are not loaded yet', () => {
    const rows = new GraphBuilder().add([commit('m', 'c', 'f'), commit('c', 'b')]);
    expect(describeRow(rows[1]!)).toBe('@0 w2 bottom:0>0 full:1>1 top:0>0');
  });
});
