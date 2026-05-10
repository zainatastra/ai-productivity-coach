using Microsoft.AspNetCore.Mvc;
using Google.Cloud.Firestore;
using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly IConfiguration _configuration;

        public AuthController(FirestoreDb firestore, IConfiguration configuration)
        {
            _firestore = firestore;
            _configuration = configuration;
        }

        // ================= SEND OTP =================
        [HttpPost("send-otp")]
        public async Task<IActionResult> SendOtp([FromBody] EmailRequest request)
        {
            if (string.IsNullOrEmpty(request.Email))
                return BadRequest("Email is required.");

            var email = request.Email.ToLower().Trim();

            // ================= RATE LIMIT (5 PER HOUR) =================
            var attemptsRef      = _firestore.Collection("otp_attempts").Document(email);
            var attemptsSnapshot = await attemptsRef.GetSnapshotAsync();

            int count            = 0;
            DateTime windowStart = DateTime.UtcNow;

            if (attemptsSnapshot.Exists)
            {
                count       = attemptsSnapshot.GetValue<int>("count");
                windowStart = attemptsSnapshot.GetValue<Timestamp>("windowStart").ToDateTime();

                // reset window after 1 hour
                if ((DateTime.UtcNow - windowStart).TotalHours >= 1)
                {
                    count       = 0;
                    windowStart = DateTime.UtcNow;
                }
            }

            if (count >= 5)
            {
                // ✅ Clear 429 message the frontend can detect
                return StatusCode(429, "OTP limit exhausted. Please wait 60 minutes before requesting a new code.");
            }

            await attemptsRef.SetAsync(new
            {
                count       = count + 1,
                windowStart = windowStart,
            });

            // ================= GENERATE OTP =================
            var otp    = new Random().Next(100000, 999999).ToString();
            var otpRef = _firestore.Collection("email_otps").Document(email);

            await otpRef.SetAsync(new
            {
                email     = email,
                code      = otp,
                expiresAt = Timestamp.FromDateTime(DateTime.UtcNow.AddMinutes(5)),
            });

            // ================= SEND EMAIL =================
            var apiKey = _configuration["Resend:ApiKey"];

            if (string.IsNullOrEmpty(apiKey))
            {
                Console.WriteLine("❌ RESEND API KEY MISSING");
                return StatusCode(500, "Email service is not configured. Please contact support.");
            }

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

            var emailHtml = $@"
<div style='font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;'>
  <div style='max-width: 480px; margin: auto; background: #ffffff; border-radius: 16px; padding: 40px 32px; border: 1px solid #e5e7eb;'>

    <!-- LOGO -->
    <div style='text-align: center; margin-bottom: 24px;'>
      <img
        src='https://ai-productivity-coach-zeta.vercel.app/logo.png'
        alt='AI-Productivity Coach'
        style='height: 48px; object-fit: contain;'
      />
    </div>

    <hr style='margin: 0 0 28px; border: none; border-top: 1px solid #f0f0f0;' />

    <p style='text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 8px;'>
      Your verification code
    </p>

    <p style='text-align: center; color: #374151; font-size: 13px; margin-bottom: 28px;'>
      Use the code below to verify your email address. It expires in <strong>5 minutes</strong>.
    </p>

    <!-- OTP CODE -->
    <div style='text-align: center; margin: 0 0 28px;'>
      <div style='
        display: inline-block;
        font-size: 36px;
        font-weight: 800;
        letter-spacing: 10px;
        padding: 18px 28px;
        border-radius: 14px;
        background: #f4f3ff;
        color: #3b1fa8;
        border: 1.5px solid #ddd6fe;
        font-family: monospace;
      '>
        {otp}
      </div>
    </div>

    <p style='text-align: center; font-size: 13px; color: #6b7280; margin-bottom: 28px;'>
      If you did not request this code, you can safely ignore this email.
    </p>

    <hr style='margin: 0 0 20px; border: none; border-top: 1px solid #f0f0f0;' />

    <p style='font-size: 11px; color: #9ca3af; text-align: center; margin: 0;'>
      © {DateTime.UtcNow.Year} AI-Productivity Coach · All rights reserved
    </p>

  </div>
</div>
";

            var emailData = new
            {
                from    = "AI-Productivity Coach <auth@astrasoftdigital.com>",
                to      = new[] { email },
                subject = "Your AI-Productivity Coach verification code",
                html    = emailHtml,
            };

            var response     = await http.PostAsJsonAsync("https://api.resend.com/emails", emailData);
            var responseBody = await response.Content.ReadAsStringAsync();

            Console.WriteLine("====== RESEND RESPONSE ======");
            Console.WriteLine(responseBody);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine("❌ EMAIL SEND FAILED");
                return StatusCode(500, "Failed to send verification email. Please try again.");
            }

            return Ok(new { message = "Verification code sent." });
        }

        // ================= VERIFY OTP =================
        [HttpPost("verify-otp")]
        public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Code))
                return BadRequest("Email and code are required.");

            var email  = request.Email.ToLower().Trim();
            var otpRef = _firestore.Collection("email_otps").Document(email);

            var snapshot = await otpRef.GetSnapshotAsync();

            if (!snapshot.Exists)
                return BadRequest("No verification code found. Please request a new one.");

            var storedCode = snapshot.GetValue<string>("code");
            var expiresAt  = snapshot.GetValue<Timestamp>("expiresAt").ToDateTime();

            if (DateTime.UtcNow > expiresAt)
            {
                await otpRef.DeleteAsync();
                return BadRequest("OTP expired. Please request a new code.");
            }

            if (storedCode != request.Code)
                return BadRequest("Invalid OTP. Please check the code and try again.");

            // ✅ OTP verified — delete it so it can't be reused
            await otpRef.DeleteAsync();

            return Ok(new { message = "Email verified successfully." });
        }
    }

    public class EmailRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public class VerifyOtpRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Code  { get; set; } = string.Empty;
    }
}
