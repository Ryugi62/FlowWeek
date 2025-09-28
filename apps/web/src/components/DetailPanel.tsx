import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Node, TaskStatus } from '../types';
import { updateNode as updateNodeApi } from '../api';
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

    const payload = {
      type: nextNode.type,
      title: nextNode.title,
      content: nextNode.content,
      status: nextNode.status,
      tags: nextNode.tags,
      journaled_at: nextNode.journaled_at,
    };
    const revertPayload = {
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
        updateNodeApi(boardId, nextNode.id, payload, { version }).catch(() => {
          queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
        });
      },
      undo: () => {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
          (old || []).map(n => (n.id === previous.id ? previous : n)),
        );
        updateNodeApi(boardId, previous.id, revertPayload).catch(() => {
          queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
        });
      },
    });

    onClose();
  };

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '320px',
        height: '100%',
        backgroundColor: '#111827',
        borderLeft: '1px solid #1f2937',
        color: '#e5e7eb',
        padding: '20px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>노드 편집</h3>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </header>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>타입</span>
        <select
          value={type}
          onChange={e => {
            const value = e.target.value as Node['type'];
            const wasTask = type === 'task';
            setType(value);
            if (value === 'task' && !wasTask) {
              setStatus('todo');
            }
            if (value !== 'task' && wasTask) {
              setStatus('todo');
            }
            if (value === 'journal' && !journaledAtInput) {
              setJournaledAtInput(toDatetimeLocalValue(new Date().toISOString()));
            }
            if (value !== 'journal') {
              setJournaledAtInput('');
            }
          }}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #374151',
            background: '#1f2937',
            color: '#e5e7eb',
          }}
        >
          <option value="task">Task</option>
          <option value="note">Note</option>
          <option value="journal">Journal</option>
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>제목</span>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #374151',
            background: '#1f2937',
            color: '#e5e7eb',
          }}
        />
      </label>

      {isTask && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span>상태</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as TaskStatus)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #374151',
              background: '#1f2937',
              color: '#e5e7eb',
            }}
          >
            {TASK_STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )}

      {isJournal && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span>기록 시각</span>
          <input
            type="datetime-local"
            value={journaledAtInput}
            onChange={e => setJournaledAtInput(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #374151',
              background: '#1f2937',
              color: '#e5e7eb',
            }}
          />
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>{isJournal ? '본문' : '내용'}</span>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={6}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #374151',
            background: '#1f2937',
            color: '#e5e7eb',
            resize: 'vertical',
            minHeight: '120px',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>태그 (쉼표 구분)</span>
        <input
          type="text"
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="e.g. design, research"
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #374151',
            background: '#1f2937',
            color: '#e5e7eb',
          }}
        />
      </label>

      <footer style={{ marginTop: 'auto', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #4b5563',
            background: 'transparent',
            color: '#9ca3af',
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={disableSave}
          style={{
            padding: '8px 14px',
            borderRadius: '4px',
            border: 'none',
            background: disableSave ? '#374151' : '#3b82f6',
            color: disableSave ? '#9ca3af' : '#f9fafb',
            cursor: disableSave ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s ease',
          }}
        >
          저장
        </button>
      </footer>
    </aside>
  );
};

export default DetailPanel;
