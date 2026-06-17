/**
 * Build the `leads` row for a "Notify Me" product-interest capture on coming-soon products.
 * Tagged source `product_interest` with the product name in the message so the team can
 * follow up. Matches the leads insert shape used by the contact form.
 */
export function buildProductInterestLead(productName: string, email: string) {
  return {
    first_name: "",
    last_name: "",
    email: email.trim(),
    phone: "",
    source: "product_interest",
    message: `Product interest: ${productName}`,
    status: "new",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
