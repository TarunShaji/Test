const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function applyIndexes() {
    const url = process.env.MONGO_URL || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'dashboard_db';
    const client = new MongoClient(url);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(dbName);

        // 1. Tasks Collection
        console.log('Indexing tasks collection...');
        await db.collection('tasks').createIndex({ client_id: 1 });
        await db.collection('tasks').createIndex({ status: 1 });
        await db.collection('tasks').createIndex({ assigned_to: 1 });
        await db.collection('tasks').createIndex({ client_link_visible: 1 });
        await db.collection('tasks').createIndex({ signature: 1 }, { unique: true, sparse: true });
        await db.collection('tasks').createIndex({ updated_at: -1 });
        await db.collection('tasks').createIndex({ id: 1 }, { unique: true });

        // 2. Clients Collection
        console.log('Indexing clients collection...');
        await db.collection('clients').createIndex({ slug: 1 }, { unique: true });
        await db.collection('clients').createIndex({ id: 1 }, { unique: true });

        // 3. Team Members Collection
        console.log('Indexing team_members collection...');
        await db.collection('team_members').createIndex({ email: 1 }, { unique: true });
        await db.collection('team_members').createIndex({ id: 1 }, { unique: true });

        // 4. Content Items Collection
        console.log('Indexing content_items collection...');
        await db.collection('content_items').createIndex({ client_id: 1 });
        await db.collection('content_items').createIndex({ id: 1 }, { unique: true });

        // 5. Client Resources Collection
        console.log('Indexing client_resources collection...');
        await db.collection('client_resources').createIndex({ client_id: 1 });
        await db.collection('client_resources').createIndex({ id: 1 }, { unique: true });

        console.log('✅ All indexes applied successfully!');
    } catch (error) {
        console.error('❌ Error applying indexes:', error);
    } finally {
        await client.close();
    }
}

applyIndexes();
