import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  GitPullRequestArrow,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  ChevronRight,
  Shield,
  UserCheck,
  Building2,
  DollarSign,
  Clock,
  ArrowRight,
  Save,
  Check,
  X,
  FileCheck2,
  AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';
import type { WorkflowDefinition, WorkflowModule } from '../../types';
import type {
  CanvasLayout,
  VisualNode,
  VisualEdge,
  WorkflowTemplate,
  WorkflowValidationResult,
  SimulationResult
} from '../../types/workflowDesigner';
import { useToast } from '../../context/ToastContext';

const MODULES: WorkflowModule[] = [
  'LEAVE',
  'EXPENSE',
  'ATTENDANCE_CORRECTION',
  'WFH',
  'ON_DUTY',
  'BUSINESS_TRAVEL',
  'OVERTIME',
  'SALARY_REVISION',
  'PAYROLL',
  'DOCUMENT',
  'ADVANCE',
  'GENERIC'
];

const APPROVER_TYPES = [
  { type: 'REPORTING_MANAGER', label: 'Reporting Manager', icon: UserCheck, desc: 'Direct manager from employee hierarchy' },
  { type: 'DEPARTMENT_HEAD', label: 'Department Head', icon: Building2, desc: 'Head of employee department' },
  { type: 'FINANCE', label: 'Finance / Payroll', icon: DollarSign, desc: 'Company payroll or finance administrators' },
  { type: 'ROLE', label: 'System Role', icon: Shield, desc: 'Any user assigned to a specific role' },
  { type: 'USER', label: 'Specific User', icon: UserCheck, desc: 'Target individual user by ID' },
] as const;

