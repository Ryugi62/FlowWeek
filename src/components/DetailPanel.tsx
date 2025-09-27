import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api';
import type { Node } from '../App';

interface DetailPanelProps {
    node: Node | null;
    boardId: number;
    onClose: () => void;
}

const updateNode = async (updatedNode: { id: number, title?: string, content?: string }) => {
    const { data } = await apiClient.patch(`/nodes/${updatedNode.id}`, updatedNode);
    return data.data;
};

const DetailPanel = ({ node, boardId, onClose }: DetailPanelProps) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const queryClient = useQueryClient();

    const mutation = useMutation({ 
        mutationFn: updateNode,
        onSuccess: (updatedNode) => {
            queryClient.setQueryData(['nodes', boardId], (old: Node[] | undefined) => 
                old ? old.map(n => n.id === updatedNode.id ? updatedNode : n) : []
            );
            onClose();
        },
        onError: (error) => {
            console.error("Failed to save node:", error);
        }
    });

    useEffect(() => {
        if (node) {
            setTitle(node.title);
            setContent(node.content || '');
        }
    }, [node]);

    if (!node) {
        return null;
    }

    const handleSave = () => {
        mutation.mutate({ id: node.id, title, content });
    };

    const panelStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        right: 0,
        width: '300px',
        height: '100%',
        backgroundColor: '#1f2937',
        borderLeft: '1px solid #4b5563',
        color: 'white',
        padding: '20px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
    };

    return (
        <div style={panelStyle}>
            <h3>Edit Note</h3>
            <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                style={{ padding: '8px', background: '#374151', border: '1px solid #4b5563', borderRadius: '4px', color: 'white' }}
            />
            <textarea 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                style={{ flexGrow: 1, padding: '8px', background: '#374151', border: '1px solid #4b5563', borderRadius: '4px', color: 'white', resize: 'none' }}
            />
            <div>
                <button onClick={handleSave} disabled={mutation.isPending} style={{ padding: '8px 12px', background: '#3b82f6', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    {mutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button onClick={onClose} style={{ marginLeft: '10px', padding: '8px 12px', background: '#4b5563', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
        </div>
    );
};

export default DetailPanel;