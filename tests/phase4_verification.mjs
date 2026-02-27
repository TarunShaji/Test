import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://127.0.0.1:3000/api';
const PORTAL_BASE_URL = 'http://127.0.0.1:3000/api/portal';

const JWT_SECRET = '435edc797e337c3e96cc37597e75e58c3c1535f4dce23eaa2494bcc7ec9efb5af5cbceb05f492887dc2d2aa7cb22fc53';

// Helpers
const getHeaders = (token) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-portal-password': 'test-password'
});

async function runTests() {
    console.log('🚀 Starting Phase 4 Ruthless Verification...');
    const token = jwt.sign({ sub: 'test-user', role: 'admin' }, JWT_SECRET);

    // 1. SETUP: Create a client and a task
    console.log('\n--- SETUP ---');
    const slug = `test-client-${Date.now()}`;

    const clientResp = await fetch(`${BASE_URL}/clients`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            name: 'Test Client',
            service_type: 'SEO',
            portal_password: 'test-password'
        })
    });

    if (!clientResp.ok) {
        console.error(`SETUP FAIL: Client creation failed with ${clientResp.status}`);
        console.error(await clientResp.text());
        return;
    }

    const clientData = await clientResp.json();
    const clientId = clientData.id;
    console.log(`Created Client: ${clientId}`);

    const taskResp = await fetch(`${BASE_URL}/tasks`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            client_id: clientId,
            title: 'Base Task'
        })
    });

    if (!taskResp.ok) {
        console.error(`SETUP FAIL: Task creation failed with ${taskResp.status}`);
        console.error(await taskResp.text());
        return;
    }

    const baseTaskData = await taskResp.json();
    const taskId = baseTaskData.id;
    console.log(`Created Task: ${taskId}`);

    // 2. TEST: Injection Rejection
    console.log('\n--- 🧪 TEST 1: Injection Rejection ---');
    const injectionResp = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({
            title: 'Hacked Title',
            client_link_visible: true
        })
    });
    console.log(`Injection (client_link_visible) status: ${injectionResp.status} (Expected: 400)`);

    // 3. TEST: Invariant Enforcement (Logic Conflict)
    console.log('\n--- 🧪 TEST 2: Invariant Enforcement (Logic Conflict) ---');
    // First, make it Completed but NOT Approved
    await fetch(`${BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ status: 'Completed' })
    });

    // Now try to publish it without Internal Approval
    const publishResp = await fetch(`${BASE_URL}/tasks/${taskId}/publish`, {
        method: 'POST',
        headers: getHeaders(token)
    });
    console.log(`Publish without Approval status: ${publishResp.status} (Expected: 400)`);
    if (publishResp.status === 200) {
        console.error('FAIL: Allowed publishing without Internal Approval');
    } else {
        const publishData = await publishResp.json();
        console.log('Error Message:', publishData.error || publishData.message);
    }

    // 4. TEST: Bulk Safety (Invariant Block)
    console.log('\n--- 🧪 TEST 4: Bulk Safety (Invariant Block) ---');
    const bulkResp = await fetch(`${BASE_URL}/tasks/bulk`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            client_id: clientId,
            tasks: [
                { title: 'Valid 1' },
                { title: 'Invalid 2', status: 'In Progress', internal_approval: 'Approved' } // Violation: Approved requires Completed
            ]
        })
    });
    console.log(`Bulk Invariant status: ${bulkResp.status} (Expected: 400 or reporting failures)`);
    const bulkData = await bulkResp.json();
    console.log('Details:', JSON.stringify(bulkData, null, 2));

    // 5. TEST: Concurrency (Optimistic Locking)
    console.log('\n--- 🧪 TEST 5: Concurrency (409 Conflict) ---');
    const currentTask = await (await fetch(`${BASE_URL}/tasks/${taskId}`, { headers: getHeaders(token) })).json();
    const originalTime = currentTask.updated_at;

    // First update
    const firstUpdate = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ title: 'Winner one', updated_at: originalTime })
    });
    console.log(`First Update status: ${firstUpdate.status}`);

    // Second update with OLD timestamp
    const conflictResp = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ title: 'Loser two', updated_at: originalTime })
    });
    console.log(`Concurrency Conflict status: ${conflictResp.status} (Expected: 409)`);

    console.log('\n✅ Verification Complete.');
}

runTests().catch(console.error);
