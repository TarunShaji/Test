import { z } from "zod";

export const ContentSchema = z.object({
    blog_title: z.string().trim().min(1),
    client_id: z.string().uuid(),
    primary_keyword: z.string().trim().optional().nullable(),
    week: z.string().optional().nullable(),
    writer: z.string().optional().nullable(),
    blog_status: z.enum([
        "Draft",
        "In Progress",
        "Sent for Approval",
        "Published"
    ]).default("Draft"),
    topic_approval_status: z.enum(["Pending", "Approved", "Rejected"]).default("Pending"),
    blog_approval_status: z.enum(["Pending Review", "Approved", "Changes Required"]).default("Pending Review"),
    blog_internal_approval: z.enum(["Pending", "Approved"]).default("Pending"),
    client_link_visible_blog: z.boolean().default(false),
    blog_link: z.string().optional().nullable(),
    blog_client_feedback_note: z.string().optional().nullable(),
    blog_client_feedback_at: z.union([z.string(), z.date()]).optional().nullable(),
    published_date: z.string().optional().nullable(),
    blog_type: z.string().optional().nullable(),
    outline_status: z.enum(["Pending", "Submitted", "Approved", "Rejected"]).optional().nullable(),
    comments: z.string().optional().nullable(),
}).strict();

export const ContentUpdateSchema = ContentSchema.partial().extend({
    client_name: z.string().optional(),
    updated_at: z.union([z.string(), z.date()]).optional()
}).passthrough();
