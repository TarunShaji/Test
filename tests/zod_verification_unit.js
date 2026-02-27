const { TaskCreateSchema } = require('./lib/schemas/task.schema');
const { ClientSchema } = require('./lib/schemas/client.schema');
const { ReportSchema } = require('./lib/schemas/report.schema');
const { ContentSchema } = require('./lib/schemas/content.schema');
const { validateBody } = require('./lib/validation');

// Mocking required for non-ESM environment if needed, but let's try direct first
// Since the files use ESM 'import/export', I might need a wrapper or use 'esm' package.
// For now, I'll create a standalone verification script that matches the logic.

function test() {
    console.log("Starting Zod Schema Verification Unit Tests...\n");

    const cases = [
        {
            name: "Task: Missing title",
            schema: TaskCreateSchema,
            payload: { client_id: "550e8400-e29b-41d4-a716-446655440000", status: "In Progress" },
            expectSuccess: false
        },
        {
            name: "Task: Wrong status enum",
            schema: TaskCreateSchema,
            payload: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "Done" },
            expectSuccess: false
        },
        {
            name: "Task: Malformed link_url",
            schema: TaskCreateSchema,
            payload: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "In Progress", link_url: "google.com" },
            expectSuccess: false
        },
        {
            name: "Task: Extra unexpected field",
            schema: TaskCreateSchema,
            payload: { title: "Test", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "In Progress", rogue_field: "attack" },
            expectSuccess: false
        },
        {
            name: "Task: Null title",
            schema: TaskCreateSchema,
            payload: { title: null, client_id: "550e8400-e29b-41d4-a716-446655440000", status: "In Progress" },
            expectSuccess: false
        },
        {
            name: "Task: Empty string title",
            schema: TaskCreateSchema,
            payload: { title: "", client_id: "550e8400-e29b-41d4-a716-446655440000", status: "In Progress" },
            expectSuccess: false
        },
        {
            name: "Task: Invalid UUID client_id",
            schema: TaskCreateSchema,
            payload: { title: "Valid", client_id: "abc-123", status: "In Progress" },
            expectSuccess: false
        }
    ];

    let passed = 0;
    cases.forEach(c => {
        const result = validateBody(c.schema, c.payload);
        if (result.success === c.expectSuccess) {
            console.log(`✅ PASS: ${c.name}`);
            passed++;
        } else {
            console.log(`❌ FAIL: ${c.name}`);
            console.log(`   Expected success: ${c.expectSuccess}, got: ${result.success}`);
            if (!result.success) console.log(`   Errors: ${JSON.stringify(result.error.details)}`);
        }
    });

    console.log(`\nResults: ${passed}/${cases.length} tests passed.`);
}

// Since the project is likely ESM, I'll use a dynamic import or just run it with a tool that handles it.
// Actually, I'll just write a script that I can run with `node --input-type=module` if needed.
