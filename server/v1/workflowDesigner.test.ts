import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowRouter } from "./workflows.js";
import {
  validateWorkflowGraph,
  compileGraphToWorkflow,
  adaptWorkflowToGraph,
  simulateWorkflowTrace,
  PREBUILT_TEMPLATES,
  type CanvasLayout,
} from "./workflowDesignerEngine.js";

const appFor = (permissions: string[], prisma: unknown, companyId = "tenant-a", userId = "user-a") => {
  const app = express();
  app.use(express.json());
  const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, {
      auth: {
        id: userId,
        companyId,
        role: "COMPANY_ADMIN",
        employeeId: "employee-a",
        permissions,
      },
      requestId: "test-req",
    });
    next();
  };
  app.use("/api/v1", createWorkflowRouter(prisma as never, authenticate));
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(400).json({ error: { code: "VALIDATION_ERROR" } }),
  );
  return app;
};

describe("P2.4 Workflow Designer Engine - Graph Validator & Adapter", () => {
  it("rejects an empty graph", async () => {
    const layout: CanvasLayout = { version: 1, nodes: [], edges: [] };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "EMPTY_GRAPH")).toBe(true);
  });

  it("rejects a graph missing a trigger node", async () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: "step_1",
          type: "APPROVAL_STEP",
          position: { x: 100, y: 100 },
          data: { label: "Mgr Review", approverType: "REPORTING_MANAGER" },
        },
        {
          id: "term",
          type: "TERMINAL",
          position: { x: 300, y: 100 },
          data: { label: "Approved", outcome: "APPROVED" },
        },
      ],
      edges: [{ id: "e1", source: "step_1", target: "term" }],
    };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "TRIGGER_MISSING")).toBe(true);
  });

  it("rejects a graph missing a terminal node", async () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: "trig",
          type: "TRIGGER",
          position: { x: 50, y: 100 },
          data: { label: "Submitted", module: "LEAVE" },
        },
        {
          id: "step_1",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 100 },
          data: { label: "Mgr Review", approverType: "REPORTING_MANAGER" },
        },
      ],
      edges: [{ id: "e1", source: "trig", target: "step_1" }],
    };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "TERMINAL_MISSING")).toBe(true);
  });

  it("rejects parallel branching because the backend engine is strictly sequential", async () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: "trig",
          type: "TRIGGER",
          position: { x: 50, y: 100 },
          data: { label: "Submitted", module: "LEAVE" },
        },
        {
          id: "step_1",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 50 },
          data: { label: "Mgr Review", approverType: "REPORTING_MANAGER" },
        },
        {
          id: "step_2",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 150 },
          data: { label: "HR Review", approverType: "ROLE", approverReference: "HR_MANAGER" },
        },
        {
          id: "term",
          type: "TERMINAL",
          position: { x: 400, y: 100 },
          data: { label: "Approved", outcome: "APPROVED" },
        },
      ],
      // Trigger connects to BOTH step_1 and step_2 (Parallel branch)
      edges: [
        { id: "e1", source: "trig", target: "step_1" },
        { id: "e2", source: "trig", target: "step_2" },
        { id: "e3", source: "step_1", target: "term" },
        { id: "e4", source: "step_2", target: "term" },
      ],
    };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "BRANCHING_UNSUPPORTED")).toBe(true);
  });

  it("rejects circular loops", async () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: "trig",
          type: "TRIGGER",
          position: { x: 50, y: 100 },
          data: { label: "Submitted", module: "LEAVE" },
        },
        {
          id: "step_1",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 100 },
          data: { label: "Mgr Review", approverType: "REPORTING_MANAGER" },
        },
        {
          id: "step_2",
          type: "APPROVAL_STEP",
          position: { x: 350, y: 100 },
          data: { label: "HR Review", approverType: "ROLE", approverReference: "HR_MANAGER" },
        },
        {
          id: "term",
          type: "TERMINAL",
          position: { x: 500, y: 100 },
          data: { label: "Approved", outcome: "APPROVED" },
        },
      ],
      // step_2 loops back to step_1
      edges: [
        { id: "e1", source: "trig", target: "step_1" },
        { id: "e2", source: "step_1", target: "step_2" },
        { id: "e3", source: "step_2", target: "step_1" },
      ],
    };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("rejects orphan/disconnected nodes", async () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: "trig",
          type: "TRIGGER",
          position: { x: 50, y: 100 },
          data: { label: "Submitted", module: "LEAVE" },
        },
        {
          id: "step_1",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 100 },
          data: { label: "Mgr Review", approverType: "REPORTING_MANAGER" },
        },
        {
          id: "orphan_step",
          type: "APPROVAL_STEP",
          position: { x: 200, y: 300 },
          data: { label: "Floating Step", approverType: "REPORTING_MANAGER" },
        },
        {
          id: "term",
          type: "TERMINAL",
          position: { x: 400, y: 100 },
          data: { label: "Approved", outcome: "APPROVED" },
        },
      ],
      edges: [
        { id: "e1", source: "trig", target: "step_1" },
        { id: "e2", source: "step_1", target: "term" },
      ],
    };
    const res = await validateWorkflowGraph(layout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "ORPHAN_NODE")).toBe(true);
  });

  it("validates and compiles a clean sequential workflow graph", async () => {
    const template = PREBUILT_TEMPLATES.LEAVE_TWO_TIER;
    const res = await validateWorkflowGraph(template.canvasLayout, "LEAVE", "tenant-a");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);

    const compiled = compileGraphToWorkflow(template.canvasLayout);
    expect(compiled.steps).toHaveLength(2);
    expect(compiled.steps[0].name).toBe("Reporting Manager Review");
    expect(compiled.steps[0].approverType).toBe("REPORTING_MANAGER");
    expect(compiled.steps[1].name).toBe("HR Administration Approval");
    expect(compiled.steps[1].approverType).toBe("ROLE");
    expect(compiled.steps[1].approverReference).toBe("HR_MANAGER");
  });

  it("automatically generates horizontal layout for legacy workflows without canvasLayout", () => {
    const legacyDefinition: any = {
      id: "def-legacy-1",
      companyId: "tenant-a",
      module: "LEAVE",
      name: "Legacy Leave Workflow",
      code: "LEAVE_LEGACY",
      version: 1,
      status: "ACTIVE",
      criteria: null, // Zero saved layout
      steps: [
        {
          id: "step-1",
          sequence: 1,
          name: "Manager Approval",
          approverType: "REPORTING_MANAGER",
          approverReference: null,
          minimumApprovals: 1,
          slaHours: 24,
          allowDelegation: true,
          conditions: null,
        },
        {
          id: "step-2",
          sequence: 2,
          name: "Finance Check",
          approverType: "FINANCE",
          approverReference: null,
          minimumApprovals: 1,
          slaHours: 48,
          allowDelegation: false,
          conditions: null,
        },
      ],
    };

    const adapted = adaptWorkflowToGraph(legacyDefinition);
    expect(adapted.nodes).toHaveLength(4); // Trigger + Step 1 + Step 2 + Terminal
    expect(adapted.edges).toHaveLength(3);
    expect(adapted.nodes[0].type).toBe("TRIGGER");
    expect(adapted.nodes[1].data.stepId).toBe("step-1");
    expect(adapted.nodes[2].data.stepId).toBe("step-2");
    expect(adapted.nodes[3].type).toBe("TERMINAL");
  });
});

