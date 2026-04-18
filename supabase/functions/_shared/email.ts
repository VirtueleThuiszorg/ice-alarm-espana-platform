import nodemailer from "npm:nodemailer@6.9.16";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const appPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  const senderEmail =
    Deno.env.get("SENDER_EMAIL") || "icealarmespana@gmail.com";
  const senderName =
    Deno.env.get("SENDER_NAME") || "ICE Alarm España";

  if (!appPassword) {
    return { success: false, error: "GMAIL_APP_PASSWORD not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: appPassword },
    });

    await transporter.sendMail({
      from: `${senderName} <${senderEmail}>`,
      to,
      subject,
      html,
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
