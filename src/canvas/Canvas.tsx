/**
 * The graph (plan 5.1). A projection of the course: every node a node, every
 * edge a connection, every `from` a dotted line, every section a coloured
 * group behind its nodes. Nothing here owns data; it reads the store and
 * writes back through it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useEditor } from "../store/editor";
import { positionsOf, type Position } from "../store/layout";
import { useUi } from "../store/ui";
import { usePreview, currentState } from "../preview/session";
import { edgeTypes, type FlowEdge } from "./edges";
import { nodeTypes, type CourseNodeData, type SectionData } from "./nodes";
import { autoLayout, DIAMOND_LABEL, sizeOf } from "./elk";
import { canvasView } from "./view";
import { isJudge, TYPE_STYLE } from "../course/nodeTypes";
import { summarize } from "../course/condition";
import { localize } from "../course/localize";
import { addNode, connect } from "../course/ops";
import { courseLangs } from "../store/editor";
import type { NodeType } from "../schema/types";
import { NODE_DRAG } from "../app/insert";
import { t } from "../i18n";

const SECTION_PAD = 28;

/**
 * The whole course in view. One too long for that at a readable zoom is
 * framed from its start, at the top: it reads top to bottom.
 */
function frameAll(rf: ReactFlowInstance, el: HTMLElement | null, duration: number) {
  const all = rf.getNodes();
  if (!el || !all.length) return;
  const bounds = rf.getNodesBounds(all);
  const { width, height } = el.getBoundingClientRect();
  const view = getViewportForBounds(bounds, width, height, 0.35, 1, 0.12);
  if (bounds.height * view.zoom > height) view.y = 40 - bounds.y * view.zoom;
  rf.setViewport(view, { duration });
}

