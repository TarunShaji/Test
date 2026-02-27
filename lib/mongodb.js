import { MongoClient } from 'mongodb'

let client
let db

const DB_NAME = process.env.DB_NAME || 'agency_dashboard'

export async function connectToMongo() {
    if (!client || !db) {
        try {
            client = new MongoClient(process.env.MONGO_URL)
            await client.connect()
            db = client.db(DB_NAME)
        } catch (e) {
            client = null
            db = null
            throw e
        }
    }
    return db
}
