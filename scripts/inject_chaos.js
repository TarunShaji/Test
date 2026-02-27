const { MongoClient } = require('mongodb')
const crypto = require('crypto')

async function runChaos() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cubehq'
    const client = new MongoClient(uri)

    try {
        await client.connect()
        const db = client.db()
        const id = 'chaos-client-' + Date.now()

        console.log(`[CHAOS] Injecting malformed data for client: ${id}`)

        // 1. Create a "Chaos" Client
        await db.collection('clients').insertOne({
            id,
            name: null, // TRIGGER: Null property access
            slug: 'chaos-' + id,
            is_active: true,
            created_at: new Date()
        })

        // 2. Inject Malformed Tasks
        await db.collection('tasks').insertMany([
            {
                id: crypto.randomUUID(),
                client_id: id,
                title: null, // TRIGGER: Null title
                status: 'In Progress',
                category: undefined // TRIGGER: Undefined prop
            },
            {
                id: crypto.randomUUID(),
                client_id: id,
                title: 'Malformed URL Task',
                status: 'In Progress',
                url: 'javascript:alert(1)' // TRIGGER: Unsafe URL
            },
            {
                id: crypto.randomUUID(),
                client_id: null, // TRIGGER: Missing client link
                title: 'Orphaned Task',
                status: 'Blocked'
            }
        ])

        // 3. Inject Malformed Reports
        await db.collection('reports').insertOne({
            id: crypto.randomUUID(),
            client_id: id,
            title: 'Corrupted Report',
            report_date: 'invalid-date', // TRIGGER: Date parsing
            report_url: 'not-a-url' // TRIGGER: URL parsing
        })

        // 4. Inject Malformed Resources
        await db.collection('client_resources').insertOne({
            id: crypto.randomUUID(),
            client_id: id,
            title: 'Dead Resource',
            url: 'http://[corrupted]' // TRIGGER: Exploding URL constructor
        })

        console.log(`[CHAOS] Injection complete. Test Slug: chaos-${id}`)
        console.log(`[CHAOS] Manual verify: /dashboard/clients/${id} and /portal/chaos-${id}`)

    } catch (e) {
        console.error('[CHAOS] Failed to inject', e)
    } finally {
        await client.close()
    }
}

runChaos()
