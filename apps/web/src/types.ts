export interface Flow {
  id: number;
  board_id: number;
  name: string;
  color: string;
  y_lane: number;
}

export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Node {
  id: number;
  board_id: number;
  flow_id: number | null;
  type: 'task' | 'note' | 'journal';
  status: TaskStatus | null;
  tags: string[];
  journaled_at: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  content?: string;
  updated_at: string;
}

export interface Edge {
  id: number;
  board_id: number;
  source_node_id: number;
  target_node_id: number;
}
