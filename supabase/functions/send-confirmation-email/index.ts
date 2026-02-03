import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@wellnestpilates.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingEmailRequest {
  to: string;
  customerName: string;
  packageType: "8" | "10" | "12";
  packagePrice: string;
  bookingDate: string;
  bookingTime: string;
  language?: "sq" | "en"; // Albanian or English, default Albanian
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to,
      customerName,
      packageType,
      packagePrice,
      bookingDate,
      bookingTime,
      language = "sq"
    }: BookingEmailRequest = await req.json();

    // Validate required fields
    if (!to || !customerName || !packageType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, customerName, packageType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate bonus class
    const totalClasses = parseInt(packageType) + 1;

    // Email content based on language
    const emailContent = language === "en" 
      ? getEnglishEmailContent(customerName, packageType, totalClasses, packagePrice, bookingDate, bookingTime)
      : getAlbanianEmailContent(customerName, packageType, totalClasses, packagePrice, bookingDate, bookingTime);

    // Send email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `WellNest Pilates <${FROM_EMAIL}>`,
        to: [to],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getAlbanianEmailContent(
  customerName: string,
  packageType: string,
  totalClasses: number,
  packagePrice: string,
  bookingDate: string,
  bookingTime: string
) {
  return {
    subject: `Konfirmim Rezervimi - ${packageType} Klasë + 1 FALAS | WellNest Pilates`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konfirmim Rezervimi</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #8B7355; padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 4px;">WELLNEST</h1>
              <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 12px; letter-spacing: 2px;">PILATES STUDIO</p>
            </td>
          </tr>
          
          <!-- Success Icon -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background-color: #4CAF50; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 40px; line-height: 80px;">✓</span>
              </div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 20px 40px 30px 40px; text-align: center;">
              <h2 style="color: #333333; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">Rezervimi u Konfirmua!</h2>
              <p style="color: #666666; margin: 0; font-size: 16px;">Përshëndetje, ${customerName}</p>
            </td>
          </tr>
          
          <!-- Package Details Box -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f6f3; border-radius: 8px; padding: 25px;">
                <tr>
                  <td style="padding: 25px;">
                    <h3 style="color: #8B7355; margin: 0 0 20px 0; font-size: 18px; text-align: center;">Detajet e Paketës</h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Paketa:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${packageType} KLASË</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Bonus:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #4CAF50; font-size: 14px;">+1 KLASË FALAS! 🎉</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Totali Klasëve:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${totalClasses} KLASË</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Çmimi:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${packagePrice} DEN</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Data:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${bookingDate}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0;">
                          <span style="color: #666666; font-size: 14px;">Ora:</span>
                        </td>
                        <td style="padding: 10px 0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${bookingTime}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <a href="https://app.wellnestpilates.com" style="display: inline-block; background-color: #8B7355; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">Shiko Rezervimet</a>
            </td>
          </tr>
          
          <!-- Info Text -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="color: #999999; font-size: 14px; margin: 0; line-height: 1.6;">
                Nëse keni pyetje, na kontaktoni në<br>
                <a href="mailto:info@wellnestpilates.com" style="color: #8B7355;">info@wellnestpilates.com</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f6f3; padding: 25px 40px; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                © 2025 Wellnest Pilates Studio. Të gjitha të drejtat e rezervuara.
              </p>
              <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
                <a href="https://wellnestpilates.com" style="color: #8B7355; text-decoration: none;">wellnestpilates.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  };
}

function getEnglishEmailContent(
  customerName: string,
  packageType: string,
  totalClasses: number,
  packagePrice: string,
  bookingDate: string,
  bookingTime: string
) {
  return {
    subject: `Booking Confirmation - ${packageType} Classes + 1 FREE | WellNest Pilates`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #8B7355; padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 4px;">WELLNEST</h1>
              <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 12px; letter-spacing: 2px;">PILATES STUDIO</p>
            </td>
          </tr>
          
          <!-- Success Icon -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background-color: #4CAF50; border-radius: 50%; margin: 0 auto;">
                <span style="color: white; font-size: 40px; line-height: 80px;">✓</span>
              </div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 20px 40px 30px 40px; text-align: center;">
              <h2 style="color: #333333; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">Booking Confirmed!</h2>
              <p style="color: #666666; margin: 0; font-size: 16px;">Hello, ${customerName}</p>
            </td>
          </tr>
          
          <!-- Package Details Box -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f6f3; border-radius: 8px;">
                <tr>
                  <td style="padding: 25px;">
                    <h3 style="color: #8B7355; margin: 0 0 20px 0; font-size: 18px; text-align: center;">Package Details</h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Package:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${packageType} CLASSES</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Bonus:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #4CAF50; font-size: 14px;">+1 FREE CLASS! 🎉</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Total Classes:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${totalClasses} CLASSES</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Price:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${packagePrice} DEN</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
                          <span style="color: #666666; font-size: 14px;">Date:</span>
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${bookingDate}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0;">
                          <span style="color: #666666; font-size: 14px;">Time:</span>
                        </td>
                        <td style="padding: 10px 0; text-align: right;">
                          <strong style="color: #333333; font-size: 14px;">${bookingTime}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <a href="https://app.wellnestpilates.com" style="display: inline-block; background-color: #8B7355; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">View Bookings</a>
            </td>
          </tr>
          
          <!-- Info Text -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="color: #999999; font-size: 14px; margin: 0; line-height: 1.6;">
                If you have any questions, contact us at<br>
                <a href="mailto:info@wellnestpilates.com" style="color: #8B7355;">info@wellnestpilates.com</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f6f3; padding: 25px 40px; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                © 2025 Wellnest Pilates Studio. All rights reserved.
              </p>
              <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
                <a href="https://wellnestpilates.com" style="color: #8B7355; text-decoration: none;">wellnestpilates.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  };
}