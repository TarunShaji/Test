const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlci1pZCIsIm5hbWUiOiJWZXJpZmljYXRpb24gVGVzdGVyIiwicm9sZSI6IkFkbWluIiwiaWF0IjoxNzcyMTg2NzQ1LCJleHAiOjE3NzIxOTAzNDV9.PLWMG4FIFdLiKTtf9ZF3gy1MXYhlS3bGgohdha6XHj0";
const BASE_URL = "http://127.0.0.1:3000/api";

async function runCases() {
    console.log("Starting API Validation Verification...\n");

    const cases = [
        {
            name: "POST /api/tasks - Missing title",
            endpoint: "/tasks",
            method: "POST",
            body: { client_id: "550e8400-e29b-41d4-a716-446655440000", status: "To Be Started" },
            expectStatus: 400
        },
        {
            name: "POST /api/tasks - Wrong enum",
            endpoint: "/tasks",
            method: "POST",
            body: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "Done" },
            expectStatus: 400
        },
        {
            name: "POST /api/tasks - Malformed URL",
            endpoint: "/tasks",
            method: "POST",
            body: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "To Be Started", link_url: "google.com" },
            expectStatus: 400
        },
        {
            name: "POST /api/tasks - Extra field (strict)",
            endpoint: "/tasks",
            method: "POST",
            body: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "To Be Started", rogue: "hack" },
            expectStatus: 400
        },
        {
            name: "POST /api/clients - Empty name",
            endpoint: "/clients",
            method: "POST",
            body: { name: "", service_type: "SEO" },
            expectStatus: 400
        }
    ];

    for (const c of cases) {
        try {
            const res = await fetch(`${BASE_URL}${c.endpoint}`, {
                method: c.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${TOKEN}`
                },
                body: JSON.stringify(c.body)
            });

            const data = await res.json();
            if (res.status === c.expectStatus) {
                console.log(`✅ PASS: ${c.name} (Status: ${res.status})`);
                if (res.status === 400) {
                    console.log(`   Error Message: ${data.message}`);
                    console.log(`   Details: ${JSON.stringify(data.details)}`);
                }
            } else {
                console.log(`❌ FAIL: ${c.name}`);
                console.log(`   Expected status ${c.expectStatus}, got ${res.status}`);
                console.log(`   Response: ${JSON.stringify(data)}`);
            }
        } catch (e) {
            console.log(`❌ FAIL: ${c.name} - Error: ${e.message}`);
        }
        console.log("---");
    }
}

runCases();
