export function validateBody(schema, body) {
    const result = schema.safeParse(body);

    if (!result.success) {
        const errors = result.error.errors.map(e => ({
            field: e.path.join("."),
            message: e.message
        }));

        return {
            success: false,
            error: {
                message: "Invalid request body",
                details: errors
            }
        };
    }

    return {
        success: true,
        data: result.data
    };
}

/**
 * Rejects if the body contains any fields in the forbidden list.
 * Used to protect lifecycle fields from generic injection.
 */
export function rejectFields(body, forbidden) {
    const found = forbidden.filter(f => Object.prototype.hasOwnProperty.call(body, f));
    if (found.length > 0) {
        return {
            success: false,
            error: {
                message: "Mutation Prohibited",
                details: found.map(f => ({
                    field: f,
                    message: "Field cannot be modified directly via this route"
                }))
            }
        };
    }
    return { success: true };
}
