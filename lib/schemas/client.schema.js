import { z } from "zod";

export const ClientSchema = z.object({
    name: z.string().trim().min(1),
    service_type: z.string().trim().min(1),
    portal_password: z.string().optional().nullable(),
    slug: z.string().optional(), // Auto-generated usually, but sometimes passed
    // NPL / TPL / CPL — team member IDs (references to /api/team)
    npl_member_id: z.string().uuid().optional().nullable(),
    tpl_member_id: z.string().uuid().optional().nullable(),
    cpl_member_id: z.string().uuid().optional().nullable(),
}).strict();
