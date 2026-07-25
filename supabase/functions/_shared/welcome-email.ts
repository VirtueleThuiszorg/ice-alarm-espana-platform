/**
 * Order-confirmation / welcome email sent by the post-payment path.
 *
 * This email is the confirmation of a distance contract on a durable medium,
 * so it must carry the consumer's right-of-withdrawal information (Directive
 * 2011/83/EU art. 8(7); Royal Legislative Decree 1/2007 arts. 102-108). It
 * previously carried none, and quoted a 2-3 business day dispatch that no
 * longer matches the stated delivery service — both corrected here.
 *
 * DRAFTED TO STATUTORY WORDING — pending review by Lee's gestor/legal adviser
 * before launch (LAUNCH_CHECKLIST).
 *
 * One HTML shell, three locales. Previously es/en only, so Dutch members
 * received English; nl is now a first-class branch.
 */

type Lang = "en" | "es" | "nl";

interface Copy {
  subject: string;
  heading: string;
  greeting: (name: string) => string;
  intro: string;
  orderTitle: string;
  orderNumber: string;
  amountPaid: string;
  products: string;
  nextTitle: string;
  nextSteps: string[];
  cta: string;
  withdrawalTitle: string;
  withdrawalBody: string;
  help: string;
  signoff: string;
  team: string;
}

const COPY: Record<Lang, Copy> = {
  es: {
    subject: "¡Bienvenido a Care Conneqt! Tu membresía está activa",
    heading: "¡Bienvenido a Care Conneqt!",
    greeting: (name) => `Hola ${name},`,
    intro:
      "¡Gracias por unirte a Care Conneqt! Tu pago ha sido procesado correctamente y tu membresía ya está activa.",
    orderTitle: "Detalles del Pedido:",
    orderNumber: "Número de Pedido",
    amountPaid: "Importe Pagado",
    products: "Productos",
    nextTitle: "¿Qué sucede ahora?",
    nextSteps: [
      "Si pediste un colgante GPS, se envía por correo certificado y llega en 5-7 días laborables",
      "Recibirás información de seguimiento una vez enviado",
      "Nuestro equipo te contactará para completar la configuración del dispositivo",
    ],
    cta: "Acceder a Mi Panel",
    withdrawalTitle: "Tu derecho de desistimiento (14 días)",
    withdrawalBody:
      "Tienes derecho a desistir de este contrato en un plazo de 14 días naturales sin necesidad de justificación. El plazo comienza el día en que recibes el colgante GPS (o el día de la contratación, si no pediste dispositivo). Para ejercerlo, basta con comunicárnoslo de forma inequívoca respondiendo a este correo o escribiendo a info@careconneqt.es. Te reembolsaremos todo lo pagado, incluidos el registro y el envío estándar, en un plazo de 14 días desde tu comunicación y por el mismo medio de pago. Los gastos de devolución del colgante corren por tu cuenta. Si nos pediste iniciar la monitorización durante ese plazo, solo se descuenta la parte proporcional a los días activos. Encontrarás el detalle completo y el modelo de formulario en la sección 9.2 de nuestros Términos.",
    help: "¿Necesitas ayuda? Contacta con nuestro equipo de soporte respondiendo a este email.",
    signoff: "Mantente seguro,",
    team: "El Equipo de Care Conneqt",
  },
  en: {
    subject: "Welcome to Care Conneqt! Your membership is active",
    heading: "Welcome to Care Conneqt!",
    greeting: (name) => `Hello ${name},`,
    intro:
      "Thank you for joining Care Conneqt! Your payment has been processed successfully and your membership is now active.",
    orderTitle: "Order Details:",
    orderNumber: "Order Number",
    amountPaid: "Amount Paid",
    products: "Products",
    nextTitle: "What happens next?",
    nextSteps: [
      "If you ordered a GPS pendant, it is sent by recorded delivery and arrives within 5-7 working days",
      "You'll receive tracking information once shipped",
      "Our team will contact you to complete device setup",
    ],
    cta: "Access My Dashboard",
    withdrawalTitle: "Your right of withdrawal (14 days)",
    withdrawalBody:
      "You have the right to withdraw from this contract within 14 calendar days without giving any reason. The period starts the day you receive the GPS pendant (or the day the contract was concluded, if you did not order a device). To exercise it, simply tell us in any unambiguous statement — reply to this email or write to info@careconneqt.es. We will refund everything you paid, including registration and standard delivery, within 14 days of your notice and using the same payment method. You pay the cost of returning the pendant. If you asked us to start monitoring during that period, only a proportionate amount for the days it was live is deducted. Full details and the model withdrawal form are in section 9.2 of our Terms.",
    help: "Need help? Contact our support team by replying to this email.",
    signoff: "Stay safe,",
    team: "The Care Conneqt Team",
  },
  nl: {
    subject: "Welkom bij Care Conneqt! Uw lidmaatschap is actief",
    heading: "Welkom bij Care Conneqt!",
    greeting: (name) => `Hallo ${name},`,
    intro:
      "Bedankt dat u lid bent geworden van Care Conneqt! Uw betaling is verwerkt en uw lidmaatschap is nu actief.",
    orderTitle: "Bestelgegevens:",
    orderNumber: "Bestelnummer",
    amountPaid: "Betaald bedrag",
    products: "Producten",
    nextTitle: "Wat gebeurt er nu?",
    nextSteps: [
      "Hebt u een GPS-hanger besteld, dan wordt deze per aangetekende post verzonden en komt binnen 5-7 werkdagen aan",
      "U ontvangt trackinginformatie zodra de zending onderweg is",
      "Ons team neemt contact met u op om de installatie van het apparaat af te ronden",
    ],
    cta: "Naar mijn dashboard",
    withdrawalTitle: "Uw herroepingsrecht (14 dagen)",
    withdrawalBody:
      "U hebt het recht deze overeenkomst binnen 14 kalenderdagen zonder opgave van redenen te herroepen. De termijn begint op de dag waarop u de GPS-hanger ontvangt (of op de dag waarop de overeenkomst is gesloten, als u geen apparaat hebt besteld). Laat het ons weten met een ondubbelzinnige verklaring — antwoord op deze e-mail of schrijf naar info@careconneqt.es. Wij betalen alles terug wat u hebt betaald, inclusief inschrijfgeld en standaardlevering, binnen 14 dagen na uw melding en via hetzelfde betaalmiddel. De kosten van het terugsturen van de hanger zijn voor uw rekening. Hebt u ons gevraagd de bewaking in die periode te starten, dan wordt alleen een proportioneel bedrag voor de actieve dagen ingehouden. De volledige details en het modelformulier vindt u in artikel 9.2 van onze voorwaarden.",
    help: "Hulp nodig? Neem contact op met ons supportteam door op deze e-mail te antwoorden.",
    signoff: "Blijf veilig,",
    team: "Het Care Conneqt-team",
  },
};

