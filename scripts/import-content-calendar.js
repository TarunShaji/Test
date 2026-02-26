const fs = require('fs');
const path = require('path');

// Parse CSV
const csvPath = path.join(__dirname, '..', 'content_calendar.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Skip header rows (first 2 rows)
const dataLines = lines.slice(2);

// Parse each line
const items = [];
let currentWeek = '';

for (const line of dataLines) {
  if (!line.trim() || line.startsWith(',,,,,')) continue;
  
  // Parse CSV considering quoted fields
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const cols = parseCSVLine(line);
  
  // Column mapping (0-indexed):
  // 0: Week, 1: Blog Type, 2: Blog title, 3: Primary Keyword, 4: Secondary Keywords
  // 5: Comments, 6: Intern, 7: Outline, 8: Intern Status, 9: Blog
  // 10: AI, 11: Edited On, 12: Date- Sent for Approval, 13: Date Approved
  // 14: QC, 15: Blog Status, 16: Blog Link, 17: Published date
  
  const week = cols[0] || currentWeek;
  if (cols[0]) currentWeek = cols[0];
  
  const blogTitle = cols[2];
  if (!blogTitle || blogTitle.includes('Blog title') || blogTitle.includes('Blog Type')) continue;
  
  // Map blog status
  let blogStatus = 'Draft';
  const rawStatus = (cols[15] || '').toLowerCase().trim();
  if (rawStatus === 'published') blogStatus = 'Published';
  else if (rawStatus === 'rejected') blogStatus = 'Rejected';
  else if (rawStatus === 'sent for approval') blogStatus = 'Sent for Approval';
  else if (rawStatus.includes('progress')) blogStatus = 'In Progress';
  
  // Map outline status
  let outlineStatus = 'Pending';
  const rawOutline = (cols[8] || '').toLowerCase().trim();
  if (rawOutline === 'submitted') outlineStatus = 'Submitted';
  else if (rawOutline === 'approved') outlineStatus = 'Approved';
  
  // Topic approval
  let topicApproval = 'Pending';
  const dateApproved = cols[13] || '';
  if (dateApproved && dateApproved.toLowerCase() !== 'date approved') {
    topicApproval = 'Approved';
  }
  
  // Blog approval based on QC status
  let blogApproval = 'Pending Review';
  const qcStatus = (cols[14] || '').toLowerCase().trim();
  if (qcStatus === 'done') blogApproval = 'Approved';
  
  const item = {
    week: week,
    blog_type: cols[1] || '',
    blog_title: blogTitle,
    primary_keyword: cols[3] || '',
    secondary_keywords: cols[4] || '',
    comments: cols[5] || '',
    writer: cols[6] || '',
    outline: cols[7] || '',
    outline_status: outlineStatus,
    content: cols[9] || '',
    ai_percentage: cols[10] || '',
    edited_on: cols[11] || null,
    topic_approval_status: topicApproval,
    topic_approval_date: dateApproved && dateApproved.toLowerCase() !== 'date approved' ? dateApproved : null,
    blog_approval_status: blogApproval,
    blog_approval_date: null,
    qc_status: cols[14] || '',
    blog_status: blogStatus,
    blog_link: cols[16] || '',
    published_date: cols[17] || null
  };
  
  items.push(item);
}

console.log(`Parsed ${items.length} content items`);
console.log(JSON.stringify(items, null, 2));
