import React, { useEffect, useState } from 'react';

interface Metric {
    id: string;
    model: string;
    latency: number;
    tokens: number;
    timestamp: string;
}

const PerformanceMonitor: React.FC = () => {
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (event: CustomEvent) => {
            const newMetric = {
                id: Math.random().toString(36).substring(7),
                ...event.detail
            };
            setMetrics(prev => [newMetric, ...prev].slice(0, 50)); // Keep last 50
        };

        window.addEventListener('gemini-usage' as any, handler as any);
        return () => {
            window.removeEventListener('gemini-usage' as any, handler as any);
        };
    }, []);

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                style={{
                    position: 'fixed',
                    bottom: '10px',
                    left: '10px',
                    zIndex: 9999,
                    padding: '8px',
                    background: '#333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    opacity: 0.7
                }}
            >
                Start Monitor
            </button>
        );
    }

    const totalTokens = metrics.reduce((acc, m) => acc + (m.tokens || 0), 0);
    const avgLatency = metrics.length > 0
        ? Math.round(metrics.reduce((acc, m) => acc + m.latency, 0) / metrics.length)
        : 0;

    return (
        <div style={{
            position: 'fixed',
            bottom: '10px',
            left: '10px',
            width: '300px',
            height: '200px',
            background: 'rgba(0, 0, 0, 0.85)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '11px',
            zIndex: 9999,
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #444'
        }}>
            <div style={{
                padding: '8px',
                borderBottom: '1px solid #444',
                display: 'flex',
                justifyContent: 'space-between',
                background: '#222',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px'
            }}>
                <span>API MONITOR</span>
                <button
                    onClick={() => setIsVisible(false)}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
                >
                    _
                </button>
            </div>

            <div style={{ padding: '8px', borderBottom: '1px solid #444', display: 'flex', gap: '15px' }}>
                <div>
                    <div style={{ color: '#888' }}>CALLS</div>
                    <div>{metrics.length}</div>
                </div>
                <div>
                    <div style={{ color: '#888' }}>TOKENS</div>
                    <div>{totalTokens}</div>
                </div>
                <div>
                    <div style={{ color: '#888' }}>AVG LATENCY</div>
                    <div>{avgLatency}ms</div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
                {metrics.map(m => (
                    <div key={m.id} style={{ marginBottom: '4px', borderBottom: '1px solid #333', paddingBottom: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#fff' }}>{m.model}</span>
                            <span>{m.latency}ms</span>
                        </div>
                        <div style={{ color: '#666', fontSize: '9px' }}>
                            {m.timestamp.split('T')[1].split('.')[0]} | {m.tokens} toks
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PerformanceMonitor;
