'use client';

import { SWRConfig } from 'swr';

export function SWRProvider({ children }) {
    return (
        <SWRConfig
            value={{
                onError: (error, key) => {
                    console.error(`[SWR_ERROR] Key: ${key}`, error);
                },
                onSuccess: (data, key) => {
                    // Optional: log background revalidations
                    // console.log(`[SWR_SUCCESS] Key: ${key}`);
                }
            }}
        >
            {children}
        </SWRConfig>
    );
}
