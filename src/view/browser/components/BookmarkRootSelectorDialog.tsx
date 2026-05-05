import React, { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";
import {
  type BookmarkFolderNode,
  isBookmarkRootSelectionRequired,
  readBookmarkFolderTree,
  readConfiguredBookmarkFolderId,
  supportsBookmarkFolderSelection,
  updateBookmarkFolderId,
} from "src/view/browser/utils/bookmark-root";

interface BookmarkFolderTreeProps {
  nodes: BookmarkFolderNode[];
  selectedId: string;
  onSelect: (bookmarkId: string) => void;
}

const BookmarkFolderTree: React.FC<BookmarkFolderTreeProps> = ({
  nodes,
  selectedId,
  onSelect,
}) => {
  return (
    <ul className="bookmark-root-dialog__tree-list">
      {nodes.map((node) => {
        const isSelected = node.id === selectedId;
        return (
          <li key={node.id} className="bookmark-root-dialog__tree-item">
            <button
              type="button"
              className={`bookmark-root-dialog__tree-node${
                isSelected ? " bookmark-root-dialog__tree-node--selected" : ""
              }`}
              onClick={() => onSelect(node.id)}
            >
              <span className="bookmark-root-dialog__tree-title">
                {node.title}
              </span>
              <span className="bookmark-root-dialog__tree-id">ID: {node.id}</span>
            </button>
            {node.children.length > 0 && (
              <BookmarkFolderTree
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};

export const BookmarkRootSelectorDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRequiredPrompt, setIsRequiredPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [folderTree, setFolderTree] = useState<BookmarkFolderNode[]>([]);

  const openDialog = useCallback((requiredPrompt: boolean) => {
    setIsRequiredPrompt(requiredPrompt);
    setIsOpen(true);
  }, []);

  const loadFolderTree = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const tree = await readBookmarkFolderTree();
      setFolderTree(tree);
      setSelectedId(readConfiguredBookmarkFolderId());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ブックマークフォルダ一覧の読み込みに失敗しました",
      );
      setFolderTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supportsBookmarkFolderSelection()) {
      return;
    }

    const handleRequired = () => {
      openDialog(true);
    };
    const handleManualOpen = () => {
      openDialog(false);
    };

    container.message.on("bookmark_root_reconfigure_required", handleRequired);
    container.message.on("bookmark_root_selector_open", handleManualOpen);

    if (isBookmarkRootSelectionRequired()) {
      openDialog(true);
    }

    return () => {
      container.message.off(
        "bookmark_root_reconfigure_required",
        handleRequired,
      );
      container.message.off("bookmark_root_selector_open", handleManualOpen);
    };
  }, [openDialog]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadFolderTree();
  }, [isOpen, loadFolderTree]);

  const handleClose = useCallback(() => {
    if (isRequiredPrompt || saving) {
      return;
    }

    setIsOpen(false);
    setError(null);
  }, [isRequiredPrompt, saving]);

  const handleSave = useCallback(async () => {
    if (!selectedId || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateBookmarkFolderId(selectedId);
      setIsOpen(false);
      setIsRequiredPrompt(false);
      container.toast.success("ブックマーク保存先を更新しました");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "ブックマーク保存先の更新に失敗しました";
      setError(message);
      container.toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [saving, selectedId]);

  if (!supportsBookmarkFolderSelection() || !isOpen) {
    return null;
  }

  return (
    <div className="bookmark-root-dialog" role="presentation">
      <button
        type="button"
        className="bookmark-root-dialog__backdrop"
        aria-label="ブックマーク保存先選択を閉じる"
        onClick={handleClose}
      />
      <div
        className="bookmark-root-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-root-dialog-title"
      >
        <div className="bookmark-root-dialog__header">
          <div>
            <p className="bookmark-root-dialog__eyebrow">Bookmark Source</p>
            <h2 id="bookmark-root-dialog-title">ブックマーク保存先を選択</h2>
          </div>
          {!isRequiredPrompt && (
            <button
              type="button"
              className="bookmark-root-dialog__close"
              onClick={handleClose}
            >
              閉じる
            </button>
          )}
        </div>

        <p className="bookmark-root-dialog__description">
          read.crx のブックマーク保存先として使うフォルダを選択してください。
          このフォルダ配下のブックマークは既読数同期のため更新されることがあります。
        </p>

        {error && <p className="bookmark-root-dialog__error">{error}</p>}

        {loading ? (
          <div className="bookmark-root-dialog__status">
            ブックマークフォルダを読み込み中...
          </div>
        ) : folderTree.length === 0 ? (
          <div className="bookmark-root-dialog__status">
            利用可能なブックマークフォルダが見つかりませんでした。
          </div>
        ) : (
          <div className="bookmark-root-dialog__tree" role="tree">
            <BookmarkFolderTree
              nodes={folderTree}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        )}

        <div className="bookmark-root-dialog__actions">
          {!isRequiredPrompt && (
            <button
              type="button"
              className="bookmark-root-dialog__button"
              onClick={handleClose}
              disabled={saving}
            >
              キャンセル
            </button>
          )}
          <button
            type="button"
            className="bookmark-root-dialog__button bookmark-root-dialog__button--primary"
            onClick={handleSave}
            disabled={!selectedId || loading || saving}
          >
            {saving ? "保存中..." : "決定"}
          </button>
        </div>
      </div>
    </div>
  );
};
