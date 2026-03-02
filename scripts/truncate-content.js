const { MongoClient } = require('mongodb');
require('dotenv').config();

async function truncateContent() {
    const url = process.env.MONGO_URL;
    const dbName = process.env.DB_NAME;

    if (!url || !dbName) {
        console.error('❌ MONGO_URL or DB_NAME not found in .env');
        process.exit(1);
    }

    const client = new MongoClient(url);

    try {
        await client.connect();
        const db = client.db(dbName);

        console.log(`🧹 Truncating content_items in ${dbName}...`);
        const count = await db.collection('content_items').countDocuments();
        const result = await db.collection('content_items').deleteMany({});

        console.log(`✅ Success! Deleted ${result.deletedCount} documents (Initial count was ${count}).`);
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

truncateContent();
