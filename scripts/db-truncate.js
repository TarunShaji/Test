const { MongoClient } = require('mongodb');
require('dotenv').config();

async function truncateDB() {
    const url = process.env.MONGO_URL || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'dashboard_db';
    const client = new MongoClient(url);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(dbName);

        const collections = ['tasks', 'clients', 'team_members', 'content_items', 'reports'];

        console.log('🚮 Truncating collections...');

        for (const collName of collections) {
            const count = await db.collection(collName).countDocuments();
            await db.collection(collName).deleteMany({});
            console.log(` - ${collName}: Deleted ${count} documents`);
        }

        console.log('✅ Database truncated successfully!');
    } catch (error) {
        console.error('❌ Error truncating database:', error);
    } finally {
        await client.close();
    }
}

truncateDB();
