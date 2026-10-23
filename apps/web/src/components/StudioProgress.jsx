import { useEffect, useState } from 'react';

export function StudioProgress({ progress, busy }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  if (!progress) return null;
  const seconds = Math.max(0, Math.floor(((busy ? now : progress.finishedAt || now) - progress.startedAt) / 1000));
  return <div className={`studio-progress ${busy ? 'is-running' : ''}`} role="status" aria-live="polite">
    <div className="studio-progress-heading"><span className="live-dot" /><strong>{progress.label}</strong><span>{seconds} 秒</span></div>
    <div className="studio-progress-steps">{(progress.steps || []).map((step, index) => <span key={index} className={`step-${step.status}`}>{step.status === 'success' ? '✓' : step.status === 'failed' ? '!' : '·'} {step.label}</span>)}</div>
    {progress.request_id && <small>运行编号：{progress.request_id}</small>}
  </div>;
}
