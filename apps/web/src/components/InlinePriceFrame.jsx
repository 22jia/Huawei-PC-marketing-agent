import { Button, Drawer } from 'antd';

export function InlinePriceFrame({ inline, title, onClose, children, ...props }) {
  if (!inline) return <Drawer {...props} title={title} onClose={onClose}>{children}</Drawer>;
  return <section className="inline-price-planner" aria-label={title}>
    <div className="inline-result-heading"><h3>{title}</h3><Button size="small" onClick={onClose}>收起比价</Button></div>
    {children}
  </section>;
}
