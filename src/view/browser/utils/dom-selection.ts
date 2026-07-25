interface SelectionPointSnapshot {
  path: number[];
  offset: number;
}

export interface RootSelectionSnapshot {
  anchor: SelectionPointSnapshot;
  focus: SelectionPointSnapshot;
}

function getNodePath(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;

  while (current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index < 0) {
      return null;
    }
    path.push(index);
    current = parent;
  }

  return path.reverse();
}

function resolveNodePath(root: Node, path: number[]): Node | null {
  let current = root;
  for (const index of path) {
    const child = current.childNodes.item(index);
    if (!child) {
      return null;
    }
    current = child;
  }
  return current;
}

function clampOffset(node: Node, offset: number): number {
  const maxOffset =
    node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
  return Math.max(0, Math.min(offset, maxOffset));
}

export function captureRootSelection(root: HTMLElement | null): RootSelectionSnapshot | null {
  const selection = root?.ownerDocument.getSelection();
  if (
    !root ||
    !selection ||
    selection.isCollapsed ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }

  const anchorPath = getNodePath(root, selection.anchorNode);
  const focusPath = getNodePath(root, selection.focusNode);
  if (!anchorPath || !focusPath) {
    return null;
  }

  return {
    anchor: { path: anchorPath, offset: selection.anchorOffset },
    focus: { path: focusPath, offset: selection.focusOffset },
  };
}

export function restoreRootSelection(
  root: HTMLElement | null,
  snapshot: RootSelectionSnapshot | null,
): boolean {
  if (!root || !snapshot) {
    return false;
  }

  const selection = root.ownerDocument.getSelection();
  if (!selection) {
    return false;
  }

  // React が既存ノードを維持できた場合は、現在の選択を触らない。
  // 差し替えで選択が消えた場合だけ、更新前の論理位置へ戻す。
  if (
    !selection.isCollapsed &&
    selection.anchorNode &&
    selection.focusNode &&
    root.contains(selection.anchorNode) &&
    root.contains(selection.focusNode)
  ) {
    return false;
  }

  const anchorNode = resolveNodePath(root, snapshot.anchor.path);
  const focusNode = resolveNodePath(root, snapshot.focus.path);
  if (!anchorNode || !focusNode) {
    return false;
  }

  const anchorOffset = clampOffset(anchorNode, snapshot.anchor.offset);
  const focusOffset = clampOffset(focusNode, snapshot.focus.offset);

  selection.removeAllRanges();
  if (typeof selection.setBaseAndExtent === "function") {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  } else {
    const range = root.ownerDocument.createRange();
    range.setStart(anchorNode, anchorOffset);
    range.setEnd(focusNode, focusOffset);
    selection.addRange(range);
  }
  return true;
}
