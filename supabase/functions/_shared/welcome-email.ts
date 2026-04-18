export function buildMemberWelcomeEmail(
  firstName: string,
  orderNumber: string,
  amount: number,
  productsSummary: string,
  language: "en" | "es" | string,
  dashboardUrl: string
): string {
  if (language === "es" || language === "ES") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626;">ICE Alarm España</h1>
        </div>

        <h2 style="color: #1f2937;">¡Bienvenido a ICE Alarm!</h2>

        <p>Hola ${firstName},</p>

        <p>¡Gracias por unirte a ICE Alarm! Tu pago ha sido procesado correctamente y tu membresía ya está activa.</p>

        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Detalles del Pedido:</h3>
          <p style="margin: 5px 0;"><strong>Número de Pedido:</strong> ${orderNumber}</p>
          <p style="margin: 5px 0;"><strong>Importe Pagado:</strong> €${amount.toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Productos:</strong> ${productsSummary}</p>
        </div>

        <h3 style="color: #1f2937;">¿Qué sucede ahora?</h3>
        <ol style="padding-left: 20px;">
          <li>Si pediste un colgante GPS, lo enviaremos en 2-3 días laborables</li>
          <li>Recibirás información de seguimiento una vez enviado</li>
          <li>Nuestro equipo te contactará para completar la configuración del dispositivo</li>
        </ol>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Acceder a Mi Panel</a>
        </div>

        <p>¿Necesitas ayuda? Contacta con nuestro equipo de soporte respondiendo a este email.</p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="color: #6b7280; font-size: 14px;">
          Mantente seguro,<br>
          El Equipo de ICE Alarm
        </p>
      </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #dc2626;">ICE Alarm España</h1>
      </div>

      <h2 style="color: #1f2937;">Welcome to ICE Alarm!</h2>

      <p>Hello ${firstName},</p>

      <p>Thank you for joining ICE Alarm! Your payment has been processed successfully and your membership is now active.</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">Order Details:</h3>
        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${orderNumber}</p>
        <p style="margin: 5px 0;"><strong>Amount Paid:</strong> €${amount.toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Products:</strong> ${productsSummary}</p>
      </div>

      <h3 style="color: #1f2937;">What happens next?</h3>
      <ol style="padding-left: 20px;">
        <li>If you ordered a GPS pendant, we'll ship it within 2-3 business days</li>
        <li>You'll receive tracking information once shipped</li>
        <li>Our team will contact you to complete device setup</li>
      </ol>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Access My Dashboard</a>
      </div>

      <p>Need help? Contact our support team by replying to this email.</p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #6b7280; font-size: 14px;">
        Stay safe,<br>
        The ICE Alarm Team
      </p>
    </body>
    </html>
  `;
}
