// PDF Invoice Generator for ICE Alarm Espana
// Uses browser print dialog to generate PDF invoices — no external dependencies required.

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;    // Net price per unit (before IVA)
  taxRate: number;       // e.g. 0.10 or 0.21
}

export interface InvoiceMember {
  name: string;
  address: string;
  email: string;
  nieDni?: string;
  phone?: string;
}

export interface CompanyInfo {
  company_name?: string;
  cif?: string;
  address?: string;
  email?: string;
  website?: string;
  phone?: string;
  iban?: string;
  bic?: string;
}

const DEFAULT_COMPANY: Required<CompanyInfo> = {
  company_name: 'ICE Alarm España S.L.',
  cif: 'B93557218',
  address: 'Costa del Sol, Málaga, Spain',
  email: 'info@icealarmespana.es',
  website: 'www.icealarmespana.es',
  phone: '+34 900 123 456',
  iban: 'ES00 0000 0000 0000 0000 0000',
  bic: 'CAIXESBBXXX',
};

export interface InvoiceData {
  invoiceNumber: string;
  date: string;                    // ISO date string or display string
  member: InvoiceMember;
  items: InvoiceLineItem[];
  shippingAmount?: number;         // Shipping is IVA-included
  notes?: string;
  company?: CompanyInfo;
}

type Locale = 'es' | 'en';

interface Labels {
  invoiceTitle: string;
  invoiceNumber: string;
  date: string;
  billTo: string;
  description: string;
  quantity: string;
  unitPrice: string;
  iva: string;
  total: string;
  subtotalNet: string;
  ivaBreakdown: string;
  shipping: string;
  grandTotal: string;
  paymentInfo: string;
  companyFooter: string;
  page: string;
  email: string;
  phone: string;
  nieDni: string;
}

function getLabels(company: Required<CompanyInfo>): Record<Locale, Labels> {
  return {
    es: {
      invoiceTitle: 'FACTURA',
      invoiceNumber: 'Factura N.',
      date: 'Fecha',
      billTo: 'Facturar a',
      description: 'Descripcion',
      quantity: 'Cant.',
      unitPrice: 'Precio Ud.',
      iva: 'IVA',
      total: 'Total',
      subtotalNet: 'Subtotal (Neto)',
      ivaBreakdown: 'IVA',
      shipping: 'Envio (IVA incluido)',
      grandTotal: 'TOTAL',
      paymentInfo: 'Informacion de pago',
      companyFooter: `${company.company_name} - CIF: ${company.cif} - Registro Mercantil de Málaga`,
      page: 'Pagina',
      email: 'Email',
      phone: 'Telefono',
      nieDni: 'NIE/DNI',
    },
    en: {
      invoiceTitle: 'INVOICE',
      invoiceNumber: 'Invoice No.',
      date: 'Date',
      billTo: 'Bill to',
      description: 'Description',
      quantity: 'Qty',
      unitPrice: 'Unit Price',
      iva: 'IVA',
      total: 'Total',
      subtotalNet: 'Subtotal (Net)',
      ivaBreakdown: 'IVA',
      shipping: 'Shipping (IVA included)',
      grandTotal: 'GRAND TOTAL',
      paymentInfo: 'Payment information',
      companyFooter: `${company.company_name} - CIF: ${company.cif} - Registro Mercantil de Málaga`,
      page: 'Page',
      email: 'Email',
      phone: 'Phone',
      nieDni: 'NIE/DNI',
    },
  };
}

function formatEur(amount: number): string {
  return amount.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Calculates IVA breakdown grouped by rate.
 * Returns an array of { rate, net, tax } objects.
 */
function calculateIvaBreakdown(items: InvoiceLineItem[]): { rate: number; net: number; tax: number }[] {
  const byRate = new Map<number, { net: number; tax: number }>();

  for (const item of items) {
    const lineNet = item.unitPrice * item.quantity;
    const lineTax = lineNet * item.taxRate;
    const existing = byRate.get(item.taxRate);
    if (existing) {
      existing.net += lineNet;
      existing.tax += lineTax;
    } else {
      byRate.set(item.taxRate, { net: lineNet, tax: lineTax });
    }
  }

  return Array.from(byRate.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, values]) => ({ rate, ...values }));
}

/**
 * Opens a new browser window with a styled HTML invoice and triggers the print dialog.
 * The user can then save as PDF via the browser's built-in "Save as PDF" printer.
 */
