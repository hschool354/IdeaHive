const nodemailer = require('nodemailer'); 
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

/**
 * Hàm tạo một transporter dùng để gửi email thông qua Gmail với OAuth2.
 * @returns {Promise<nodemailer.Transporter>} Một đối tượng transporter có thể dùng để gửi email.
 */
const createTransporter = async () => {
  // Tạo OAuth2 client với thông tin từ biến môi trường
  const oauth2Client = new OAuth2(
    process.env.GMAIL_CLIENT_ID,      // Client ID của ứng dụng Google Cloud
    process.env.GMAIL_CLIENT_SECRET,  // Client Secret của ứng dụng Google Cloud
    "https://developers.google.com/oauthplayground" // URL xác thực OAuth2 Playground
  );

  // Thiết lập refresh token để lấy access token
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN // Refresh token được cấp từ Google API
  });

  // Lấy access token từ OAuth2 client
  const accessToken = await new Promise((resolve, reject) => {
    oauth2Client.getAccessToken((err, token) => {
      if (err) {
        reject("Failed to create access token"); // Trả về lỗi nếu không thể lấy access token
      }
      resolve(token); // Trả về access token nếu thành công
    });
  });

  // Tạo transporter để gửi email qua Gmail
  const transporter = nodemailer.createTransport({
    service: "gmail", // Sử dụng dịch vụ Gmail
    auth: {
      type: "OAuth2", // Xác thực bằng OAuth2
      user: process.env.EMAIL_USER, // Địa chỉ email của người gửi
      accessToken, // Access token đã lấy được
      clientId: process.env.GMAIL_CLIENT_ID, // Client ID
      clientSecret: process.env.GMAIL_CLIENT_SECRET, // Client Secret
      refreshToken: process.env.GMAIL_REFRESH_TOKEN // Refresh token
    }
  });

  return transporter; // Trả về đối tượng transporter để sử dụng gửi email
};

module.exports = { createTransporter };
