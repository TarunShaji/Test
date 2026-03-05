
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Load env from the project root
dotenv.config({ path: path.join(__dirname, '.env') });

async function truncateContent() {
    const uri = process.env.MONGO_URL;
    const dbName = process.env.DB_NAME || 'agency_dashboard';

    if (!uri) {
        console.error('❌ MONGO_URL not found in .env');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('content_items');

        console.log(`🧹 Attempting to truncate collection: content_items in DB: ${dbName}`);
        const result = await collection.deleteMany({});
        console.log(`✅ Success! Deleted ${result.deletedCount} items.`);
    } catch (err) {
        console.error('❌ Error truncating collection:', err);
    } finally {
        await client.close();
    }
}

truncateContent();
