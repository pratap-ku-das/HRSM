import type { WorkflowModule, WorkflowDefinition } from './index';

export type VisualNodeType = 'TRIGGER' | 'APPROVAL_STEP' | 'TERMINAL';

export interface VisualNodeData {
  label: string;
  description?: string;
  module?: WorkflowModule;
  stepId?: string;
  temporaryId?: string;
  sequence?: number;
  approverType?: 'REPORTING_MANAGER' | 'DEPARTMENT_HEAD' | 'FINANCE' | 'ROLE' | 'USER';
  approverReference?: string | null;
  minimumApprovals?: number;
  slaHours?: number | null;
  allowDelegation?: boolean;
  conditions?: Record<string, unknown> | null;
  outcome?: 'APPROVED' | 'REJECTED';
}

export interface VisualNode {
  id: string;
  type: VisualNodeType;
  position: { x: number; y: number };
  data: VisualNodeData;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
}

export interface CanvasLayout {
  version: number;
  viewport?: { x: number; y: number; zoom: number };
  nodes: VisualNode[];
  edges: VisualEdge[];
}

export interface WorkflowValidationError {
  code: string;
  nodeId?: string;
  message: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  warnings: string[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  module: WorkflowModule;
  description: string;
  code: string;
  canvasLayout: CanvasLayout;
}

export interface SimulationTraceStep {
  sequence: number;
  stepName: string;
  approverType: string;
  approverReference?: string | null;
  minimumApprovals: number;
  slaHours: number | null;
  resolvedApproverCount: number;
  resolvedApprovers: Array<{ id: string; name?: string; email?: string; role?: string }>;
  status: 'RESOLVED' | 'UNRESOLVED';
  warning?: string;
}

export interface SimulationResult {
  definitionId: string;
  module: WorkflowModule;
  requesterUserId: string;
  trace: SimulationTraceStep[];
  feasible: boolean;
  terminalOutcome: 'APPROVED' | 'BLOCKED';
}

export interface WorkflowDesignerData {
  definition: WorkflowDefinition;
  graph: CanvasLayout;
}
