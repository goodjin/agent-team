export default function EmptyDetail({ onCreate }) {
  return (
    <div className="empty-detail">
      <div className="empty-detail-icon">👈</div>
      <div className="empty-detail-title">选择一个任务</div>
      <div className="empty-detail-text">
        从左侧列表选择任务，或新建任务（直接与主 Agent 对话创建）
      </div>
      <button className="btn btn-primary btn-lg" onClick={onCreate}>
        + 创建新任务
      </button>
    </div>
  );
}
