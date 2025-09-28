import { describe, it, expect } from '@jest/globals';
import type { Node } from '../types';
import { filterNodes } from './filterNodes';

type PartialNode = Partial<Node> & { id: number };

const baseNode = (overrides: PartialNode): Node => {
  const { id, ...rest } = overrides;
  return {
    id,
    board_id: 1,
    flow_id: 1,
    type: 'note',
    status: null,
    tags: [],
    journaled_at: null,
    x: 0,
    y: 0,
    width: 160,
    height: 120,
    title: 'Untitled',
    content: '',
    updated_at: new Date().toISOString(),
    ...rest,
  };
};

describe('filterNodes', () => {
  const nodes: Node[] = [
    baseNode({ id: 1, title: 'Design kickoff', type: 'task', status: 'todo', tags: ['design'], content: 'Prepare slides' }),
    baseNode({ id: 2, title: 'API contract', type: 'note', tags: ['backend'], content: 'Define endpoints' }),
    baseNode({ id: 3, title: 'Retro journal', type: 'journal', journaled_at: new Date().toISOString(), tags: ['retro'], content: 'Notable wins' }),
    baseNode({ id: 4, title: 'QA checklist', type: 'task', status: 'done', tags: ['qa', 'testing'], content: 'Regression cases' }),
  ];

  it('filters by search term across title, content, and tags', () => {
    const result = filterNodes(nodes, 'retro', 'all', []);
    expect(result.map(n => n.id)).toEqual([3]);

    const tagResult = filterNodes(nodes, 'testing', 'all', []);
    expect(tagResult.map(n => n.id)).toEqual([4]);
  });

  it('filters by status value', () => {
    const todos = filterNodes(nodes, '', 'todo', []);
    expect(todos.map(n => n.id)).toEqual([1]);

    const done = filterNodes(nodes, '', 'done', []);
    expect(done.map(n => n.id)).toEqual([4]);
  });

  it('applies tag filters case-insensitively', () => {
    const filtered = filterNodes(nodes, '', 'all', ['Design']);
    expect(filtered.map(n => n.id)).toEqual([1]);
  });

  it('requires all tag filters to match when multiple provided', () => {
    const filtered = filterNodes(nodes, '', 'all', ['qa', 'testing']);
    expect(filtered.map(n => n.id)).toEqual([4]);
  });

  it('combines search term, status, and tags', () => {
    const filtered = filterNodes(nodes, 'check', 'done', ['qa']);
    expect(filtered.map(n => n.id)).toEqual([4]);
  });
});
