import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useUiStore } from '../stores';
import type { InteractionMode } from '../stores';
 
import { useQueryClient } from '@tanstack/react-query';
import { deleteNode } from '../api';
import { commandStack } from '../stores/commands';

const Toolbar: React.FC = () => {
    const {
        mode,
        setMode,
        searchTerm = '',
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        tagFilters,
        setTagFilters,
    } = useUiStore();
    const queryClient = useQueryClient();
    const [tagInput, setTagInput] = useState((tagFilters || []).join(', '));

    const stackState = useSyncExternalStore(
        (listener) => commandStack.subscribe(listener),
        () => ({ canUndo: commandStack.canUndo(), canRedo: commandStack.canRedo() })
    );

    useEffect(() => {
        setTagInput((tagFilters || []).join(', '));
    }, [tagFilters]);

    const applyTagFilter = (value: string) => {
        setTagInput(value);
        const parsed = value
            .split(',')
            .map(token => token.trim().toLowerCase())
            .filter(Boolean);
        setTagFilters(parsed);
    };

    // Delete key handler to delete selected nodes
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Delete') {
                const state = useUiStore.getState();
                const ids = Array.from(state.selectedNodeIds);
                if (ids.length === 0) return;
                // optimistic remove
                const previous = queryClient.getQueryData<any>(['nodes', 1]) || [];
                const redo = () => queryClient.setQueryData(['nodes', 1], (old = []) => (old as any[]).filter(n => !ids.includes(n.id)));
                const undo = () => queryClient.setQueryData(['nodes', 1], previous);
                commandStack.execute({ redo: () => { redo(); ids.forEach(id => deleteNode(1, id).catch(()=>{})); }, undo });
                state.clearNodeSelection();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [queryClient]);

    const buttonStyle = (buttonMode: InteractionMode | 'action', disabled = false): React.CSSProperties => ({
        padding: '8px 12px',
        fontSize: '14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid #4b5563',
        background: mode === buttonMode ? '#3b82f6' : '#374151',
        color: disabled ? '#9ca3af' : 'white',
        borderRadius: '4px',
        opacity: disabled ? 0.5 : 1,
    });

    return (
        <div style={{
            position: 'absolute',
            top: '80px',
            left: '20px',
            zIndex: 10,
            display: 'flex',
            gap: '10px',
            background: '#1f2937',
            padding: '10px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            flexWrap: 'wrap',
            alignItems: 'center'
        }}>
            <button style={buttonStyle('select')} onClick={() => setMode('select')}>Select (V)</button>
            <button style={buttonStyle('panning')} onClick={() => setMode('panning')}>Pan (H)</button>
            <button style={buttonStyle('linking')} onClick={() => setMode('linking')}>Link (L)</button>
            <div style={{ borderLeft: '2px solid #4b5563', margin: '0 5px' }}></div>
            <input
                value={searchTerm}
                onChange={(e) => setSearchTerm?.(e.target.value)}
                placeholder="Search title or content"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111827', color: 'white' }}
            />
            <select
                value={statusFilter ?? 'all'}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111827', color: 'white' }}
            >
                <option value="all">All status</option>
                <option value="todo">Todo</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
            </select>
            <input
                value={tagInput}
                onChange={(e) => applyTagFilter(e.target.value)}
                placeholder="Tags (comma separated)"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111827', color: 'white', minWidth: '160px' }}
            />
            <button style={buttonStyle('action', !stackState.canUndo)} onClick={() => commandStack.undo()} >Undo</button>
            <button style={buttonStyle('action', !stackState.canRedo)} onClick={() => commandStack.redo()} >Redo</button>
        </div>
    );
};

export default Toolbar;
