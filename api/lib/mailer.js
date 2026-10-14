// api/lib/mailer.js
// Gửi email qua SMTP (TLS port 465) - an toàn, mã hóa đầu cuối
// Tất cả credentials lưu trong .env

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE !== 'false'; // default true (SSL)
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error('SMTP credentials not configured in .env (SMTP_HOST, SMTP_USER, SMTP_PASS)');
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,          // true = SSL/TLS (port 465), false = STARTTLS (port 587)
      auth: { user, pass },
      tls: {
        rejectUnauthorized: true, // Xác thực certificate - bảo mật tốt nhất
      },
    });
  }
  return transporter;
}

const FROM = process.env.SMTP_FROM || `Mochymoon Cosplay <${process.env.SMTP_USER}>`;

/**
 * Gửi OTP email cho tra cứu đơn hàng
 */
export async function sendOtpEmail({ to, otp, orderId }) {
  const t = getTransporter();
  await t.sendMail({
    from: FROM,
    to,
    subject: `[Mochymoon] Mã OTP tra cứu đơn hàng ${orderId || ''}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h2 style="color:#c678dd;margin-top:0">🌸 Mochymoon Cosplay</h2>
        <p>Bạn đã yêu cầu tra cứu trạng thái đơn hàng.</p>
        <p>Mã OTP của bạn:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;
                    padding:16px;background:#f5f0ff;border-radius:8px;color:#6c3bd5;margin:16px 0">
          ${otp}
        </div>
        <p style="font-size:13px;color:#888">Mã này có hiệu lực trong <strong>10 phút</strong>.<br>
        Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:12px;color:#aaa;text-align:center">
          © 2026 Mochymoon Cosplay. Không reply email này.
        </p>
      </div>
    `,
  });
}

/**
 * Gửi email thông báo "dữ liệu không tồn tại" (anti-enumeration)
 */
export async function sendNotFoundEmail({ to }) {
  const t = getTransporter();
  await t.sendMail({
    from: FROM,
    to,
    subject: '[Mochymoon] Thông báo tra cứu đơn hàng',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h2 style="color:#c678dd;margin-top:0">🌸 Mochymoon Cosplay</h2>
        <p>Chúng tôi đã nhận yêu cầu tra cứu đơn hàng của bạn.</p>
        <p style="color:#e74c3c">Thông tin bạn cung cấp <strong>không có trong hệ thống</strong> của chúng tôi.</p>
        <p>Nếu bạn cho rằng đây là lỗi, vui lòng liên hệ với chúng tôi qua fanpage hoặc Zalo để được hỗ trợ.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:12px;color:#aaa;text-align:center">
          © 2026 Mochymoon Cosplay. Không reply email này.
        </p>
      </div>
    `,
  });
}

/**
 * Gửi email xác nhận đơn hàng
 */
export async function sendBookingConfirmEmail({ to, customerName, orderId, costumeName, rentalDate, returnDate, deposit }) {
  const t = getTransporter();
  const formattedDeposit = new Intl.NumberFormat('vi-VN').format(deposit || 0);

  await t.sendMail({
    from: FROM,
    to,
    subject: `[Mochymoon] Xác nhận đặt thuê trang phục - Mã đơn ${orderId}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h2 style="color:#c678dd;margin-top:0">🌸 Mochymoon Cosplay</h2>
        <p>Xin chào <strong>${customerName || 'Quý khách'}</strong>,</p>
        <p>Chúng tôi đã nhận đơn thuê trang phục của bạn. Dưới đây là thông tin đơn hàng:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Mã đơn hàng</td>
              <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${orderId}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Trang phục</td>
              <td style="padding:8px;border-bottom:1px solid #eee">${costumeName || 'N/A'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Ngày thuê</td>
              <td style="padding:8px;border-bottom:1px solid #eee">${rentalDate || 'N/A'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Ngày trả</td>
              <td style="padding:8px;border-bottom:1px solid #eee">${returnDate || 'N/A'}</td></tr>
          <tr><td style="padding:8px;color:#888">Cọc cần thanh toán</td>
              <td style="padding:8px;font-weight:bold;color:#6c3bd5">${formattedDeposit} VNĐ</td></tr>
        </table>
        <p style="font-size:13px;color:#888">Vui lòng thanh toán cọc trong vòng 24 giờ để giữ đơn hàng.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:12px;color:#aaa;text-align:center">© 2026 Mochymoon Cosplay</p>
      </div>
    `,
  });
}
