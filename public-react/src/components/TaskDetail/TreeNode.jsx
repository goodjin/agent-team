import { useState } from 'react';

/**
 * 通用树节点组件（递归）
 * @param {Array} nodes - 根节点数组
 * @param {Function} renderNode - (node, depth) => JSX，渲染节点内容
 * @param {Function} getChildren - node => Array，获取子节点
 * @param {Function} onNodeClick - node => void，点击回调
 */
export default function TreeNode({ nodes = [], renderNode, getChildren, onNodeClick }) {
  return (
    <div className="tree-root">
      {nodes.map((node, idx) => (
        <TreeNodeItem
          key={node.id ?? idx}
          node={node}
          renderNode={renderNode}
          getChildren={getChildren}
          onNodeClick={onNodeClick}
          isLast={idx === nodes.length - 1}
        />
      ))}
    </div>
  );
}

function TreeNodeItem({ node, renderNode, getChildren, onNodeClick, isLast }) {
  const [expanded, setExpanded] = useState(true); // 默认展开
  const children = getChildren(node);
  const hasChildren = children.length > 0;

  return (
    <>
      {/* 节点行 */}
      <div className="tree-node-row" onClick={() => onNodeClick(node)}>
        <button
          className="tree-toggle"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          type="button"
        >
          {hasChildren ? (expanded ? '▼' : '▶') : ''}
        </button>
        <div className="tree-node-content">
          {renderNode(node)}
        </div>
      </div>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <div className="tree-children">
          {children.map((child, idx) => (
            <TreeNodeItem
              key={child.id ?? idx}
              node={child}
              renderNode={renderNode}
              getChildren={getChildren}
              onNodeClick={onNodeClick}
              isLast={idx === children.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
}
