// api/lib/discord.js
// Gửi thông báo thanh toán thành công qua Discord Webhook
// URL được lưu trong .env - không hardcode

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

/**
 * Gửi embed thông báo thanh toán lên Discord
 * @param {Object} orderData - Thông tin đơn hàng đã thanh toán
 */
export async function sendPaymentNotification(orderData) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('[DISCORD] DISCORD_WEBHOOK_URL not set in .env, skipping notification');
    return false;
  }

  const { orderId, amount, content, gateway, time, customerName, email, phone } = orderData;

  const formattedAmount = new Intl.NumberFormat('vi-VN').format(amount || 0);
  const timestamp = new Date().toISOString();

  const embed = {
    title: '✅ Thanh toán thành công!',
    color: 0x00d26a, // xanh lá
    fields: [
      { name: '📋 Mã đơn hàng', value: `\`${orderId || 'N/A'}\``, inline: true },
      { name: '💰 Số tiền', value: `**${formattedAmount} VNĐ**`, inline: true },
      { name: '🏦 Ngân hàng', value: gateway || 'N/A', inline: true },
      { name: '📝 Nội dung CK', value: content ? `\`${content}\`` : 'N/A', inline: false },
    ],
    footer: { text: 'Mochymoon Cosplay Payment System' },
    timestamp,
  };

  // Thêm thông tin khách hàng nếu có
  if (customerName) embed.fields.push({ name: '👤 Khách hàng', value: customerName, inline: true });
  if (email)        embed.fields.push({ name: '📧 Email',      value: email,        inline: true });
  if (phone)        embed.fields.push({ name: '📞 SĐT',        value: phone,        inline: true });
  if (time)         embed.fields.push({ name: '🕐 Thời gian',  value: String(time), inline: false });

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MochymoonBot/1.0'
      },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (res.ok || res.status === 204) {
      console.log(`[DISCORD] Payment notification sent for order ${orderId}`);
      return true;
    } else {
      const errText = await res.text();
      console.error(`[DISCORD] Failed (${res.status}): ${errText}`);
      return false;
    }
  } catch (err) {
    console.error('[DISCORD] Error sending notification:', err.message);
    return false;
  }
}

/**
 * Gửi thông báo lỗi hệ thống lên Discord
 */
export async function sendSystemAlert(message, details = '') {
  if (!DISCORD_WEBHOOK_URL) return false;

  const embed = {
    title: '⚠️ System Alert',
    color: 0xff4444,
    description: message,
    fields: details ? [{ name: 'Details', value: `\`\`\`${details.slice(0, 1000)}\`\`\`` }] : [],
    timestamp: new Date().toISOString(),
    footer: { text: 'Mochymoon Cosplay System' },
  };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return true;
  } catch (err) {
    console.error('[DISCORD] Alert error:', err.message);
    return false;
  }
}
