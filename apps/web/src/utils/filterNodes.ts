import type { Node, TaskStatus } from '../types';

type StatusFilter = 'all' | TaskStatus;

const normalise = (value: string) => value.trim().toLowerCase();

export function filterNodes(
  nodes: Node[],
  searchTerm: string,
  statusFilter: StatusFilter,
  tagFilters: string[],
): Node[] {
  const term = normalise(searchTerm || '');
  const activeTags = tagFilters.map(token => normalise(token)).filter(Boolean);
  return nodes.filter(node => {
    const matchesSearch = term
      ? [node.title, node.content, ...(node.tags || [])]
          .filter(Boolean)
          .some(value => normalise(String(value)).includes(term))
      : true;
    const nodeStatus = node.type === 'task' ? (node.status ?? 'todo') : null;
    const matchesStatus =
      statusFilter === 'all' || (node.type === 'task' && nodeStatus === statusFilter);
    const nodeTags = (node.tags || []).map(tag => normalise(tag));
    const matchesTags = activeTags.length === 0 || activeTags.every(tag => nodeTags.includes(tag));
    return matchesSearch && matchesStatus && matchesTags;
  });
}