export function resolveLang(language: string | null | undefined): Lang {
  const l = (language || "es").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("nl")) return "nl";
  return "es";
}

/** Subject line for the confirmation email, in the member's language. */
export function memberWelcomeSubject(language: string | null | undefined): string {
  return COPY[resolveLang(language)].subject;
}

export function buildMemberWelcomeEmail(
  firstName: string,
  orderNumber: string,
  amount: number,
  productsSummary: string,
  language: "en" | "es" | string,
  dashboardUrl: string,
): string {
  const c = COPY[resolveLang(language)];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #dc2626;">Care Conneqt</h1>
      </div>

      <h2 style="color: #1f2937;">${c.heading}</h2>

      <p>${c.greeting(firstName)}</p>

      <p>${c.intro}</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">${c.orderTitle}</h3>
        <p style="margin: 5px 0;"><strong>${c.orderNumber}:</strong> ${orderNumber}</p>
        <p style="margin: 5px 0;"><strong>${c.amountPaid}:</strong> €${amount.toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>${c.products}:</strong> ${productsSummary}</p>
      </div>

      <h3 style="color: #1f2937;">${c.nextTitle}</h3>
      <ol style="padding-left: 20px;">
        ${c.nextSteps.map((s) => `<li>${s}</li>`).join("\n        ")}
      </ol>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">${c.cta}</a>
      </div>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937; font-size: 16px;">${c.withdrawalTitle}</h3>
        <p style="margin: 0; color: #4b5563; font-size: 14px;">${c.withdrawalBody}</p>
      </div>

      <p>${c.help}</p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #6b7280; font-size: 14px;">
        ${c.signoff}<br>
        ${c.team}
      </p>
    </body>
    </html>
  `;
}
