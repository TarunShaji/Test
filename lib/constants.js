export const STATUSES = [
    'To Be Started',
    'In Progress',
    'Completed',
    'Blocked'
]

export const CATEGORIES = [
    'SEO & Content',
    'Design',
    'Development',
    'Page Speed',
    'Technical SEO',
    'Link Building',
    'Paid Ads',
    'Email Marketing',
    'LLM SEO',
    'Reporting',
    'Other'
]

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3']

export const INTERNAL_APPROVALS = ['Pending', 'Approved']

export const APPROVALS = [
    'Pending Review',
    'Approved',
    'Required Changes'
]

export const REPORT_TYPES = [
    'Monthly SEO Report',
    'Weekly Update',
    'Audit Report',
    'Ad Performance',
    'Custom'
]

export const SERVICE_TYPES = [
    'SEO',
    'Email Marketing',
    'Paid Ads',
    'SEO + Email',
    'SEO + Paid Ads',
    'All'
]

export const OUTLINE_STATUSES = ['Pending', 'Submitted', 'Approved', 'Rejected']

export const TOPIC_APPROVALS = ['Pending', 'Approved', 'Rejected']

export const BLOG_APPROVALS = ['Pending Review', 'Approved', 'Changes Required']

export const BLOG_STATUSES = [
    'Draft',
    'In Progress',
    'Sent for Approval',
    'Published',
    'Rejected'
]

export const statusColors = {
    'Completed': 'bg-green-100 text-green-700 border-green-200',
    'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
    'To Be Approved': 'bg-amber-100 text-amber-700 border-amber-200',
    'Blocked': 'bg-red-100 text-red-700 border-red-200',
    'To Be Started': 'bg-gray-100 text-gray-600 border-gray-200',
    'Recurring': 'bg-purple-100 text-purple-700 border-gray-200',
}

export const priorityColors = {
    'P0': 'bg-red-100 text-red-700',
    'P1': 'bg-orange-100 text-orange-700',
    'P2': 'bg-yellow-100 text-yellow-700',
    'P3': 'bg-gray-100 text-gray-600',
}

export const approvalColors = {
    'Approved': 'bg-green-100 text-green-700 border-green-200',
    'Required Changes': 'bg-red-100 text-red-700 border-red-200',
    'Pending Review': 'bg-gray-100 text-gray-500 border-gray-200',
}

export const internalApprovalColors = {
    'Approved': 'bg-green-100 text-green-700 border-green-200',
    'Pending': 'bg-gray-100 text-gray-500 border-gray-200',
}

export const topicApprovalColors = {
    'Approved': 'bg-green-100 text-green-700 border-green-200',
    'Rejected': 'bg-red-100 text-red-700 border-red-200',
    'Pending': 'bg-gray-100 text-gray-500 border-gray-200',
}

export const blogStatusColors = {
    'Published': 'bg-green-100 text-green-700 border-green-200',
    'Sent for Approval': 'bg-amber-100 text-amber-700 border-amber-200',
    'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
    'Draft': 'bg-gray-100 text-gray-600 border-gray-200',
    'Rejected': 'bg-red-100 text-red-700 border-red-200',
}