export function Canvas() {
  const course = useEditor((s) => s.course);
  const positions = useEditor((s) => positionsOf(s.course));
  const savedViewport = useEditor((s) => s.layout.viewport);
  const lang = useEditor((s) => s.canvasLang);
  const diagnostics = useEditor((s) => s.diagnostics);
  const selection = useEditor((s) => s.selection);
  const focus = useEditor((s) => s.focus);
  const layoutRequested = useEditor((s) => s.layoutRequested);
  const previewStates = usePreview((s) => s.states);
  const steps = usePreview((s) => s.steps);
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<Node<CourseNodeData>[]>([]);
  const wrapper = useRef<HTMLDivElement>(null);

  const trail = useMemo(() => {
    const state = currentState({ states: previewStates });
    if (!state) return null;
    return { visited: new Set(state.history), current: state.currentId };
  }, [previewStates]);

  // The course, as React Flow nodes. Sizes React Flow measured are kept.
  useEffect(() => {
    if (!course) return;
    setNodes((prev) => {
      const before = new Map(prev.map((n) => [n.id, n]));
      return (Array.isArray(course.nodes) ? course.nodes : [])
        .filter((n) => n && typeof n.id === "string")
        .map((n, i) => {
          const old = before.get(n.id);
          const position = positions[n.id] ?? old?.position ?? { x: (i % 6) * 260, y: Math.floor(i / 6) * 160 };
          return {
            id: n.id,
            type: isJudge(n.type) ? "diamond" : "card",
            position,
            measured: old?.measured,
            selected: selection.nodes.includes(n.id),
            data: {
              node: n,
              lang,
              isStart: course.info?.start === n.id,
              issues: diagnostics?.byNode.get(n.id) ?? [],
              trail: trail ? (trail.current === n.id ? "current" : trail.visited.has(n.id) ? "visited" : undefined) : undefined,
            },
          } as Node<CourseNodeData>;
        });
    });
  }, [course, positions, lang, diagnostics, trail, selection.nodes]);

  const sectionNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of course?.info?.sections ?? []) map.set(s.number, localize(s.title, lang));
    return map;
  }, [course, lang]);

  // A group behind the nodes of each section, when the course has more than one.
  const sections = useMemo(() => {
    const groups = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
    for (const n of nodes) {
      const num = Number(n.data.node.section ?? 1);
      const size = n.measured?.width ? { width: n.measured.width, height: n.measured.height ?? 0 } : sizeOf(n.data.node.type);
      const g = groups.get(num) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      g.x0 = Math.min(g.x0, n.position.x);
      g.y0 = Math.min(g.y0, n.position.y);
      g.x1 = Math.max(g.x1, n.position.x + size.width + (n.type === "diamond" ? DIAMOND_LABEL : 0));
      g.y1 = Math.max(g.y1, n.position.y + size.height);
      groups.set(num, g);
    }
    if (groups.size < 2 && !sectionNames.size) return [];
    return [...groups.entries()].map(
      ([num, g]) =>
        ({
          id: `section-${num}`,
          type: "section",
          position: { x: g.x0 - SECTION_PAD, y: g.y0 - SECTION_PAD - 18 },
          data: {
            number: num,
            title: sectionNames.get(num) ?? t("canvas.section", { n: num }),
            width: g.x1 - g.x0 + SECTION_PAD * 2,
            height: g.y1 - g.y0 + SECTION_PAD * 2 + 18,
          },
          // Sized here, not measured: its size is the box around its nodes.
          width: g.x1 - g.x0 + SECTION_PAD * 2,
          height: g.y1 - g.y0 + SECTION_PAD * 2 + 18,
          // Dragged by its title, which takes all its nodes along.
          draggable: true,
          dragHandle: ".section-label",
          selectable: false,
          focusable: false,
          zIndex: -1,
        }) as Node<SectionData>,
    );
  }, [nodes, sectionNames]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // A section being dragged: where it and its nodes were when the drag began.
  const sectionDrag = useRef<{ id: string; from: { x: number; y: number }; starts: Map<string, { x: number; y: number }> } | null>(null);

  const edges = useMemo<Edge[]>(() => {
    if (!course || !Array.isArray(course.edges)) return [];
    const ids = new Set((course.nodes ?? []).map((n) => n?.id));
    const counts = new Map<string, number>();
    for (const e of course.edges) counts.set(e?.from, (counts.get(e?.from) ?? 0) + 1);
    const seen = new Map<string, number>();
    const taken = new Map(steps.map((s) => [s.edge, s.reason]));
    const flow: FlowEdge[] = [];
    course.edges.forEach((e, index) => {
      if (!e || !ids.has(e.from) || !ids.has(e.to)) return;
      const order = (seen.get(e.from) ?? 0) + 1;
      seen.set(e.from, order);
      const issues = diagnostics?.byEdge.get(index) ?? [];
      flow.push({
        id: `e${index}`,
        source: e.from,
        target: e.to,
        type: "flow",
        selected: selection.edge === index,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        data: {
          index,
          order,
          siblings: counts.get(e.from) ?? 1,
          label: summarize(e.when),
          fallback: !e.when,
          issues,
          taken: taken.has(index),
          reason: taken.get(index),
        },
      });
    });
    const from: Edge[] = (course.nodes ?? [])
      .filter((n) => typeof n?.content?.from === "string" && ids.has(n.content.from))
      .map((n) => ({
        id: `from-${n.id}`,
        source: n.content.from,
        target: n.id,
        type: "from",
        selectable: false,
        focusable: false,
        zIndex: 0,
      }));
    return [...flow, ...from];
  }, [course, diagnostics, selection.edge, steps]);

  // Moving a section moves its nodes by as much; the section, drawn around
  // them, follows. Let go, the positions are stored as one step to undo.
  const moveSection = useCallback((id: string, position: { x: number; y: number } | undefined, dragging: boolean | undefined) => {
    if (!sectionDrag.current || sectionDrag.current.id !== id) {
      const box = sectionsRef.current.find((b) => b.id === id);
      if (!box || !position) return;
      sectionDrag.current = { id, from: box.position, starts: new Map() };
      setNodes((nds) => {
        for (const n of nds) if (Number(n.data.node.section ?? 1) === box.data.number) sectionDrag.current?.starts.set(n.id, n.position);
        return nds;
      });
    }
    const drag = sectionDrag.current;
    if (position) {
      const dx = position.x - drag.from.x;
      const dy = position.y - drag.from.y;
      setNodes((nds) =>
        nds.map((n) => {
          const start = drag.starts.get(n.id);
          return start ? { ...n, position: { x: start.x + dx, y: start.y + dy } } : n;
        }),
      );
    }
    if (dragging === false) {
      sectionDrag.current = null;
      setNodes((nds) => {
        const store = useEditor.getState();
        const moved: Record<string, Position> = {};
        for (const n of nds) if (drag.starts.has(n.id)) moved[n.id] = n.position;
        queueMicrotask(() => store.setPositions(moved, true));
        return nds;
      });
    }
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CourseNodeData>>[]) => {
      const own = changes.filter((c) => !("id" in c) || !String(c.id).startsWith("section-"));
      const sectionMove = changes.find((c) => c.type === "position" && String(c.id).startsWith("section-"));
      if (sectionMove?.type === "position") return moveSection(sectionMove.id, sectionMove.position, sectionMove.dragging);
      setNodes((nds) => {
        const next = applyNodeChanges(own, nds);
        const ended = own.some((c) => c.type === "position" && c.dragging === false);
        if (ended) {
          const store = useEditor.getState();
          const moved = Object.fromEntries(next.map((n) => [n.id, n.position]));
          queueMicrotask(() => store.setPositions(moved, true));
        }
        if (own.some((c) => c.type === "select")) {
          const picked = next.filter((n) => n.selected).map((n) => n.id);
          queueMicrotask(() => useEditor.getState().select({ nodes: picked, edge: picked.length ? null : useEditor.getState().selection.edge }));
        }
        return next;
      });
    },
    [setNodes, moveSection],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes)
      if (c.type === "select" && c.id.startsWith("e") && c.selected)
        useEditor.getState().select({ edge: Number(c.id.slice(1)), nodes: [] });
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    let index = -1;
    useEditor.getState().update((c) => {
      index = connect(c, conn.source!, conn.target!);
    }, "connect");
    useEditor.getState().select({ edge: index, nodes: [] });
  }, []);

  // A click on a node or a link works the inspector both ways: out to edit what was picked, away again on the
  // next click. A section is not edited there, so it leaves the panel alone; a drag never reaches here
  // (d3-drag eats the click).
  const toggleInspector = useCallback((_: unknown, item: { type?: string }) => {
    if (item.type !== "section") useUi.getState().toggleSidebar();
  }, []);

  const onPaneClick = useCallback(() => useEditor.getState().select({ nodes: [], edge: null }), []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const type = event.dataTransfer.getData(NODE_DRAG) as NodeType;
      if (!type || !TYPE_STYLE[type]) return;
      event.preventDefault();
      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const store = useEditor.getState();
      let id = "";
      store.update((c) => {
        id = addNode(c, type, courseLangs(c));
      }, "add");
      store.setPositions({ [id]: position });
      store.select({ nodes: [id], edge: null });
    },
    [rf],
  );

  // Framing requests from the problems panel and the menu.
  // Once framed, the request is done: coming back to this course (from the
  // JSON tab, from another tab) finds the view where it was left.
  useEffect(() => {
    if (!focus) return;
    const frame = () => {
      if (focus.fit) frameAll(rf, wrapper.current, 250);
      else if (focus.node) rf.fitView({ nodes: [{ id: focus.node }], maxZoom: 1.1, duration: 300, padding: 0.6 });
      else if (focus.edge !== undefined) {
        const e = useEditor.getState().course?.edges[focus.edge];
        if (e) rf.fitView({ nodes: [{ id: e.from }, { id: e.to }], maxZoom: 1.1, duration: 300, padding: 0.4 });
      }
      if (useEditor.getState().focus === focus) useEditor.setState({ focus: null });
    };
    const timer = setTimeout(frame, 60);
    return () => clearTimeout(timer);
  }, [focus, rf]);

  // Auto-layout with ELK, on request or when a course comes with no positions.
  useEffect(() => {
    if (!layoutRequested) return;
    const store = useEditor.getState();
    if (!store.course) return;
    const doc = store.docId;
    const measured: Record<string, { width: number; height: number }> = {};
    for (const n of rf.getNodes()) if (n.measured?.width) measured[n.id] = { width: n.measured.width, height: n.measured.height ?? 0 };
    autoLayout(store.course, measured).then((pos) => {
      const current = useEditor.getState();
      // Another tab came on screen meanwhile (its course keeps the request
      // for when it comes back), or a newer layout was asked for.
      if (current.docId !== doc || current.layoutRequested !== layoutRequested) return;
      // A course that came with no positions at all is only being shown: it
      // has not changed until the author changes it, or moves a node.
      const first = !Object.keys(positionsOf(current.course)).length;
      current.setPositions(pos, !first);
      if (first && current.savedCourse === current.course) useEditor.setState({ savedCourse: useEditor.getState().course });
      useEditor.setState({ layoutRequested: 0 });
      setTimeout(() => frameAll(rf, wrapper.current, 300), 80);
    });
  }, [layoutRequested, rf]);

  useEffect(() => {
    canvasView.center = () => {
      const box = wrapper.current?.getBoundingClientRect();
      return box ? rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }) : { x: 0, y: 0 };
    };
    return () => {
      canvasView.center = null;
    };
  }, [rf]);

  // A side panel opening or closing narrows or widens the map: the graph moves
  // with it, its center staying in the middle, and the node just picked is
  // brought into view if the panel would have covered it.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const delta = el.clientWidth - width;
      width = el.clientWidth;
      if (!delta || !width) return;
      const vp = rf.getViewport();
      let x = vp.x + delta / 2;
      const { nodes } = useEditor.getState().selection;
      const node = nodes.length === 1 ? rf.getInternalNode(nodes[0]) : undefined;
      if (node) {
        const margin = 24;
        const left = x + node.internals.positionAbsolute.x * vp.zoom;
        const right = left + (node.measured.width ?? 0) * vp.zoom;
        if (right > width - margin) x -= right - (width - margin);
        else if (left < margin) x += margin - left;
      }
      rf.setViewport({ ...vp, x });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rf]);

  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    useEditor.getState().setLayout((l) => {
      l.viewport = { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) };
    });
  }, []);

  if (!course) return null;
  return (
    <div className="canvas" ref={wrapper} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={[...sections, ...nodes] as Node[]}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange as never}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={toggleInspector}
        onEdgeClick={toggleInspector}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        defaultViewport={savedViewport}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Shift"]}
        minZoom={0.1}
        maxZoom={2.5}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        aria-label={t("canvas.label")}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <MiniMap pannable zoomable nodeColor={(n) => TYPE_STYLE[(n.data as CourseNodeData)?.node?.type]?.color ?? "transparent"} nodeStrokeWidth={2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
