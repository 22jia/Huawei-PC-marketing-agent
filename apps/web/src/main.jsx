import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './styles.css';

const App = React.lazy(() => import('./App'));

class AppErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('PC Studio 页面加载失败', error, info); }
  render() {
    if (this.state.error) return <div role="alert" style={{ padding: 48, fontFamily: 'system-ui, sans-serif' }}>
      <h2>页面加载失败</h2>
      <p>请重新加载；已保存的会话仍会保留。</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message || '未知页面错误'}</pre>
      <button onClick={() => window.location.reload()}>重新加载页面</button>
    </div>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
    <React.Suspense fallback={<div role="status" style={{ padding: 48 }}>正在加载工作空间…</div>}>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#484852', colorInfo: '#73738c', borderRadius: 9, colorBgLayout: '#fafafa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' } }}>
      <App />
    </ConfigProvider>
    </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
);