export function generateInvoicePdf(order: InvoiceData, locale: Locale = 'es'): void {
  const company = { ...DEFAULT_COMPANY, ...order.company };
  const l = getLabels(company)[locale];

  const subtotalNet = order.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const ivaBreakdown = calculateIvaBreakdown(order.items);
  const totalTax = ivaBreakdown.reduce((sum, b) => sum + b.tax, 0);
  const shipping = order.shippingAmount ?? 0;
  const grandTotal = subtotalNet + totalTax + shipping;

  const displayDate = (() => {
    try {
      const d = new Date(order.date);
      if (isNaN(d.getTime())) return order.date;
      return d.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return order.date;
    }
  })();

  // Build line items HTML
  const lineItemsHtml = order.items
    .map((item) => {
      const lineNet = item.unitPrice * item.quantity;
      const lineTax = lineNet * item.taxRate;
      const lineTotal = lineNet + lineTax;
      return `
        <tr>
          <td class="item-desc">${escapeHtml(item.description)}</td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-right">${formatEur(item.unitPrice)}</td>
          <td class="text-center">${formatPercent(item.taxRate)}</td>
          <td class="text-right">${formatEur(lineTotal)}</td>
        </tr>`;
    })
    .join('');

  // Build IVA breakdown rows
  const ivaRowsHtml = ivaBreakdown
    .map(
      (b) => `
        <tr class="subtotal-row">
          <td colspan="3"></td>
          <td class="text-right">${l.ivaBreakdown} ${formatPercent(b.rate)}</td>
          <td class="text-right">${formatEur(b.tax)}</td>
        </tr>`
    )
    .join('');

  // Shipping row
  const shippingRowHtml =
    shipping > 0
      ? `
        <tr class="subtotal-row">
          <td colspan="3"></td>
          <td class="text-right">${l.shipping}</td>
          <td class="text-right">${formatEur(shipping)}</td>
        </tr>`
      : '';

  // Optional member details
  const memberPhoneHtml = order.member.phone
    ? `<div class="member-detail"><span class="detail-label">${l.phone}:</span> ${escapeHtml(order.member.phone)}</div>`
    : '';
  const memberNieHtml = order.member.nieDni
    ? `<div class="member-detail"><span class="detail-label">${l.nieDni}:</span> ${escapeHtml(order.member.nieDni)}</div>`
    : '';

  // Notes
  const notesHtml = order.notes
    ? `<div class="notes-section"><strong>${locale === 'es' ? 'Notas:' : 'Notes:'}</strong> ${escapeHtml(order.notes)}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <title>${l.invoiceTitle} ${escapeHtml(order.invoiceNumber)} - ICE Alarm Espana</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      line-height: 1.5;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }

    /* ---- HEADER ---- */
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24px;
      border-bottom: 3px solid #dc2626;
      margin-bottom: 32px;
    }

    .company-info {
      max-width: 55%;
    }

    .company-name {
      font-size: 22px;
      font-weight: 700;
      color: #dc2626;
      margin-bottom: 4px;
    }

    .company-tagline {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .company-address {
      font-size: 11px;
      color: #4b5563;
      line-height: 1.6;
    }

    .invoice-meta {
      text-align: right;
    }

    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      letter-spacing: 2px;
      margin-bottom: 12px;
    }

    .meta-row {
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 4px;
    }

    .meta-row strong {
      color: #111827;
    }

    /* ---- BILL TO ---- */
    .bill-to-section {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 32px;
    }

    .bill-to-label {
      font-size: 10px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .bill-to-name {
      font-size: 15px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }

    .member-detail {
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 2px;
    }

    .detail-label {
      color: #6b7280;
    }

    /* ---- TABLE ---- */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    .items-table thead th {
      background: #111827;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      text-align: left;
    }

    .items-table thead th.text-center {
      text-align: center;
    }

    .items-table thead th.text-right {
      text-align: right;
    }

    .items-table tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 13px;
    }

    .items-table tbody td.item-desc {
      max-width: 280px;
    }

    .items-table tbody td.text-center {
      text-align: center;
    }

    .items-table tbody td.text-right {
      text-align: right;
    }

    .items-table tbody tr:last-child td {
      border-bottom: 2px solid #d1d5db;
    }

    /* ---- TOTALS ---- */
    .subtotal-row td {
      border-bottom: none !important;
      padding: 4px 12px;
      font-size: 12px;
      color: #4b5563;
    }

    .grand-total-row td {
      border-bottom: none !important;
      padding: 12px 12px 4px;
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }

    .grand-total-row td.grand-total-amount {
      background: #fef2f2;
      border-radius: 4px;
      color: #dc2626;
    }

    /* ---- NOTES ---- */
    .notes-section {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 12px 16px;
      font-size: 12px;
      color: #92400e;
      margin-bottom: 32px;
    }

    /* ---- PAYMENT INFO ---- */
    .payment-section {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 32px;
    }

    .payment-label {
      font-size: 10px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .payment-detail {
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 2px;
    }

    /* ---- FOOTER ---- */
    .invoice-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }

    /* ---- PRINT ---- */
    @media print {
      body {
        padding: 20px;
        font-size: 12px;
      }

      .invoice-header {
        page-break-after: avoid;
      }

      .items-table {
        page-break-inside: auto;
      }

      .items-table tr {
        page-break-inside: avoid;
      }

      .invoice-footer {
        position: fixed;
        bottom: 15px;
        left: 30px;
        right: 30px;
      }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="invoice-header">
    <div class="company-info">
      <div class="company-name">${escapeHtml(company.company_name)}</div>
      <div class="company-tagline">Personal Emergency Response Service</div>
      <div class="company-address">
        ${escapeHtml(company.address)}<br>
        ${escapeHtml(company.email)} | ${escapeHtml(company.website)}<br>
        CIF: ${escapeHtml(company.cif)}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">${l.invoiceTitle}</div>
      <div class="meta-row"><strong>${l.invoiceNumber}:</strong> ${escapeHtml(order.invoiceNumber)}</div>
      <div class="meta-row"><strong>${l.date}:</strong> ${displayDate}</div>
    </div>
  </div>

  <!-- BILL TO -->
  <div class="bill-to-section">
    <div class="bill-to-label">${l.billTo}</div>
    <div class="bill-to-name">${escapeHtml(order.member.name)}</div>
    <div class="member-detail">${escapeHtml(order.member.address)}</div>
    <div class="member-detail"><span class="detail-label">${l.email}:</span> ${escapeHtml(order.member.email)}</div>
    ${memberPhoneHtml}
    ${memberNieHtml}
  </div>

  <!-- LINE ITEMS TABLE -->
  <table class="items-table">
    <thead>
      <tr>
        <th>${l.description}</th>
        <th class="text-center">${l.quantity}</th>
        <th class="text-right">${l.unitPrice}</th>
        <th class="text-center">${l.iva}</th>
        <th class="text-right">${l.total}</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}

      <!-- Subtotal Net -->
      <tr class="subtotal-row">
        <td colspan="3"></td>
        <td class="text-right"><strong>${l.subtotalNet}</strong></td>
        <td class="text-right"><strong>${formatEur(subtotalNet)}</strong></td>
      </tr>

      <!-- IVA breakdown rows -->
      ${ivaRowsHtml}

      <!-- Shipping -->
      ${shippingRowHtml}

      <!-- Grand Total -->
      <tr class="grand-total-row">
        <td colspan="3"></td>
        <td class="text-right">${l.grandTotal}</td>
        <td class="text-right grand-total-amount">${formatEur(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <!-- NOTES -->
  ${notesHtml}

  <!-- PAYMENT INFO -->
  <div class="payment-section">
    <div class="payment-label">${l.paymentInfo}</div>
    <div class="payment-detail">IBAN: ${escapeHtml(company.iban)}</div>
    <div class="payment-detail">BIC/SWIFT: ${escapeHtml(company.bic)}</div>
    <div class="payment-detail">${locale === 'es' ? 'Beneficiario' : 'Beneficiary'}: ICE Alarm Espana S.L.</div>
    <div class="payment-detail">${locale === 'es' ? 'Referencia' : 'Reference'}: ${escapeHtml(order.invoiceNumber)}</div>
  </div>

  <!-- FOOTER -->
  <div class="invoice-footer">
    <span>${l.companyFooter}</span>
    <span>${l.invoiceTitle} ${escapeHtml(order.invoiceNumber)}</span>
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print invoices / Por favor, permita ventanas emergentes para imprimir facturas');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to render, then trigger print
  setTimeout(() => {
    printWindow.print();
  }, 300);
}
