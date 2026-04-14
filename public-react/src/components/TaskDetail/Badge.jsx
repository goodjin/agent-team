export default function Badge({ status, size = 'default' }) {
  const labels = {
    pending: '等待中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return (
    <span className={`status-badge ${status} ${size === 'small' ? 'small' : ''}`}>
      {labels[status] || status || ''}
    </span>
  );
}
