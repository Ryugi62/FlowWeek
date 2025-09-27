import React from 'react';
import { useUiStore } from '../stores';
import type { InteractionMode } from '../stores';
import { useStore } from 'zustand';

// We need to get the temporal store directly to access undo/redo
const useTemporalStore = (store: any) => {
    const temporalStore = (useStore as any)(store, (state: any) => (state as any).temporal);
    return temporalStore as any;
};

const Toolbar: React.FC = () => {
    const { mode, setMode } = useUiStore();
    const temporal = useTemporalStore(useUiStore);

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
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
            <button style={buttonStyle('select')} onClick={() => setMode('select')}>Select (V)</button>
            <button style={buttonStyle('panning')} onClick={() => setMode('panning')}>Pan (H)</button>
            <button style={buttonStyle('linking')} onClick={() => setMode('linking')}>Link (L)</button>
            <div style={{ borderLeft: '2px solid #4b5563', margin: '0 5px' }}></div>
            <button style={buttonStyle('action', !temporal?.pastStates.length)} onClick={() => temporal?.undo()} >Undo</button>
            <button style={buttonStyle('action', !temporal?.futureStates.length)} onClick={() => temporal?.redo()} >Redo</button>
        </div>
    );
};

export default Toolbar;