export const WorkflowBuilderPage: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<WorkflowDefinition[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinition | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Canvas State
  const [nodes, setNodes] = useState<VisualNode[]>([]);
  const [edges, setEdges] = useState<VisualEdge[]>([]);
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>(undefined);

  // Workflow Metadata State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [module, setModule] = useState<WorkflowModule>('LEAVE');

  // Modals & Panels
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [sampleUserId, setSampleUserId] = useState('');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Load all workflows
  const loadDefinitions = useCallback(async (selectId?: string) => {
    setBusy(true);
    try {
      const defs = await api.getWorkflowDefinitions();
      setItems(defs);
      if (selectId) {
        const found = defs.find((d) => d.id === selectId);
        if (found) selectWorkflow(found);
      } else if (!selectedDefinition && defs.length > 0) {
        selectWorkflow(defs[0]);
      }
    } catch (e) {
      toast.error('Workflows could not be loaded', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [selectedDefinition, toast]);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  // Load designer graph for selected workflow
  const selectWorkflow = async (def: WorkflowDefinition) => {
    setSelectedDefinition(def);
    setName(def.name);
    setCode(def.code);
    setModule(def.module);
    setExpectedUpdatedAt(def.updatedAt);
    setSelectedNodeId(null);
    setValidationResult(null);

    try {
      const designerData = await api.getWorkflowDesigner(def.id);
      if (designerData.graph && designerData.graph.nodes) {
        setNodes(designerData.graph.nodes);
        setEdges(designerData.graph.edges);
      }
    } catch (e) {
      toast.error('Designer graph could not be loaded', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  // Re-layout sequential nodes horizontally
  const autoArrange = (currentNodes: VisualNode[]) => {
    const trigger = currentNodes.find((n) => n.type === 'TRIGGER');
    const steps = currentNodes.filter((n) => n.type === 'APPROVAL_STEP');
    const terminal = currentNodes.find((n) => n.type === 'TERMINAL');

    const arranged: VisualNode[] = [];
    const newEdges: VisualEdge[] = [];
    let prevId = '';

    if (trigger) {
      arranged.push({ ...trigger, position: { x: 80, y: 180 } });
      prevId = trigger.id;
    }

    steps.forEach((step, idx) => {
      const xPos = 80 + (idx + 1) * 320;
      arranged.push({
        ...step,
        position: { x: xPos, y: 180 },
        data: { ...step.data, sequence: idx + 1 }
      });
      if (prevId) {
        newEdges.push({ id: `e_${prevId}_to_${step.id}`, source: prevId, target: step.id });
      }
      prevId = step.id;
    });

    if (terminal) {
      const xPos = 80 + (steps.length + 1) * 320;
      arranged.push({ ...terminal, position: { x: xPos, y: 180 } });
      if (prevId) {
        newEdges.push({ id: `e_${prevId}_to_${terminal.id}`, source: prevId, target: terminal.id });
      }
    }

    setNodes(arranged);
    setEdges(newEdges);
  };

  // Insert a new approval step
  const addStep = (approverType: 'REPORTING_MANAGER' | 'DEPARTMENT_HEAD' | 'FINANCE' | 'ROLE' | 'USER') => {
    if (selectedDefinition && selectedDefinition.status !== 'DRAFT') {
      toast.error('Cannot modify published workflow', 'Please click "Fork New Draft" to edit a new version.');
      return;
    }

    const steps = nodes.filter((n) => n.type === 'APPROVAL_STEP');
    const newSeq = steps.length + 1;
    const newId = `node_step_${Date.now()}`;

    const defaultLabels: Record<string, string> = {
      REPORTING_MANAGER: 'Reporting Manager Review',
      DEPARTMENT_HEAD: 'Department Head Approval',
      FINANCE: 'Finance Review',
      ROLE: 'Role Approval',
      USER: 'Designated User Approval'
    };

    const newNode: VisualNode = {
      id: newId,
      type: 'APPROVAL_STEP',
      position: { x: 80 + newSeq * 320, y: 180 },
      data: {
        label: defaultLabels[approverType] || `Approval Step ${newSeq}`,
        sequence: newSeq,
        approverType,
        approverReference: approverType === 'ROLE' ? 'HR_MANAGER' : null,
        minimumApprovals: 1,
        slaHours: 24,
        allowDelegation: true,
      }
    };

    const newNodes = [...nodes.filter((n) => n.type !== 'TERMINAL'), newNode, ...nodes.filter((n) => n.type === 'TERMINAL')];
    autoArrange(newNodes);
    setSelectedNodeId(newId);
    toast.success('Approval step added', `${newNode.data.label} added to the pipeline.`);
  };

  // Remove a step
  const removeStep = (id: string) => {
    if (selectedDefinition && selectedDefinition.status !== 'DRAFT') {
      toast.error('Cannot modify published workflow', 'Please click "Fork New Draft" to edit a new version.');
      return;
    }

    const updated = nodes.filter((n) => n.id !== id);
    if (updated.filter((n) => n.type === 'APPROVAL_STEP').length === 0) {
      toast.error('Validation Warning', 'Workflows require at least one approval step.');
      return;
    }
    autoArrange(updated);
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // Move step sequence
  const moveStep = (id: string, direction: 'LEFT' | 'RIGHT') => {
    const steps = nodes.filter((n) => n.type === 'APPROVAL_STEP');
    const idx = steps.findIndex((n) => n.id === id);
    if (idx === -1) return;

    if (direction === 'LEFT' && idx > 0) {
      const temp = steps[idx];
      steps[idx] = steps[idx - 1];
      steps[idx - 1] = temp;
    } else if (direction === 'RIGHT' && idx < steps.length - 1) {
      const temp = steps[idx];
      steps[idx] = steps[idx + 1];
      steps[idx + 1] = temp;
    } else {
      return;
    }

    const newNodes = [
      ...nodes.filter((n) => n.type === 'TRIGGER'),
      ...steps,
      ...nodes.filter((n) => n.type === 'TERMINAL')
    ];
    autoArrange(newNodes);
  };

  // Update selected node data
  const updateSelectedNode = (field: string, value: unknown) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, [field]: value } } : n))
    );
  };

  // Save Draft
  const saveDraft = async () => {
    setSaving(true);
    try {
      const canvasLayout: CanvasLayout = {
        version: 1,
        viewport: { x: 0, y: 0, zoom },
        nodes,
        edges,
      };

      const result = await api.saveWorkflowDraft({
        definitionId: selectedDefinition?.status === 'DRAFT' ? selectedDefinition.id : undefined,
        module,
        name,
        code,
        expectedUpdatedAt,
        canvasLayout,
      });

      toast.success('Workflow Draft Saved', `${result.definition.code} v${result.definition.version} saved successfully.`);
      await loadDefinitions(result.definition.id);
    } catch (e: unknown) {
      toast.error('Draft save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // Validate Graph
  const validateGraph = async () => {
    if (!selectedDefinition) return;
    setBusy(true);
    try {
      const canvasLayout: CanvasLayout = {
        version: 1,
        viewport: { x: 0, y: 0, zoom },
        nodes,
        edges,
      };
      const res = await api.validateWorkflow(selectedDefinition.id, canvasLayout);
      setValidationResult(res);
      setShowValidationModal(true);
      if (res.valid) {
        toast.success('Validation Passed', 'Workflow structure is valid and ready for publishing.');
      } else {
        toast.error('Validation Issues Found', `${res.errors.length} issue(s) require resolution.`);
      }
    } catch (e) {
      toast.error('Validation failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  // Publish Workflow
  const publishWorkflow = async () => {
    if (!selectedDefinition) return;
    if (selectedDefinition.status !== 'DRAFT') {
      toast.error('Only drafts can be published', 'Active workflows are already in production.');
      return;
    }

    setBusy(true);
    try {
      // Auto-save first
      await saveDraft();
      const res = await api.publishWorkflow(selectedDefinition.id);
      toast.success('Workflow Published to Production', `${selectedDefinition.code} v${res.version} is now ACTIVE.`);
      await loadDefinitions(selectedDefinition.id);
    } catch (e) {
      toast.error('Publishing failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  // Fork Active Workflow to New Draft Version
  const forkNewDraft = async () => {
    if (!selectedDefinition) return;
    setSaving(true);
    try {
      const canvasLayout: CanvasLayout = {
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes,
        edges,
      };

      const result = await api.saveWorkflowDraft({
        module: selectedDefinition.module,
        name: `${selectedDefinition.name} (Draft)`,
        code: selectedDefinition.code,
        canvasLayout,
      });

      toast.success('New Draft Created', `Created draft v${result.definition.version} for ${result.definition.code}.`);
      await loadDefinitions(result.definition.id);
    } catch (e) {
      toast.error('Failed to fork draft', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // Open Templates Modal
  const openTemplates = async () => {
    try {
      const list = await api.getWorkflowTemplates();
      setTemplates(list);
      setShowTemplatesModal(true);
    } catch (e) {
      toast.error('Could not load templates', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  // Instantiate Template
  const instantiateTemplate = async (templateKey: string) => {
    setBusy(true);
    try {
      const res = await api.instantiateWorkflowTemplate(templateKey);
      setShowTemplatesModal(false);
      toast.success('Template Instantiated', `Created draft ${res.definition.code} v${res.definition.version}.`);
      await loadDefinitions(res.definition.id);
    } catch (e) {
      toast.error('Template instantiation failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  // Run Dry-Run Simulation
  const runSimulation = async () => {
    if (!selectedDefinition) return;
    if (!sampleUserId.trim()) {
      toast.error('User UUID Required', 'Please enter or select a sample requester user ID.');
      return;
    }
    setSimulating(true);
    try {
      const res = await api.simulateWorkflow(selectedDefinition.id, sampleUserId.trim());
      setSimulationResult(res);
      toast.success('Simulation Completed', res.feasible ? 'Workflow path is fully resolvable!' : 'Workflow has unresolvable approval steps.');
    } catch (e) {
      toast.error('Simulation failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSimulating(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="neo-page neo-workflows flex flex-col h-[calc(100vh-80px)] space-y-4">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <GitPullRequestArrow className="w-6 h-6 text-brand-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">Visual Workflow Designer</h1>
            {selectedDefinition && (
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                  selectedDefinition.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : selectedDefinition.status === 'DRAFT'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {selectedDefinition.status} · v{selectedDefinition.version}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Sequential approval pipeline designer compiled into OrbitHR's immutable state machine.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Workflow Selector */}
          <select
            value={selectedDefinition?.id || ''}
            onChange={(e) => {
              const found = items.find((d) => d.id === e.target.value);
              if (found) selectWorkflow(found);
            }}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
          >
            {items.map((def) => (
              <option key={def.id} value={def.id}>
                [{def.module}] {def.name} ({def.code} v{def.version}) — {def.status}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadDefinitions()}
            className="p-2 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => void openTemplates()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200"
          >
            <Layers className="w-3.5 h-3.5 text-brand-400" />
            Templates
          </button>

          {selectedDefinition?.status === 'ACTIVE' ? (
            <button
              onClick={() => void forkNewDraft()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 rounded-xl text-xs font-medium text-indigo-200"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Fork New Draft
            </button>
          ) : (
            <button
              onClick={() => void saveDraft()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-brand-500/20"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          )}

          <button
            onClick={() => void validateGraph()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
            Validate
          </button>

          <button
            onClick={() => setShowSimulateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            Simulate
          </button>

          {selectedDefinition?.status === 'DRAFT' && (
            <button
              onClick={() => void publishWorkflow()}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-emerald-600/20"
            >
              <Rocket className="w-3.5 h-3.5" />
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Main Designer Workspace */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[260px_1fr_340px] gap-4 min-h-0 overflow-hidden">
        {/* Left Component Palette */}
        <aside className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 flex flex-col space-y-4 overflow-y-auto">
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase text-slate-400">Workflow Metadata</h2>
            <div className="mt-2 space-y-2">
              <div>
                <label className="text-[10px] text-slate-400">Workflow Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={selectedDefinition?.status !== 'DRAFT'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Module</label>
                  <select
                    value={module}
                    onChange={(e) => setModule(e.target.value as WorkflowModule)}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Node Palette */}
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase text-slate-400 mb-2">Add Approval Stage</h2>
            <p className="text-[11px] text-slate-500 mb-3">Click or add a stage to insert into the sequential approval pipeline.</p>
            <div className="space-y-2">
              {APPROVER_TYPES.map(({ type, label, icon: Icon, desc }) => (
                <button
                  key={type}
                  onClick={() => addStep(type)}
                  disabled={selectedDefinition?.status !== 'DRAFT'}
                  className="w-full text-left p-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-brand-500/50 rounded-xl transition-all group flex items-start gap-2.5 disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-brand-500/30 text-brand-400">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-brand-300 flex items-center justify-between">
                      {label}
                      <Plus className="w-3 h-3 text-slate-500 group-hover:text-brand-400" />
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Canvas Area */}
        <main className="bg-slate-950 border border-slate-800/80 rounded-2xl relative flex flex-col overflow-hidden select-none">
          {/* Canvas Floating Controls */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-1 shadow-xl">
            <button
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                autoArrange(nodes);
              }}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
              title="Reset View & Auto-Arrange"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Graphical Pipeline Canvas Container */}
          <div
            className="flex-1 overflow-auto relative p-12 flex items-center min-w-full"
            style={{
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            <div
              className="flex items-center gap-6 min-w-max transition-transform origin-left py-8"
              style={{ transform: `scale(${zoom})` }}
            >
              {nodes.map((node, index) => {
                const isSelected = selectedNodeId === node.id;
                const isTrigger = node.type === 'TRIGGER';
                const isTerminal = node.type === 'TERMINAL';
                const isApproval = node.type === 'APPROVAL_STEP';

                return (
                  <React.Fragment key={node.id}>
                    {/* Node Card */}
                    <div
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`relative w-64 p-4 rounded-2xl border transition-all cursor-pointer shadow-xl ${
                        isSelected
                          ? 'bg-slate-900 border-brand-500 shadow-brand-500/10 ring-2 ring-brand-500/20'
                          : isTrigger
                          ? 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600'
                          : isTerminal
                          ? 'bg-slate-900/90 border-emerald-500/40 hover:border-emerald-500/60'
                          : 'bg-slate-900/95 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md ${
                            isTrigger
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : isTerminal
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-brand-500/20 text-brand-300'
                          }`}
                        >
                          {isTrigger ? 'Trigger' : isTerminal ? 'Terminal' : `Stage ${node.data.sequence || index}`}
                        </span>

                        {isApproval && selectedDefinition?.status === 'DRAFT' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStep(node.id, 'LEFT');
                              }}
                              className="text-slate-400 hover:text-white p-1 text-[10px]"
                              title="Move Earlier"
                            >
                              ◀
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStep(node.id, 'RIGHT');
                              }}
                              className="text-slate-400 hover:text-white p-1 text-[10px]"
                              title="Move Later"
                            >
                              ▶
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeStep(node.id);
                              }}
                              className="text-rose-400 hover:text-rose-300 p-1"
                              title="Delete Step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-white tracking-tight truncate">{node.data.label}</h3>

                      {/* Body Attributes */}
                      {isApproval && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Approver:</span>
                            <span className="font-medium text-slate-200 truncate max-w-[140px]">
                              {node.data.approverType === 'ROLE'
                                ? `Role: ${node.data.approverReference || 'Unspecified'}`
                                : node.data.approverType}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">SLA:</span>
                            <span className="font-medium text-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {node.data.slaHours ? `${node.data.slaHours} hours` : 'No SLA'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Approvals:</span>
                            <span className="font-medium text-slate-300">
                              {node.data.minimumApprovals || 1} required
                            </span>
                          </div>
                        </div>
                      )}

                      {isTrigger && (
                        <p className="text-[11px] text-slate-400 mt-2">
                          Initiated when an employee submits a <span className="text-brand-300 font-mono">{module}</span> request.
                        </p>
                      )}

                      {isTerminal && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Request Approved & State Executed
                        </div>
                      )}
                    </div>

                    {/* Connector Arrow */}
                    {index < nodes.length - 1 && (
                      <div className="flex items-center justify-center text-slate-600 animate-pulse">
                        <ArrowRight className="w-6 h-6 text-brand-500/70" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </main>

        {/* Right Step Inspector Sidebar */}
        <aside className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 flex flex-col space-y-4 overflow-y-auto">
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase text-slate-400">Step Inspector</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {selectedNode ? `Configuring: ${selectedNode.data.label}` : 'Select a node on the canvas to configure properties.'}
            </p>
          </div>

          <hr className="border-slate-800" />

          {selectedNode && selectedNode.type === 'APPROVAL_STEP' ? (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Step Label</label>
                <input
                  type="text"
                  value={selectedNode.data.label}
                  disabled={selectedDefinition?.status !== 'DRAFT'}
                  onChange={(e) => updateSelectedNode('label', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-medium">Approver Routing Type</label>
                <select
                  value={selectedNode.data.approverType}
                  disabled={selectedDefinition?.status !== 'DRAFT'}
                  onChange={(e) => updateSelectedNode('approverType', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 disabled:opacity-60"
                >
                  <option value="REPORTING_MANAGER">Reporting Manager</option>
                  <option value="DEPARTMENT_HEAD">Department Head</option>
                  <option value="FINANCE">Finance / Payroll Admin</option>
                  <option value="ROLE">System Role</option>
                  <option value="USER">Specific User UUID</option>
                </select>
              </div>

              {selectedNode.data.approverType === 'ROLE' && (
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">System Role Code</label>
                  <input
                    type="text"
                    value={selectedNode.data.approverReference || ''}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    onChange={(e) => updateSelectedNode('approverReference', e.target.value)}
                    placeholder="e.g. HR_MANAGER, COMPANY_ADMIN"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 font-mono disabled:opacity-60"
                  />
                </div>
              )}

              {selectedNode.data.approverType === 'USER' && (
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">User UUID</label>
                  <input
                    type="text"
                    value={selectedNode.data.approverReference || ''}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    onChange={(e) => updateSelectedNode('approverReference', e.target.value)}
                    placeholder="User ID UUID"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 font-mono disabled:opacity-60"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">Min Approvals</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={selectedNode.data.minimumApprovals || 1}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    onChange={(e) => updateSelectedNode('minimumApprovals', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">SLA (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="8760"
                    value={selectedNode.data.slaHours || 24}
                    disabled={selectedDefinition?.status !== 'DRAFT'}
                    onChange={(e) => updateSelectedNode('slaHours', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="allowDelegation"
                  checked={selectedNode.data.allowDelegation ?? true}
                  disabled={selectedDefinition?.status !== 'DRAFT'}
                  onChange={(e) => updateSelectedNode('allowDelegation', e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-brand-500 focus:ring-brand-500"
                />
                <label htmlFor="allowDelegation" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Allow Out-of-Office Delegation
                </label>
              </div>
            </div>
          ) : selectedNode?.type === 'TRIGGER' ? (
            <div className="space-y-3 text-xs text-slate-300">
              <p>The Trigger initiates this workflow whenever an event for module <strong className="text-brand-300">{module}</strong> is submitted by an authorized employee.</p>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                Incoming triggers automatically seed Step 1 as <span className="text-amber-300 font-mono">PENDING</span> and notify eligible approvers.
              </div>
            </div>
          ) : selectedNode?.type === 'TERMINAL' ? (
            <div className="space-y-3 text-xs text-slate-300">
              <p>When all sequential approval stages conclude successfully, the workflow transitions to <strong className="text-emerald-300">APPROVED</strong>.</p>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                The originating subject (Leave, Expense, Service Request, Regularization) is atomically updated and side-effects are committed.
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
              Click on any node in the canvas to inspect its parameters.
            </div>
          )}
        </aside>
      </div>

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="text-brand-400 w-5 h-5" />
                  Pre-Built Workflow Templates
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a verified, production-grade template to instantiate as a draft.
                </p>
              </div>
              <button onClick={() => setShowTemplatesModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {templates.map((tpl) => (
                <div
                  key={tpl.key}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-brand-500/20 text-brand-300 rounded-md">
                        {tpl.module}
                      </span>
                      <h3 className="text-sm font-bold text-white">{tpl.name}</h3>
                    </div>
                    <p className="text-xs text-slate-400">{tpl.description}</p>
                  </div>
                  <button
                    onClick={() => void instantiateTemplate(tpl.key)}
                    disabled={busy}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold shrink-0 shadow-lg shadow-brand-500/20"
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal */}
      {showValidationModal && validationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {validationResult.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                )}
                <h2 className="text-base font-bold text-white">
                  {validationResult.valid ? 'Validation Passed' : 'Validation Issues Found'}
                </h2>
              </div>
              <button onClick={() => setShowValidationModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {validationResult.valid ? (
              <p className="text-xs text-emerald-300">
                The visual workflow graph is completely valid and ready for publishing into production.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {validationResult.errors.map((err, i) => (
                  <div key={i} className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                    <span className="font-bold font-mono text-[10px] block mb-1">[{err.code}]</span>
                    {err.message}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowValidationModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Dry-Run Simulation Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">Workflow Dry-Run Simulator</h2>
              </div>
              <button onClick={() => setShowSimulateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Simulate approval resolution without creating workflow instances, notifications, or mutating payroll.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 font-medium">Sample Requester User ID (UUID)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter employee User UUID"
                  value={sampleUserId}
                  onChange={(e) => setSampleUserId(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white"
                />
                <button
                  onClick={() => void runSimulation()}
                  disabled={simulating}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20"
                >
                  {simulating ? 'Simulating...' : 'Run Dry-Run'}
                </button>
              </div>
            </div>

            {simulationResult && (
              <div className="mt-4 border-t border-slate-800 pt-3 space-y-3 max-h-60 overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Simulation Trace:</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                      simulationResult.feasible
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    Outcome: {simulationResult.terminalOutcome}
                  </span>
                </div>

                <div className="space-y-2">
                  {simulationResult.trace.map((step) => (
                    <div
                      key={step.sequence}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-200">
                          {step.sequence}. {step.stepName} ({step.approverType})
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            step.status === 'RESOLVED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Resolved {step.resolvedApproverCount} approver(s):{' '}
                        {step.resolvedApprovers.map((a) => a.email || a.id).join(', ') || 'None found'}
                      </div>
                      {step.warning && <p className="text-[10px] text-rose-400">{step.warning}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowSimulateModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
