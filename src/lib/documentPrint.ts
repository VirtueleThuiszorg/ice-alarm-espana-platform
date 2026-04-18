import { Documentation, DocumentCategory } from "@/hooks/useDocumentation";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  general: "General Procedures",
  member_guide: "Member Guides",
  staff: "Staff Instructions",
  device: "Device Guides",
  emergency: "Emergency Protocols",
  partner: "Partner Information",
};

/**
 * Convert markdown to basic HTML for print view
 */
function markdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s(.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\s*-\s(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr />')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');
}

/**
 * Print document as PDF (opens browser print dialog)
 */
export function printDocument(doc: Documentation): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print documents');
    return;
  }

  const formattedDate = new Date(doc.updated_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const htmlContent = markdownToHtml(doc.content);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="${doc.language}">
      <head>
        <meta charset="UTF-8">
        <title>${doc.title} - ICE Alarm España</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
          }
          
          header {
            border-bottom: 2px solid #dc2626;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          
          .company-name {
            font-size: 14px;
            color: #dc2626;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          .category-badge {
            display: inline-block;
            background: #f3f4f6;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            color: #4b5563;
            margin-top: 8px;
          }
          
          .document-title {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
            margin-top: 16px;
            line-height: 1.2;
          }
          
          .document-meta {
            font-size: 12px;
            color: #6b7280;
            margin-top: 12px;
          }
          
          .content {
            margin-top: 30px;
          }
          
          .content h1 {
            font-size: 24px;
            margin-top: 32px;
            margin-bottom: 16px;
            color: #111827;
          }
          
          .content h2 {
            font-size: 20px;
            margin-top: 28px;
            margin-bottom: 14px;
            color: #1f2937;
          }
          
          .content h3 {
            font-size: 18px;
            margin-top: 24px;
            margin-bottom: 12px;
            color: #374151;
          }
          
          .content h4, .content h5, .content h6 {
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 10px;
            color: #4b5563;
          }
          
          .content p {
            margin-bottom: 16px;
          }
          
          .content li {
            margin-left: 24px;
            margin-bottom: 8px;
          }
          
          .content blockquote {
            border-left: 4px solid #dc2626;
            padding-left: 16px;
            margin: 16px 0;
            color: #4b5563;
            font-style: italic;
          }
          
          .content hr {
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 24px 0;
          }
          
          .content strong {
            font-weight: 600;
          }
          
          footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
            color: #9ca3af;
            display: flex;
            justify-content: space-between;
          }
          
          @media print {
            body {
              padding: 20px;
            }
            
            header {
              page-break-after: avoid;
            }
            
            footer {
              position: fixed;
              bottom: 20px;
              left: 40px;
              right: 40px;
            }
          }
        </style>
      </head>
      <body>
        <header>
          <div class="company-name">ICE Alarm España</div>
          <span class="category-badge">${CATEGORY_LABELS[doc.category]}</span>
          <h1 class="document-title">${doc.title}</h1>
          <div class="document-meta">
            Version ${doc.version} • ${doc.language.toUpperCase()} • Last updated: ${formattedDate}
          </div>
        </header>
        
        <main class="content">
          <p>${htmlContent}</p>
        </main>
        
        <footer>
          <span>ICE Alarm España - Confidential</span>
          <span>Document ID: ${doc.slug}</span>
        </footer>
      </body>
    </html>
  `);

  printWindow.document.close();
  
  // Wait for content to load, then print
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

/**
 * Download document as Markdown file
 */
export function downloadMarkdown(doc: Documentation): void {
  const frontMatter = `---
title: ${doc.title}
category: ${doc.category}
language: ${doc.language}
version: ${doc.version}
updated: ${doc.updated_at}
tags: ${doc.tags.join(', ')}
---

`;

  const content = frontMatter + doc.content;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.slug}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download document as plain text file
 */
export function downloadText(doc: Documentation): void {
  // Strip markdown formatting
  const plainText = doc.content
    // Remove headers
    .replace(/^#{1,6}\s/gm, '')
    // Convert bold/italic to plain
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    // Convert list markers
    .replace(/^\s*-\s/gm, '• ')
    // Remove blockquote markers
    .replace(/^>\s/gm, '')
    // Remove horizontal rules
    .replace(/^---$/gm, '────────────────────────────────────────')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n');

  const header = `${doc.title.toUpperCase()}
${'='.repeat(doc.title.length)}

Category: ${CATEGORY_LABELS[doc.category]}
Language: ${doc.language.toUpperCase()}
Version: ${doc.version}
Last Updated: ${new Date(doc.updated_at).toLocaleDateString()}

────────────────────────────────────────

`;

  const content = header + plainText;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.slug}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
