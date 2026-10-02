import type {
  PrismaClient,
  Prisma,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowModule,
  WorkflowApproverType,
} from "@prisma/client";

export type VisualNodeType = "TRIGGER" | "APPROVAL_STEP" | "TERMINAL";

export interface VisualNodeData {
  label: string;
  description?: string;
  module?: WorkflowModule;
  stepId?: string;
  temporaryId?: string;
  sequence?: number;
  approverType?: WorkflowApproverType;
  approverReference?: string | null;
  minimumApprovals?: number;
  slaHours?: number | null;
  allowDelegation?: boolean;
  conditions?: Record<string, unknown> | null;
  outcome?: "APPROVED" | "REJECTED";
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

export interface CompiledWorkflowStep {
  name: string;
  approverType: WorkflowApproverType;
  approverReference?: string | null;
  minimumApprovals: number;
  slaHours?: number | null;
  allowDelegation: boolean;
  conditions?: Record<string, unknown> | null;
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  module: WorkflowModule;
  description: string;
  code: string;
  steps: CompiledWorkflowStep[];
  canvasLayout: CanvasLayout;
}

export const PREBUILT_TEMPLATES: Record<string, WorkflowTemplate> = {
  LEAVE_TWO_TIER: {
    key: "LEAVE_TWO_TIER",
    name: "Two-Tier Leave Approval",
    module: "LEAVE",
    code: "LEAVE_TWO_TIER",
    description: "Standard leave approval starting with Reporting Manager followed by HR Administration.",
    steps: [
      {
        name: "Reporting Manager Review",
        approverType: "REPORTING_MANAGER",
        approverReference: null,
        minimumApprovals: 1,
        slaHours: 24,
        allowDelegation: true,
      },
      {
        name: "HR Administration Approval",
        approverType: "ROLE",
        approverReference: "HR_MANAGER",
        minimumApprovals: 1,
        slaHours: 48,
        allowDelegation: true,
      },
    ],
    canvasLayout: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "node_trigger",
          type: "TRIGGER",
          position: { x: 80, y: 200 },
          data: { label: "Leave Request Submitted", module: "LEAVE" },
        },
        {
          id: "node_step_1",
          type: "APPROVAL_STEP",
          position: { x: 360, y: 200 },
          data: {
            label: "Reporting Manager Review",
            sequence: 1,
            approverType: "REPORTING_MANAGER",
            minimumApprovals: 1,
            slaHours: 24,
            allowDelegation: true,
          },
        },
        {
          id: "node_step_2",
          type: "APPROVAL_STEP",
          position: { x: 640, y: 200 },
          data: {
            label: "HR Administration Approval",
            sequence: 2,
            approverType: "ROLE",
            approverReference: "HR_MANAGER",
            minimumApprovals: 1,
            slaHours: 48,
            allowDelegation: true,
          },
        },
        {
          id: "node_terminal_approved",
          type: "TERMINAL",
          position: { x: 920, y: 200 },
          data: { label: "Leave Approved", outcome: "APPROVED" },
        },
      ],
      edges: [
        { id: "e1", source: "node_trigger", target: "node_step_1" },
        { id: "e2", source: "node_step_1", target: "node_step_2" },
        { id: "e3", source: "node_step_2", target: "node_terminal_approved" },
      ],
    },
  },
  EXPENSE_TWO_TIER: {
    key: "EXPENSE_TWO_TIER",
    name: "Two-Tier Expense Approval",
    module: "EXPENSE",
    code: "EXPENSE_TWO_TIER",
    description: "Expense reimbursement workflow routing to Reporting Manager and Finance/Payroll Admin.",
    steps: [
      {
        name: "Manager Expense Review",
        approverType: "REPORTING_MANAGER",
        approverReference: null,
        minimumApprovals: 1,
        slaHours: 24,
        allowDelegation: true,
      },
      {
        name: "Finance Disbursement Approval",
        approverType: "FINANCE",
        approverReference: null,
        minimumApprovals: 1,
        slaHours: 48,
        allowDelegation: false,
      },
    ],
    canvasLayout: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "node_trigger",
          type: "TRIGGER",
          position: { x: 80, y: 200 },
          data: { label: "Expense Claim Submitted", module: "EXPENSE" },
        },
        {
          id: "node_step_1",
          type: "APPROVAL_STEP",
          position: { x: 360, y: 200 },
          data: {
            label: "Manager Expense Review",
            sequence: 1,
            approverType: "REPORTING_MANAGER",
            minimumApprovals: 1,
            slaHours: 24,
            allowDelegation: true,
          },
        },
        {
          id: "node_step_2",
          type: "APPROVAL_STEP",
          position: { x: 640, y: 200 },
          data: {
            label: "Finance Disbursement Approval",
            sequence: 2,
            approverType: "FINANCE",
            minimumApprovals: 1,
            slaHours: 48,
            allowDelegation: false,
          },
        },
        {
          id: "node_terminal_approved",
          type: "TERMINAL",
          position: { x: 920, y: 200 },
          data: { label: "Expense Approved", outcome: "APPROVED" },
        },
      ],
      edges: [
        { id: "e1", source: "node_trigger", target: "node_step_1" },
        { id: "e2", source: "node_step_1", target: "node_step_2" },
        { id: "e3", source: "node_step_2", target: "node_terminal_approved" },
      ],
    },
  },
  ATTENDANCE_SLA: {
    key: "ATTENDANCE_SLA",
    name: "Attendance Regularization with SLA",
    module: "ATTENDANCE_CORRECTION",
    code: "ATTENDANCE_SLA",
    description: "Rapid 24-hour SLA attendance punch regularization by the reporting manager.",
    steps: [
      {
        name: "Reporting Manager Review",
        approverType: "REPORTING_MANAGER",
        approverReference: null,
        minimumApprovals: 1,
        slaHours: 24,
        allowDelegation: true,
      },
    ],
    canvasLayout: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "node_trigger",
          type: "TRIGGER",
          position: { x: 80, y: 200 },
          data: { label: "Attendance Regularization Submitted", module: "ATTENDANCE_CORRECTION" },
        },
        {
          id: "node_step_1",
          type: "APPROVAL_STEP",
          position: { x: 360, y: 200 },
          data: {
            label: "Reporting Manager Review",
            sequence: 1,
            approverType: "REPORTING_MANAGER",
            minimumApprovals: 1,
            slaHours: 24,
            allowDelegation: true,
          },
        },
        {
          id: "node_terminal_approved",
          type: "TERMINAL",
          position: { x: 640, y: 200 },
          data: { label: "Regularization Approved", outcome: "APPROVED" },
        },
      ],
      edges: [
        { id: "e1", source: "node_trigger", target: "node_step_1" },
        { id: "e2", source: "node_step_1", target: "node_terminal_approved" },
      ],
    },
  },
};

