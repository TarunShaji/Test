import { redirect } from 'next/navigation'

/**
 * /dashboard/clients is no longer a top-level page.
 * All client management is now done from the Dashboard.
 * Redirect any direct hits to /dashboard/clients → /dashboard.
 */
export default function ClientsListPage() {
  redirect('/dashboard')
}
