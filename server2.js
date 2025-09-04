const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const readings = [];

// Email configuration
const EMAIL_CONFIG = {
  service: 'gmail', // or your email service
  user: process.env.EMAIL_USER , // Your email
  pass:process.env.EMAIL_PASS,    // Your app password
  to: process.env.ALERT_USER,    // Alert recipient
};

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: EMAIL_CONFIG.service,
  auth: {
    user: EMAIL_CONFIG.user,
    pass: EMAIL_CONFIG.pass
  }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', error.message);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Function to send alert email
async function sendAlert(distance, motor) {
  const mailOptions = {
    from: `"Smart Drainage System" <${EMAIL_CONFIG.user}>`,
    to: EMAIL_CONFIG.to,
    subject: '🚨 DRAINAGE ALERT: Water Level Critical',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c; text-align: center;">⚠️ DRAINAGE SYSTEM ALERT</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Critical Water Level Detected</h3>
          <p><strong>Distance Reading:</strong> <span style="color: #e74c3c; font-size: 18px;">${distance} cm</span></p>
          <p><strong>Motor Status:</strong> <span style="color: ${motor === 'ON' ? '#27ae60' : '#e74c3c'};">${motor}</span></p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Alert Threshold:</strong> 200 cm</p>
        </div>
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
          <p style="margin: 0;"><strong>Action Required:</strong> The water level has exceeded the safe threshold. Please check the drainage system immediately.</p>
        </div>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="text-align: center; color: #6c757d; font-size: 12px;">
          This is an automated alert from your Smart Drainage Monitoring System
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Alert email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send alert email:', error.message);
    return false;
  }
}

// Track last alert timestamp to prevent spam
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown

app.get('/', (req, res) => {
  res.send('Smart Drainage backend is running');
});

app.get('/data', (req, res) => {
  res.json({
    count: readings.length,
    latest: readings.length ? readings[readings.length - 1] : null,
  });
});

app.post('/data', async (req, res) => {
  const { distance, motor } = req.body || {};
  
  if (typeof distance !== 'number' || !['ON', 'OFF'].includes(motor)) {
    return res.status(400).json({
      error: 'Invalid payload. Expect: { distance: number, motor: "ON"|"OFF" }',
      got: req.body
    });
  }
  
  const event = { distance, motor, ts: Date.now() };
  readings.push(event);
  console.log('✓ Received:', event);
  
  // Check if distance is below threshold (200cm) and send alert
  if (distance < 200) {
    const now = Date.now();
    const timeSinceLastAlert = now - lastAlertTime;
    
    if (timeSinceLastAlert >= ALERT_COOLDOWN) {
      console.log('🚨 ALERT: Distance below threshold!', { distance, motor });
      const emailSent = await sendAlert(distance, motor);
      
      if (emailSent) {
        lastAlertTime = now;
        console.log('📧 Alert email sent successfully');
      }
    } else {
      const remainingCooldown = Math.round((ALERT_COOLDOWN - timeSinceLastAlert) / 1000 / 60);
      console.log(`⏳ Alert cooldown active. Next alert possible in ${remainingCooldown} minutes`);
    }
  }
  
  res.json({ ok: true });
});

// Health check endpoint for email system
app.get('/email-test', async (req, res) => {
  try {
    const testResult = await transporter.verify();
    res.json({ 
      emailSystem: 'OK',
      config: {
        service: EMAIL_CONFIG.service,
        from: EMAIL_CONFIG.user,
        to: EMAIL_CONFIG.to
      }
    });
  } catch (error) {
    res.status(500).json({ 
      emailSystem: 'ERROR',
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
  console.log(`Email alerts configured for readings below 200cm`);
  console.log(`Alert recipient: ${EMAIL_CONFIG.to}`);
});