/**
 * Validates a visual workflow graph strictly against the sequential execution model.
 * Rejects arbitrary branching, cycles, missing triggers, missing terminals, and invalid steps.
 */
export async function validateWorkflowGraph(
  layout: CanvasLayout,
  module: WorkflowModule,
  companyId: string,
  prisma?: PrismaClient,
): Promise<WorkflowValidationResult> {
  const errors: WorkflowValidationError[] = [];
  const warnings: string[] = [];

  const nodes = layout.nodes || [];
  const edges = layout.edges || [];

  if (nodes.length === 0) {
    errors.push({ code: "EMPTY_GRAPH", message: "Workflow graph contains no nodes." });
    return { valid: false, errors, warnings };
  }

  // 1. Trigger validation
  const triggerNodes = nodes.filter((n) => n.type === "TRIGGER");
  if (triggerNodes.length === 0) {
    errors.push({ code: "TRIGGER_MISSING", message: "Graph must have exactly one Trigger entry node." });
  } else if (triggerNodes.length > 1) {
    errors.push({
      code: "MULTIPLE_TRIGGERS",
      nodeId: triggerNodes[1].id,
      message: "Multiple trigger nodes are not supported. Exactly one trigger node is required.",
    });
  }

  // 2. Terminal validation
  const terminalNodes = nodes.filter((n) => n.type === "TERMINAL");
  if (terminalNodes.length === 0) {
    errors.push({ code: "TERMINAL_MISSING", message: "Graph must have at least one Terminal outcome node." });
  }

  // 3. Approval steps validation
  const stepNodes = nodes.filter((n) => n.type === "APPROVAL_STEP");
  if (stepNodes.length === 0) {
    errors.push({ code: "NO_APPROVAL_STEPS", message: "Workflow must have at least one Approval Step." });
  } else if (stepNodes.length > 20) {
    errors.push({ code: "TOO_MANY_STEPS", message: "Workflow cannot exceed 20 approval steps." });
  }

  // 4. Node property validation
  for (const step of stepNodes) {
    if (!step.data.label || step.data.label.trim().length === 0) {
      errors.push({
        code: "STEP_NAME_REQUIRED",
        nodeId: step.id,
        message: `Approval step node "${step.id}" is missing a name.`,
      });
    }

    if (!step.data.approverType) {
      errors.push({
        code: "APPROVER_TYPE_REQUIRED",
        nodeId: step.id,
        message: `Step "${step.data.label || step.id}" must specify an approver type.`,
      });
    } else {
      if (step.data.approverType === "ROLE" && (!step.data.approverReference || step.data.approverReference.trim().length === 0)) {
        errors.push({
          code: "ROLE_REFERENCE_REQUIRED",
          nodeId: step.id,
          message: `Step "${step.data.label}" specifies ROLE approver but has no role code.`,
        });
      }

      if (step.data.approverType === "USER") {
        if (!step.data.approverReference || step.data.approverReference.trim().length === 0) {
          errors.push({
            code: "USER_REFERENCE_REQUIRED",
            nodeId: step.id,
            message: `Step "${step.data.label}" specifies USER approver but has no user UUID.`,
          });
        } else if (prisma) {
          // Verify tenant ownership of the user
          const user = await prisma.user.findFirst({
            where: { id: step.data.approverReference, companyId },
          });
          if (!user) {
            errors.push({
              code: "REFERENCED_USER_INVALID",
              nodeId: step.id,
              message: `Step "${step.data.label}" references a user ID not found in this company.`,
            });
          }
        }
      }
    }

    if (step.data.minimumApprovals !== undefined && (step.data.minimumApprovals < 1 || step.data.minimumApprovals > 20)) {
      errors.push({
        code: "MINIMUM_APPROVALS_INVALID",
        nodeId: step.id,
        message: `Step "${step.data.label}" minimum approvals must be between 1 and 20.`,
      });
    }

    if (step.data.slaHours !== undefined && step.data.slaHours !== null && (step.data.slaHours < 1 || step.data.slaHours > 8760)) {
      errors.push({
        code: "SLA_HOURS_INVALID",
        nodeId: step.id,
        message: `Step "${step.data.label}" SLA hours must be between 1 and 8760 (1 year).`,
      });
    }
  }

  // 5. Topology & Connection validation
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of edges) {
    if (!outgoing.has(edge.source)) {
      errors.push({
        code: "EDGE_SOURCE_UNKNOWN",
        message: `Edge ${edge.id} references non-existent source node ${edge.source}.`,
      });
      continue;
    }
    if (!incoming.has(edge.target)) {
      errors.push({
        code: "EDGE_TARGET_UNKNOWN",
        message: `Edge ${edge.id} references non-existent target node ${edge.target}.`,
      });
      continue;
    }

    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }

  // Strict Sequential Check: No node may have >1 outgoing executable edge
  for (const [nodeId, targets] of outgoing.entries()) {
    if (targets.length > 1) {
      errors.push({
        code: "BRANCHING_UNSUPPORTED",
        nodeId,
        message: `Node "${nodeId}" has ${targets.length} outgoing paths. Parallel and conditional branching are not supported by the sequential approval engine. Workflows must proceed in an ordered linear pipeline.`,
      });
    }
  }

  // Trigger must have 0 incoming and exactly 1 outgoing
  if (triggerNodes.length === 1) {
    const triggerId = triggerNodes[0].id;
    if ((incoming.get(triggerId) || []).length > 0) {
      errors.push({
        code: "TRIGGER_HAS_INCOMING",
        nodeId: triggerId,
        message: "Trigger node cannot have incoming edges.",
      });
    }
    if ((outgoing.get(triggerId) || []).length === 0) {
      errors.push({
        code: "TRIGGER_DISCONNECTED",
        nodeId: triggerId,
        message: "Trigger node must connect to the first approval step.",
      });
    }
  }

  // Terminal nodes must have 0 outgoing
  for (const term of terminalNodes) {
    if ((outgoing.get(term.id) || []).length > 0) {
      errors.push({
        code: "TERMINAL_HAS_OUTGOING",
        nodeId: term.id,
        message: "Terminal outcome nodes cannot have outgoing edges.",
      });
    }
    if ((incoming.get(term.id) || []).length === 0) {
      errors.push({
        code: "TERMINAL_UNREACHABLE",
        nodeId: term.id,
        message: `Terminal node "${term.data.label || term.id}" is unreachable.`,
      });
    }
  }

  // Cycle detection & reachability check
  if (triggerNodes.length === 1) {
    const visited = new Set<string>();
    let curr: string | undefined = triggerNodes[0].id;

    while (curr) {
      if (visited.has(curr)) {
        errors.push({
          code: "CYCLE_DETECTED",
          nodeId: curr,
          message: `Cycle detected in workflow graph at node "${curr}". Approval flows must be acyclic.`,
        });
        break;
      }
      visited.add(curr);
      const nextNodes = outgoing.get(curr) || [];
      curr = nextNodes.length > 0 ? nextNodes[0] : undefined;
    }

    // Check for orphan nodes not traversed in the main pipeline
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        errors.push({
          code: "ORPHAN_NODE",
          nodeId: node.id,
          message: `Node "${node.data.label || node.id}" is disconnected from the main execution pipeline.`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Compiles a validated visual graph into the ordered WorkflowStepInput[] expected by the backend engine.
 */
export function compileGraphToWorkflow(
  layout: CanvasLayout,
): { steps: CompiledWorkflowStep[]; canvasLayout: CanvasLayout } {
  const nodes = layout.nodes || [];
  const edges = layout.edges || [];

  const triggerNode = nodes.find((n) => n.type === "TRIGGER");
  if (!triggerNode) {
    throw new Error("Cannot compile graph without a trigger node.");
  }

  const outgoing = new Map<string, string>();
  for (const edge of edges) {
    outgoing.set(edge.source, edge.target);
  }

  const nodeMap = new Map<string, VisualNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const compiledSteps: CompiledWorkflowStep[] = [];
  const updatedNodes: VisualNode[] = [];

  // Traverse sequentially from Trigger
  let currId: string | undefined = outgoing.get(triggerNode.id);
  let seq = 1;

  updatedNodes.push(triggerNode);

  while (currId) {
    const currNode = nodeMap.get(currId);
    if (!currNode) break;

    if (currNode.type === "APPROVAL_STEP") {
      const step: CompiledWorkflowStep = {
        name: currNode.data.label.trim(),
        approverType: currNode.data.approverType || "REPORTING_MANAGER",
        approverReference: currNode.data.approverReference || null,
        minimumApprovals: currNode.data.minimumApprovals || 1,
        slaHours: currNode.data.slaHours || null,
        allowDelegation: currNode.data.allowDelegation ?? true,
        conditions: currNode.data.conditions || null,
      };
      compiledSteps.push(step);

      updatedNodes.push({
        ...currNode,
        data: {
          ...currNode.data,
          sequence: seq,
        },
      });
      seq++;
    } else if (currNode.type === "TERMINAL") {
      updatedNodes.push(currNode);
    }

    currId = outgoing.get(currId);
  }

  return {
    steps: compiledSteps,
    canvasLayout: {
      version: layout.version || 1,
      viewport: layout.viewport || { x: 0, y: 0, zoom: 1 },
      nodes: updatedNodes,
      edges,
    },
  };
}

/**
 * Adapts an existing database WorkflowDefinition and its WorkflowStep[] into a VisualWorkflowGraph.
 * If canvasLayout is already stored in criteria, it is respected.
 * If it's a legacy workflow without canvasLayout, a clean horizontal visual graph is generated automatically.
 */
export function adaptWorkflowToGraph(
  definition: WorkflowDefinition & { steps: WorkflowStep[] },
): CanvasLayout {
  const criteria = (definition.criteria || {}) as Record<string, unknown>;
  const savedLayout = criteria.canvasLayout as CanvasLayout | undefined;

  // If valid canvasLayout is already present, verify and return it
  if (savedLayout && Array.isArray(savedLayout.nodes) && savedLayout.nodes.length > 0) {
    // Reconcile node stepIds with database step ids by sequence
    const updatedNodes = savedLayout.nodes.map((node) => {
      if (node.type === "APPROVAL_STEP") {
        const matchingStep = definition.steps.find((s) => s.sequence === node.data.sequence);
        if (matchingStep) {
          return {
            ...node,
            data: {
              ...node.data,
              stepId: matchingStep.id,
              approverType: matchingStep.approverType,
              approverReference: matchingStep.approverReference,
              minimumApprovals: matchingStep.minimumApprovals,
              slaHours: matchingStep.slaHours,
              allowDelegation: matchingStep.allowDelegation,
              conditions: (matchingStep.conditions as Record<string, unknown>) || null,
            },
          };
        }
      }
      return node;
    });

    return {
      version: savedLayout.version || 1,
      viewport: savedLayout.viewport || { x: 0, y: 0, zoom: 1 },
      nodes: updatedNodes,
      edges: savedLayout.edges || [],
    };
  }

  // Legacy workflow without saved layout: generate synthetic horizontal pipeline
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];

  const triggerId = "node_trigger";
  nodes.push({
    id: triggerId,
    type: "TRIGGER",
    position: { x: 80, y: 220 },
    data: {
      label: `${definition.module} Submitted`,
      module: definition.module,
    },
  });

  const sortedSteps = [...definition.steps].sort((a, b) => a.sequence - b.sequence);
  let prevNodeId = triggerId;

  sortedSteps.forEach((step, idx) => {
    const stepNodeId = `node_step_${step.sequence}`;
    const xPos = 80 + (idx + 1) * 280;

    nodes.push({
      id: stepNodeId,
      type: "APPROVAL_STEP",
      position: { x: xPos, y: 220 },
      data: {
        stepId: step.id,
        label: step.name,
        sequence: step.sequence,
        approverType: step.approverType,
        approverReference: step.approverReference,
        minimumApprovals: step.minimumApprovals,
        slaHours: step.slaHours,
        allowDelegation: step.allowDelegation,
        conditions: (step.conditions as Record<string, unknown>) || null,
      },
    });

    edges.push({
      id: `edge_${prevNodeId}_to_${stepNodeId}`,
      source: prevNodeId,
      target: stepNodeId,
    });

    prevNodeId = stepNodeId;
  });

  const terminalId = "node_terminal_approved";
  const terminalX = 80 + (sortedSteps.length + 1) * 280;

  nodes.push({
    id: terminalId,
    type: "TERMINAL",
    position: { x: terminalX, y: 220 },
    data: {
      label: "Approved",
      outcome: "APPROVED",
    },
  });

  edges.push({
    id: `edge_${prevNodeId}_to_${terminalId}`,
    source: prevNodeId,
    target: terminalId,
  });

  return {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

export interface SimulationTraceStep {
  sequence: number;
  stepName: string;
  approverType: WorkflowApproverType;
  approverReference?: string | null;
  minimumApprovals: number;
  slaHours: number | null;
  resolvedApproverCount: number;
  resolvedApprovers: Array<{ id: string; name?: string; email?: string; role?: string }>;
  status: "RESOLVED" | "UNRESOLVED";
  warning?: string;
}

export interface SimulationResult {
  definitionId: string;
  module: WorkflowModule;
  requesterUserId: string;
  trace: SimulationTraceStep[];
  feasible: boolean;
  terminalOutcome: "APPROVED" | "BLOCKED";
}

/**
 * Pure, side-effect-free workflow simulation.
 * Resolves approvers for each step in sequence without creating WorkflowInstance, WorkflowStepInstance,
 * without sending notifications, and without mutating any database entities.
 */
export async function simulateWorkflowTrace(
  prisma: PrismaClient,
  companyId: string,
  definitionId: string,
  sampleRequesterUserId: string,
  resolver: (
    companyId: string,
    requesterUserId: string,
    type: WorkflowApproverType,
    reference?: string | null,
  ) => Promise<string[]>,
): Promise<SimulationResult> {
  const definition = await prisma.workflowDefinition.findFirst({
    where: { id: definitionId, companyId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  if (!definition) {
    throw Object.assign(new Error("Workflow definition not found."), {
      status: 404,
      code: "WORKFLOW_NOT_FOUND",
    });
  }

  const trace: SimulationTraceStep[] = [];
  let feasible = true;

  for (const step of definition.steps) {
    const userIds = await resolver(
      companyId,
      sampleRequesterUserId,
      step.approverType,
      step.approverReference,
    );

    const approvers: Array<{ id: string; name?: string; role?: string }> = [];
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, companyId },
        select: { id: true, email: true, role: true },
      });
      approvers.push(...users.map((u) => ({ id: u.id, name: u.email, email: u.email, role: u.role })));
    }

    const isResolved = userIds.length >= step.minimumApprovals;
    if (!isResolved) {
      feasible = false;
    }

    trace.push({
      sequence: step.sequence,
      stepName: step.name,
      approverType: step.approverType,
      approverReference: step.approverReference,
      minimumApprovals: step.minimumApprovals,
      slaHours: step.slaHours,
      resolvedApproverCount: userIds.length,
      resolvedApprovers: approvers,
      status: isResolved ? "RESOLVED" : "UNRESOLVED",
      warning:
        userIds.length < step.minimumApprovals
          ? `Requires ${step.minimumApprovals} approvers, but only ${userIds.length} could be resolved for this requester.`
          : undefined,
    });
  }

  return {
    definitionId: definition.id,
    module: definition.module,
    requesterUserId: sampleRequesterUserId,
    trace,
    feasible,
    terminalOutcome: feasible ? "APPROVED" : "BLOCKED",
  };
}
