import { z } from "zod";

export const TaskCreateSchema = z.object({
    title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    status: z.enum([
        "To Be Started",
        "In Progress",
        "Completed",
        "Blocked"
    ]).optional(),
    category: z.string().trim().optional().nullable(),
    priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
    link_url: z.string().url().optional().nullable(),
    assigned_to: z.string().optional().nullable(),
    eta_end: z.string().optional().nullable(),
    remarks: z.string().optional().nullable()
}).strict();

export const TaskUpdateSchema = TaskCreateSchema.partial().extend({
    id: z.string().optional(),
    updated_at: z.union([z.string(), z.date()]).optional()
}).strict();

export const TaskBulkSchema = z.object({
    tasks: z.array(TaskCreateSchema.omit({ status: true }))
}).strict();
