import { MongoClient } from 'mongodb'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'agency_dashboard'

if (!MONGO_URL) {
    throw new Error('Please define the MONGO_URL environment variable inside .env')
}

let cachedDb = null
let connectionPromise = null

/**
 * Robust MongoDB connection singleton.
 * Uses a promise-based approach to avoid race conditions during initial connection.
 */
export async function connectToMongo() {
    if (cachedDb) return cachedDb

    if (!connectionPromise) {
        console.debug('[mongodb] 🔌 Connecting to MongoDB...')

        const opts = {
            maxPoolSize: 10,                 // Limiting pool size for stability on smaller tiers
            serverSelectionTimeoutMS: 5000, // Fail fast if Atlas is unresponsive
            connectTimeoutMS: 10000,
        }

        connectionPromise = MongoClient.connect(MONGO_URL, opts)
            .then((client) => {
                console.log('[mongodb] ✅ MongoDB Connected')
                cachedDb = client.db(DB_NAME)
                return cachedDb
            })
            .catch((err) => {
                console.error('[mongodb] ❌ Connection failed:', err.message)
                connectionPromise = null // Reset so next attempt can retry
                throw err
            })
    }

    return connectionPromise
}
