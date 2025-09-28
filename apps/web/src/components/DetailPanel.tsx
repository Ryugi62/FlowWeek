import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Node, TaskStatus } from '../types';
import { updateNode as updateNodeApi, ConflictError, type NodeWritePayload } from '../api';
import { commandStack } from '../stores/commands';

interface DetailPanelProps {
  node: Node | null;
  boardId: number;
  onClose: () => void;
}

const TASK_STATUS_OPTIONS: TaskStatus[] = ['todo', 'in-progress', 'done'];

const toDatetimeLocalValue = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromDatetimeLocalValue = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseTags = (value: string) =>
  value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);

const stringifyTags = (tags: string[]) => (tags.length ? tags.join(', ') : '');

const DetailPanel = ({ node, boardId, onClose }: DetailPanelProps) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Node['type']>('note');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [tagsInput, setTagsInput] = useState('');
  const [journaledAtInput, setJournaledAtInput] = useState('');

  useEffect(() => {
    if (!node) return;
    setTitle(node.title || '');
    setContent(node.content || '');
    setType(node.type);
    setStatus(node.status ?? 'todo');
    setTagsInput(stringifyTags(node.tags || []));
    setJournaledAtInput(toDatetimeLocalValue(node.journaled_at));
  }, [node]);

  const isTask = type === 'task';
  const isJournal = type === 'journal';

  const resolveConflict = async (error: unknown, nodeId: number, desired: NodeWritePayload) => {
    if (!(error instanceof ConflictError)) {
      queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
      return;
    }

    const latest = error.latest;
    queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
      (old || []).map(n => (n.id === latest.id ? latest : n)),
    );

    try {
      const result = await updateNodeApi(boardId, nodeId, desired, { version: latest.updated_at });
      const updated = (result?.data as Node | undefined) ?? latest;
      queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
        (old || []).map(n => (n.id === updated.id ? updated : n)),
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        const newer = err.latest;
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
          (old || []).map(n => (n.id === newer.id ? newer : n)),
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
      }
    }
  };

  const disableSave = useMemo(() => {
    if (!node) return true;
    const initialTags = stringifyTags(node.tags || []);
    const initialJournal = toDatetimeLocalValue(node.journaled_at);
    const initialStatus = node.status ?? 'todo';
    const tagsEqual = initialTags === tagsInput.trim();
    const journalEqual =
      (type === 'journal' ? journaledAtInput : '') ===
      (node.type === 'journal' ? initialJournal : '');
    const statusEqual =
      (type === 'task' ? status : null) ===
      (node.type === 'task' ? initialStatus : null);
    return (
      node.title === title &&
      (node.content || '') === content &&
      node.type === type &&
      statusEqual &&
      tagsEqual &&
      journalEqual
    );
  }, [node, title, content, type, status, tagsInput, journaledAtInput]);

  if (!node) return null;

  const handleSave = () => {
    const tags = parseTags(tagsInput);
    const nextStatus: TaskStatus | null = isTask ? status : null;
    const nextJournaledAt = isJournal ? fromDatetimeLocalValue(journaledAtInput) : null;

    const currentNodes = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
    const latest = currentNodes.find(n => n.id === node.id) || node;
    const previous = { ...latest };
    const version = latest.updated_at;
    const nextNode: Node = {
      ...latest,
      type,
      title,
      content,
      status: nextStatus,
      tags,
      journaled_at: nextJournaledAt,
    };

    const payload: NodeWritePayload = {
      type: nextNode.type,
      title: nextNode.title,
      content: nextNode.content,
      status: nextNode.status,
      tags: nextNode.tags,
      journaled_at: nextNode.journaled_at,
    };
    const revertPayload: NodeWritePayload = {
      type: previous.type,
      title: previous.title,
      content: previous.content,
      status: previous.status,
      tags: previous.tags,
      journaled_at: previous.journaled_at,
    };

    commandStack.execute({
      redo: () => {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
          (old || []).map(n => (n.id === nextNode.id ? nextNode : n)),
        );
        const latestVersion = (queryClient.getQueryData<Node[]>(['nodes', boardId]) || []).find(n => n.id === nextNode.id)?.updated_at || version;
        updateNodeApi(boardId, nextNode.id, payload, { version: latestVersion }).catch(error => {
          void resolveConflict(error, nextNode.id, payload);
        });
      },
      undo: () => {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
          (old || []).map(n => (n.id === previous.id ? previous : n)),
        );
        const currentVersion = (queryClient.getQueryData<Node[]>(['nodes', boardId]) || []).find(n => n.id === previous.id)?.updated_at || version;
        updateNodeApi(boardId, previous.id, revertPayload, { version: currentVersion }).catch(error => {
          void resolveConflict(error, previous.id, revertPayload);
        });
      },
    });

    onClose();
  };

  return (
    <aside className="detail-panel">
      <header className="detail-panel__header">
        <h3 className="detail-panel__title">노드 편집</h3>
        <button
          className="detail-panel__close"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          ✕
        </button>
      </header>

      <section className="detail-panel__body">
        <label className="detail-panel__field">
          <span>Title</span>
          <input value={title} onChange={event => setTitle(event.target.value)} />
        </label>

        <label className="detail-panel__field">
          <span>Content</span>
          <textarea value={content} onChange={event => setContent(event.target.value)} rows={5} />
        </label>

        <label className="detail-panel__field">
          <span>Type</span>
          <select value={type} onChange={event => setType(event.target.value as Node['type'])}>
            <option value="note">Note</option>
            <option value="task">Task</option>
            <option value="journal">Journal</option>
          </select>
        </label>

        {isTask && (
          <label className="detail-panel__field">
            <span>Status</span>
            <select value={status} onChange={event => setStatus(event.target.value as TaskStatus)}>
              {TASK_STATUS_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        {isJournal && (
          <label className="detail-panel__field">
            <span>Journaled at</span>
            <input
              type="datetime-local"
              value={journaledAtInput}
              onChange={event => setJournaledAtInput(event.target.value)}
            />
          </label>
        )}

        <label className="detail-panel__field">
          <span>Tags (comma separated)</span>
          <input
            value={tagsInput}
            onChange={event => setTagsInput(event.target.value)}
            placeholder="design, research"
          />
        </label>
      </section>

      <footer className="detail-panel__footer">
        <button className="detail-panel__button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="detail-panel__button detail-panel__button--primary"
          onClick={handleSave}
          disabled={disableSave}
        >
          Save
        </button>
      </footer>
    </aside>
  );
};

export default DetailPanel;
