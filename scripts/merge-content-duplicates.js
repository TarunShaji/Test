const { MongoClient } = require('mongodb');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });

const CLIENT_TARGETS = [
    { name: 'adventurus', expectedSeoTasks: 41 },
    { name: 'vella', expectedSeoTasks: 33 },
    { name: 'just date', expectedSeoTasks: 46 },
    { name: 'plush', expectedSeoTasks: 66 },
];

const APPLY = process.argv.includes('--apply');

function normalizeName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function toMap(rows) {
    return new Map(rows.map((row) => [row._id, row.count || 0]));
}

async function getCountMap(db, collectionName) {
    const rows = await db.collection(collectionName).aggregate([
        { $group: { _id: '$client_id', count: { $sum: 1 } } }
    ]).toArray();
    return toMap(rows);
}

function describeClient(client, counts) {
    return {
        id: client.id,
        name: client.name,
        slug: client.slug,
        created_at: client.created_at,
        seo_tasks: counts.seo.get(client.id) || 0,
        email_tasks: counts.email.get(client.id) || 0,
        paid_tasks: counts.paid.get(client.id) || 0,
        content_items: counts.content.get(client.id) || 0,
    };
}

function totalTasks(record) {
    return record.seo_tasks + record.email_tasks + record.paid_tasks;
}

async function main() {
    const url = process.env.MONGO_URL;
    const dbName = process.env.DB_NAME || 'agency_dashboard';

    if (!url) {
        throw new Error('MONGO_URL missing. Set it in .env or .env.local');
    }

    const client = new MongoClient(url);
    await client.connect();

    try {
        const db = client.db(dbName);
        const clients = await db.collection('clients').find({ is_active: { $ne: false } }).toArray();

        const counts = {
            seo: await getCountMap(db, 'tasks'),
            email: await getCountMap(db, 'email_tasks'),
            paid: await getCountMap(db, 'paid_tasks'),
            content: await getCountMap(db, 'content_items'),
        };

        const byName = new Map();
        for (const c of clients) {
            const key = normalizeName(c.name);
            if (!byName.has(key)) byName.set(key, []);
            byName.get(key).push(c);
        }

        const migrationPlan = [];

        for (const targetCfg of CLIENT_TARGETS) {
            const key = normalizeName(targetCfg.name);
            const group = (byName.get(key) || []).map((c) => describeClient(c, counts));

            if (group.length === 0) {
                throw new Error(`No active clients found for name "${targetCfg.name}"`);
            }

            // Primary match: dashboard SEO task count should equal expected count.
            let targetCandidates = group.filter((g) => g.seo_tasks === targetCfg.expectedSeoTasks);

            // Fallback: if no exact SEO match, use total task match.
            if (targetCandidates.length === 0) {
                targetCandidates = group.filter((g) => totalTasks(g) === targetCfg.expectedSeoTasks);
            }

            if (targetCandidates.length !== 1) {
                throw new Error(
                    `Could not uniquely identify target for "${targetCfg.name}". ` +
                    `Expected task count ${targetCfg.expectedSeoTasks}. Candidates: ${JSON.stringify(group)}`
                );
            }

            const target = targetCandidates[0];
            const sources = group.filter((g) =>
                g.id !== target.id &&
                totalTasks(g) === 0 &&
                g.content_items > 0
            );

            migrationPlan.push({
                name: targetCfg.name,
                expectedSeoTasks: targetCfg.expectedSeoTasks,
                target,
                sources,
            });
        }

        console.log('=== Merge Plan ===');
        for (const step of migrationPlan) {
            console.log(`\nClient: ${step.name}`);
            console.log(`Target: ${step.target.id} | slug=${step.target.slug} | seo=${step.target.seo_tasks} | content=${step.target.content_items}`);
            if (step.sources.length === 0) {
                console.log('Sources: none with 0 tasks and >0 content');
                continue;
            }
            for (const src of step.sources) {
                console.log(`Source: ${src.id} | slug=${src.slug} | seo=${src.seo_tasks} | email=${src.email_tasks} | paid=${src.paid_tasks} | content=${src.content_items}`);
            }
        }

        if (!APPLY) {
            console.log('\nDry run only. No data changed.');
            console.log('Run with --apply to execute migration.');
            return;
        }

        console.log('\n=== Applying Migration ===');
        let totalMoved = 0;
        const now = new Date();

        for (const step of migrationPlan) {
            for (const src of step.sources) {
                const result = await db.collection('content_items').updateMany(
                    { client_id: src.id },
                    { $set: { client_id: step.target.id, updated_at: now } }
                );
                totalMoved += result.modifiedCount || 0;
                console.log(`Moved ${result.modifiedCount || 0} content items: ${src.id} -> ${step.target.id}`);
            }
        }

        console.log(`\nMigration complete. Total content items moved: ${totalMoved}`);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
