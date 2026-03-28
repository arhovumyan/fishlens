"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FileTreeEntry {
  path: string;
  type: string;
  language: string;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildTreeFromEntries(
  entries: FileTreeEntry[],
  repoName: string
): TreeNode {
  const root: TreeNode = {
    name: repoName,
    path: "",
    isFolder: true,
    children: [],
  };

  const dirPaths = new Set(
    entries.filter((e) => e.type === "dir").map((e) => e.path)
  );
  const files = entries.filter((e) => e.type === "file");

  // Auto-create parent directories inferred from file paths
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirPaths.add(parts.slice(0, i).join("/"));
    }
  }

  const folderMap = new Map<string, TreeNode>();
  folderMap.set("", root);

  const sortedDirs = Array.from(dirPaths).sort(
    (a, b) => a.split("/").length - b.split("/").length
  );

  for (const dirPath of sortedDirs) {
    if (folderMap.has(dirPath)) continue;
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const node: TreeNode = {
      name,
      path: dirPath,
      isFolder: true,
      children: [],
    };
    folderMap.set(dirPath, node);
    const parent = folderMap.get(parentPath) ?? root;
    parent.children.push(node);
  }

  files.forEach((file) => {
    const parts = file.path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = folderMap.get(parentPath) ?? root;
    parent.children.push({
      name,
      path: file.path,
      isFolder: false,
      children: [],
    });
  });

  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);

  return root;
}

/** Quick description for items that can't be API-analyzed (folders, binary assets) */
function getQuickDesc(node: TreeNode): string | null {
  // Root
  if (!node.path && node.isFolder) {
    const fc = node.children.filter((c) => c.isFolder).length;
    const filec = node.children.filter((c) => !c.isFolder).length;
    const p: string[] = [];
    if (fc > 0) p.push(`${fc} folder${fc !== 1 ? "s" : ""}`);
    if (filec > 0) p.push(`${filec} file${filec !== 1 ? "s" : ""}`);
    return `Root of the repository. Contains ${p.join(" and ")} at the top level.`;
  }

  // Folders (API needs a file path — folders have no source)
  if (node.isFolder) {
    const fc = node.children.filter((c) => c.isFolder).length;
    const filec = node.children.filter((c) => !c.isFolder).length;
    const p: string[] = [];
    if (fc > 0) p.push(`${fc} subfolder${fc !== 1 ? "s" : ""}`);
    if (filec > 0) p.push(`${filec} file${filec !== 1 ? "s" : ""}`);
    return `The **${node.name}/** directory. Contains ${p.join(" and ")}.`;
  }

  // Binary / asset files that have no useful source to send to AI
  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
  const imageExts: Record<string, string> = {
    svg: "SVG vector graphic", png: "PNG image", jpg: "JPEG image",
    jpeg: "JPEG image", gif: "GIF image", ico: "Icon file (favicon)",
    webp: "WebP image", bmp: "Bitmap image", tiff: "TIFF image",
  };
  if (imageExts[ext]) return `This is a ${imageExts[ext]} — a visual asset used in the project.`;
  if (["woff", "woff2", "ttf", "eot", "otf"].includes(ext))
    return `Font file (${ext.toUpperCase()}) used for typography.`;
  if (["mp4", "webm", "ogg", "mp3", "wav", "flac"].includes(ext))
    return `Media file (${ext.toUpperCase()}).`;
  if (ext === "pdf") return "PDF document.";

  const base = node.name.toLowerCase();
  if (["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"].includes(base))
    return "Auto-generated lock file that pins exact dependency versions.";

  // Everything else (py, go, rs, java, ts, js, json, yaml, md, etc.) → API
  return null;
}

