import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'

export async function POST(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()

        // Core hardening: ensure idempotency by resetting collections optionally
        // or checking for existing data. For a thorough "seed", we'll clear sample data.

        // Only clear if specifically requested or if you want a clean slate every time.
        // For this hardening, we'll make it clean the main collections to avoid duplicates.
        await database.collection('team_members').deleteMany({})
        await database.collection('clients').deleteMany({})
        await database.collection('tasks').deleteMany({})
        await database.collection('reports').deleteMany({})
        await database.collection('content_items').deleteMany({})

        // Create admin user
        const passwordHash = await bcrypt.hash('admin123', 10)
        const adminId = uuidv4()
        await database.collection('team_members').insertMany([
            { id: adminId, name: 'Admin User', email: 'admin@agency.com', role: 'Admin', password_hash: passwordHash, is_active: true, created_at: new Date() },
            { id: uuidv4(), name: 'Sarah Chen', email: 'sarah@agency.com', role: 'SEO', password_hash: await bcrypt.hash('pass123', 10), is_active: true, created_at: new Date() },
            { id: uuidv4(), name: 'Mike Torres', email: 'mike@agency.com', role: 'Design', password_hash: await bcrypt.hash('pass123', 10), is_active: true, created_at: new Date() },
            { id: uuidv4(), name: 'Priya Nair', email: 'priya@agency.com', role: 'Tech', password_hash: await bcrypt.hash('pass123', 10), is_active: true, created_at: new Date() },
            { id: uuidv4(), name: 'James Lee', email: 'james@agency.com', role: 'Account Manager', password_hash: await bcrypt.hash('pass123', 10), is_active: true, created_at: new Date() },
        ])

        // Create sample clients
        const newClientIds = [uuidv4(), uuidv4(), uuidv4()]
        const now = new Date()
        await database.collection('clients').insertMany([
            { id: newClientIds[0], name: 'Bandolier', slug: 'bandolier', service_type: 'SEO + Email', portal_password: null, is_active: true, created_at: now },
            { id: newClientIds[1], name: 'Behno', slug: 'behno', service_type: 'SEO', portal_password: 'behno2025', is_active: true, created_at: now },
            { id: newClientIds[2], name: 'Warehouse Group', slug: 'warehouse-group', service_type: 'All', portal_password: null, is_active: true, created_at: now },
        ])

        const members = await database.collection('team_members').find({}).toArray()
        const getMemberId = (role) => members.find(m => m.role === role)?.id || null

        const tasks = [
            { id: uuidv4(), client_id: newClientIds[0], title: 'Publish 2 SEO Optimized Blogs', category: 'SEO & Content', status: 'In Progress', priority: 'P1', assigned_to: getMemberId('SEO'), duration_days: '5', eta_start: '2025-06-01', eta_end: '2025-06-07', remarks: 'Focus on long-tail keywords', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[0], title: 'Fix Core Web Vitals', category: 'Page Speed', status: 'Completed', priority: 'P0', assigned_to: getMemberId('Tech'), duration_days: '3', eta_start: '2025-06-03', eta_end: '2025-06-06', remarks: 'LCP needs improvement', link_url: 'https://pagespeed.web.dev', internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[0], title: 'Monthly Email Newsletter', category: 'Email Marketing', status: 'Completed', priority: 'P1', assigned_to: getMemberId('Design'), duration_days: '2', eta_start: '2025-05-28', eta_end: '2025-05-30', remarks: 'May edition sent', link_url: 'https://google.com', internal_approval: 'Approved', client_link_visible: true, client_approval: 'Approved', created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[0], title: 'Schema Markup Implementation', category: 'Technical SEO', status: 'To Be Started', priority: 'P2', assigned_to: getMemberId('Tech'), duration_days: '2-3', eta_start: '2025-06-10', eta_end: '2025-06-12', remarks: null, link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[1], title: 'Keyword Research & Mapping', category: 'SEO & Content', status: 'Completed', priority: 'P0', assigned_to: getMemberId('SEO'), duration_days: '4', eta_start: '2025-05-20', eta_end: '2025-05-24', remarks: 'Completed - 150 keywords mapped', link_url: 'https://docs.google.com', internal_approval: 'Approved', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[1], title: 'Homepage Redesign', category: 'Design', status: 'In Progress', priority: 'P1', assigned_to: getMemberId('Design'), duration_days: '7', eta_start: '2025-06-02', eta_end: '2025-06-09', remarks: 'Wireframes approved', link_url: 'https://figma.com', internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[1], title: 'Site Speed Optimization', category: 'Page Speed', status: 'Blocked', priority: 'P0', assigned_to: getMemberId('Tech'), duration_days: '3', eta_start: '2025-06-05', eta_end: '2025-06-08', remarks: 'Waiting for server access', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[1], title: 'Monthly SEO Report', category: 'Reporting', status: 'To Be Started', priority: 'P1', assigned_to: getMemberId('Account Manager'), duration_days: '1', eta_start: null, eta_end: null, remarks: 'Every last Friday of month', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[2], title: 'Google Ads Campaign Setup', category: 'Paid Ads', status: 'In Progress', priority: 'P0', assigned_to: getMemberId('Tech'), duration_days: '5', eta_start: '2025-06-01', eta_end: '2025-06-06', remarks: 'ROAS target: 4x', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[2], title: 'Link Building Outreach', category: 'Link Building', status: 'In Progress', priority: 'P2', assigned_to: getMemberId('SEO'), duration_days: '10', eta_start: '2025-06-01', eta_end: '2025-06-15', remarks: '20 prospects identified', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
            { id: uuidv4(), client_id: newClientIds[2], title: 'LLM SEO Optimization', category: 'LLM SEO', status: 'To Be Started', priority: 'P1', assigned_to: getMemberId('SEO'), duration_days: '3', eta_start: '2025-06-15', eta_end: '2025-06-18', remarks: 'AI search optimization', link_url: null, internal_approval: 'Pending', client_link_visible: false, client_approval: null, created_at: now, updated_at: now },
        ]
        await database.collection('tasks').insertMany(tasks)

        await database.collection('reports').insertMany([
            { id: uuidv4(), client_id: newClientIds[0], title: 'May 2025 SEO Report', report_type: 'Monthly SEO Report', report_url: 'https://docs.google.com', report_date: '2025-05-31', notes: 'Organic traffic up 23%', created_at: now },
            { id: uuidv4(), client_id: newClientIds[1], title: 'Q1 Audit Report', report_type: 'Audit Report', report_url: 'https://docs.google.com', report_date: '2025-03-31', notes: 'Full technical audit', created_at: now },
            { id: uuidv4(), client_id: newClientIds[2], title: 'May 2025 Ad Performance', report_type: 'Ad Performance', report_url: 'https://lookerstudio.google.com', report_date: '2025-05-31', notes: 'ROAS: 3.8x', created_at: now },
        ])

        return handleCORS(NextResponse.json({ message: 'Seed data created successfully (Fresh Reset)' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