describe("P2.4 Workflow Designer HTTP Endpoints - RBAC, Concurrency & Lifecycle", () => {
  it("denies access to designer endpoints without workflow.manage", async () => {
    const app = appFor([], {});
    const res = await request(app).get("/api/v1/workflows/templates");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns prebuilt workflow templates for authorized managers", async () => {
    const app = appFor(["workflow.manage"], {});
    const res = await request(app).get("/api/v1/workflows/templates");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.some((t: any) => t.key === "LEAVE_TWO_TIER")).toBe(true);
  });

  it("instantiates a new draft workflow from a prebuilt template", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "def-new-draft",
      ...data,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: data.steps.create.map((s: any, idx: number) => ({ id: `step-${idx + 1}`, ...s })),
    }));
    const auditCreate = vi.fn().mockResolvedValue({});

    const prisma = {
      workflowDefinition: { findFirst, create },
      auditLog: { create: auditCreate },
    };

    const app = appFor(["workflow.manage"], prisma);
    const res = await request(app).post("/api/v1/workflows/templates/LEAVE_TWO_TIER/instantiate").send();

    expect(res.status).toBe(201);
    expect(res.body.data.definition.status).toBe("DRAFT");
    expect(res.body.data.graph.nodes).toBeDefined();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "WORKFLOW_DRAFT_CREATED",
          category: "WORKFLOW",
        }),
      }),
    );
  });

  it("rejects editing a draft when an optimistic locking conflict occurs", async () => {
    const existingDraft = {
      id: "def-draft-1",
      companyId: "tenant-a",
      module: "LEAVE",
      name: "Leave Approval",
      code: "LEAVE_STD",
      version: 1,
      status: "DRAFT",
      updatedAt: new Date("2026-10-02T15:00:00Z"),
      steps: [{ id: "step-1", sequence: 1, name: "Mgr", approverType: "REPORTING_MANAGER" }],
    };

    const prisma = {
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue(existingDraft),
      },
    };

    const app = appFor(["workflow.manage"], prisma);
    // Client passes older expectedUpdatedAt (e.g. 14:00:00Z)
    const res = await request(app)
      .post("/api/v1/workflows/definitions/draft")
      .send({
        definitionId: "00000000-0000-4000-8000-000000000001",
        module: "LEAVE",
        name: "Leave Approval",
        code: "LEAVE_STD",
        expectedUpdatedAt: "2026-10-02T14:00:00Z",
        steps: [
          {
            name: "Manager Approval",
            approverType: "REPORTING_MANAGER",
            minimumApprovals: 1,
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WORKFLOW_EDIT_CONFLICT");
  });

  it("validates a draft workflow and returns actionable errors", async () => {
    const invalidDraft = {
      id: "def-draft-invalid",
      companyId: "tenant-a",
      module: "LEAVE",
      status: "DRAFT",
      code: "LEAVE_INVALID",
      version: 1,
      criteria: null,
      steps: [
        {
          id: "step-1",
          sequence: 1,
          name: "Invalid Role Step",
          approverType: "ROLE",
          approverReference: "", // Empty role!
          minimumApprovals: 1,
        },
      ],
    };

    const prisma = {
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue(invalidDraft),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const app = appFor(["workflow.manage"], prisma);
    const res = await request(app).post("/api/v1/workflows/definitions/def-draft-invalid/validate").send();

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.errors.some((e: any) => e.code === "ROLE_REFERENCE_REQUIRED")).toBe(true);
  });

  it("publishes a valid draft, retires the previous active version, and audits the transition", async () => {
    const validDraft = {
      id: "def-draft-valid",
      companyId: "tenant-a",
      module: "LEAVE",
      code: "LEAVE_STD",
      version: 2,
      status: "DRAFT",
      criteria: null,
      steps: [
        {
          id: "step-1",
          sequence: 1,
          name: "Manager Approval",
          approverType: "REPORTING_MANAGER",
          minimumApprovals: 1,
          slaHours: 24,
          allowDelegation: true,
        },
      ],
    };

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({ ...validDraft, status: "ACTIVE" });
    const auditCreate = vi.fn().mockResolvedValue({});

    const prisma = {
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue(validDraft),
        updateMany,
        update,
      },
      $transaction: vi.fn().mockImplementation((ops) => Promise.all(ops)),
      auditLog: { create: auditCreate },
    };

    const app = appFor(["workflow.manage"], prisma);
    const res = await request(app).post("/api/v1/workflows/definitions/def-draft-valid/publish").send();

    expect(res.status).toBe(200);
    expect(res.body.data.published).toBe(true);
    expect(res.body.data.status).toBe("ACTIVE");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "tenant-a",
          module: "LEAVE",
          status: "ACTIVE",
          id: { not: "def-draft-valid" },
        }),
        data: { status: "RETIRED" },
      }),
    );
  });

  it("executes side-effect-free dry-run simulation without creating instances or notifications", async () => {
    const definition = {
      id: "def-sim",
      companyId: "tenant-a",
      module: "LEAVE",
      steps: [
        {
          id: "step-1",
          sequence: 1,
          name: "Manager Review",
          approverType: "REPORTING_MANAGER",
          minimumApprovals: 1,
          slaHours: 24,
        },
      ],
    };

    const employee = {
      userId: "00000000-0000-4000-8000-000000000002",
      reportingManager: { userId: "00000000-0000-4000-8000-000000000003" },
      department: { headEmployeeId: null },
    };

    const managerUser = {
      id: "00000000-0000-4000-8000-000000000003",
      email: "manager@company.com",
      role: "TEAM_LEAD",
    };

    const prisma = {
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue(definition) },
      employee: { findFirst: vi.fn().mockResolvedValue(employee) },
      user: { findMany: vi.fn().mockResolvedValue([managerUser]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      // Critical: Ensure no instances or notifications are created
      workflowInstance: { create: vi.fn() },
      notification: { create: vi.fn() },
    };

    const app = appFor(["workflow.review"], prisma);
    const res = await request(app)
      .post("/api/v1/workflows/definitions/def-sim/simulate")
      .send({ sampleRequesterUserId: "00000000-0000-4000-8000-000000000002" });

    expect(res.status).toBe(200);
    expect(res.body.data.feasible).toBe(true);
    expect(res.body.data.terminalOutcome).toBe("APPROVED");
    expect(res.body.data.trace).toHaveLength(1);
    expect(res.body.data.trace[0].resolvedApprovers[0].email).toBe("manager@company.com");
    expect(prisma.workflowInstance.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