function TreeNodeComponent({
  node,
  expanded,
  onToggle,
  onNodeClick,
  isRoot,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onNodeClick: (node: TreeNode) => void;
  isRoot?: boolean;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children.length > 0;

  const handleClick = () => {
    if (hasChildren) onToggle(node.path);
    onNodeClick(node);
  };

  return (
    <div className="htree-node">
      <div className="htree-head">
        <button
          type="button"
          onClick={handleClick}
          className={`htree-btn ${
            isRoot ? "htree-btn-root" : node.isFolder ? "htree-btn-folder" : "htree-btn-file"
          } ${isExpanded ? "htree-btn-open" : ""}`}
          title={node.path || node.name}
        >
          <span className="htree-icon">
            {isRoot ? "💾" : node.isFolder ? "📁" : "📄"}
          </span>
          <span className="htree-lbl">{node.name}</span>
          {hasChildren && (
            <span className="htree-tog">{isExpanded ? "−" : "+"}</span>
          )}
        </button>
        {isExpanded && hasChildren && <div className="htree-wire" />}
      </div>

      {isExpanded && hasChildren && (
        <div className="htree-children">
          {node.children.map((child) => (
            <div key={child.path} className="htree-child">
              <TreeNodeComponent
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                onNodeClick={onNodeClick}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RepoTree({
  fileTree,
  repoName,
  onExplainRequest,
  explanation,
  explanationStreaming,
  experienceLevel,
}: {
  fileTree: FileTreeEntry[];
  repoName: string;
  onExplainRequest: (filePath: string) => void;
  explanation: string;
  explanationStreaming: boolean;
  experienceLevel: "junior" | "mid" | "senior";
}) {
  const tree = useMemo(
    () => buildTreeFromEntries(fileTree, repoName),
    [fileTree, repoName]
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [popupNode, setPopupNode] = useState<TreeNode | null>(null);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(
    (node: TreeNode) => {
      setPopupNode(node);
      const desc = getQuickDesc(node);
      if (desc) {
        setLocalContent(desc);
      } else {
        setLocalContent(null);
        onExplainRequest(node.path);
      }
    },
    [onExplainRequest]
  );

  const stopAudio = useCallback(() => {
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setSpeaking(false);
  }, []);

  const closePopup = useCallback(() => {
    stopAudio();
    setPopupNode(null);
    setLocalContent(null);
  }, [stopAudio]);

  const handleSpeak = useCallback((text: string) => {
    if (speaking) { stopAudio(); return; }
    const plain = text.replace(/```[\s\S]*?```/g, "").replace(/[*#`\[\]()]/g, "").replace(/\n{2,}/g, ". ").trim();
    if (!plain || plain.length < 5) return;

    const utter = new SpeechSynthesisUtterance(plain);
    utter.rate = 0.8;
    utter.pitch = 1.0;
    // Pick best available voice — prefer natural-sounding ones
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      /samantha|karen|google.*us|google.*uk|moira|fiona/i.test(v.name)
    ) ?? voices.find(v => v.lang.startsWith("en")) ?? voices[0];
    if (preferred) utter.voice = preferred;
    utter.onend = () => { setSpeaking(false); utterRef.current = null; };
    utter.onerror = () => { setSpeaking(false); utterRef.current = null; };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }, [speaking, stopAudio]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closePopup]);

  const levelConfig = {
    junior: { badge: "JUNIOR", cls: "bg-[#ffe100] text-black" },
    mid: { badge: "MID", cls: "bg-[#5de5ff] text-black" },
    senior: { badge: "SENIOR", cls: "bg-[#ff5ea9] text-white" },
  };
  const cfg = levelConfig[experienceLevel];

  return (
    <div
      className="retro-tree-container custom-scrollbar"
      style={{ minHeight: 500, maxHeight: "80vh", overflow: "auto" }}
    >
      <div className="flex flex-col md:flex-row">
        {/* Tree */}
        <div className={`p-6 ${popupNode ? "md:w-1/2" : "w-full"}`}>
          <TreeNodeComponent
            node={tree}
            expanded={expanded}
            onToggle={handleToggle}
            onNodeClick={handleNodeClick}
            isRoot
          />
        </div>

        {/* Inline explanation panel */}
        {popupNode && (
          <div className="retro-tree-popup-inline md:w-1/2 p-2">
            <div className="retro-window">
              <div className="retro-titlebar px-2 py-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">
                    {popupNode.isFolder ? "📁" : "📄"}
                  </span>
                  <span className="text-[11px] font-bold truncate">
                    {popupNode.name}
                  </span>
                  {!localContent && (
                    <span
                      className={`text-[9px] px-1 py-0.5 font-bold shrink-0 ${cfg.cls}`}
                    >
                      {cfg.badge}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(explanation || localContent) && !explanationStreaming && (
                    <button
                      type="button"
                      onClick={() => handleSpeak(localContent || explanation)}
                      className="text-[9px] px-1.5 py-0.5 font-bold bg-white/20 hover:bg-white/30 text-white uppercase tracking-wide"
                      title={speaking ? "Stop" : "Read aloud"}
                    >
                      {speaking ? "Stop" : "Speak"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closePopup}
                    className="retro-tree-close"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="retro-window-body p-2">
                {popupNode.path && (
                  <div className="text-[10px] font-mono text-black/50 mb-1 truncate">
                    {popupNode.path}
                  </div>
                )}
                <div className="retro-panel-inset p-2 bg-white max-h-[350px] overflow-y-auto custom-scrollbar">
                  {localContent ? (
                    <div className="prose-glitch text-xs leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {localContent}
                      </ReactMarkdown>
                    </div>
                  ) : explanation || explanationStreaming ? (
                    <div className="prose-glitch text-xs leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {explanation}
                      </ReactMarkdown>
                      {explanationStreaming && (
                        <span className="cursor-blink" />
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-black/50 italic">
                      Loading explanation...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
