import React, { useEffect, useState } from 'react';

export default function MemoryLogViewer() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLog = async () => {
    setLoading(true);
    const res = await fetch('/api/memory-log');
    const data = await res.json();
    setLog(data.log || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLog();
  }, []);

  return (
    <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #ccc', padding: 16 }}>
      <button onClick={fetchLog} disabled={loading} style={{ marginBottom: 8 }}>
        {loading ? 'Refreshing...' : 'Refresh Memory Log'}
      </button>
      {log.length === 0 && <div>No memory yet.</div>}
      {log.map((entry, i) => (
        <div key={i} style={{ marginBottom: 16, padding: 8, borderBottom: '1px solid #eee' }}>
          <div><b>Time:</b> {entry.timestamp}</div>
          <div><b>Prompt:</b> {entry.prompt}</div>
          <div><b>Screen OCR:</b> <pre style={{ whiteSpace: 'pre-wrap' }}>{entry.screenOCR}</pre></div>
          <div><b>AI Response:</b> <pre style={{ whiteSpace: 'pre-wrap' }}>{entry.response}</pre></div>
        </div>
      ))}
    </div>
  );
} 