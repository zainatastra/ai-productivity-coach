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
                return BadRequest("Email is required");

            var email = request.Email.ToLower().Trim();

            // ================= RATE LIMIT (5 PER HOUR) =================
            var attemptsRef = _firestore.Collection("otp_attempts").Document(email);
            var attemptsSnapshot = await attemptsRef.GetSnapshotAsync();

            int count = 0;
            DateTime windowStart = DateTime.UtcNow;

            if (attemptsSnapshot.Exists)
            {
                count = attemptsSnapshot.GetValue<int>("count");
                windowStart = attemptsSnapshot.GetValue<Timestamp>("windowStart").ToDateTime();

                if ((DateTime.UtcNow - windowStart).TotalHours >= 1)
                {
                    count = 0;
                    windowStart = DateTime.UtcNow;
                }
            }

            if (count >= 5)
            {
                return StatusCode(429, "OTP Resend Limit Exhausted, Please try again after 60 minutes");
            }

            await attemptsRef.SetAsync(new
            {
                count = count + 1,
                windowStart = windowStart
            });

            // ================= GENERATE OTP =================
            var otp = new Random().Next(100000, 999999).ToString();

            var otpRef = _firestore.Collection("email_otps").Document(email);

            await otpRef.SetAsync(new
            {
                email = email,
                code = otp,
                expiresAt = Timestamp.FromDateTime(DateTime.UtcNow.AddMinutes(5))
            });

            // ================= SEND EMAIL =================
            var apiKey = _configuration["Resend:ApiKey"];

            if (string.IsNullOrEmpty(apiKey))
            {
                Console.WriteLine("❌ RESEND API KEY MISSING");
                return StatusCode(500, "Resend API key not configured");
            }

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

var emailHtml = $@"
<div style='font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;'>
  <div style='max-width: 480px; margin: auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;'>

    <h2 style='text-align: center; margin-bottom: 12px;'>AI Productivity Coach</h2>

    <!-- LOGO -->
    <div style='text-align: center; margin-bottom: 12px;'>
      <img 
        src='https://astrasoftdigital.com/wp-content/uploads/2026/03/logo-scaled.png' 
        alt='Logo' 
        style='height: 40px; object-fit: contain;' 
      />
    </div>

    <p style='text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 24px;'>
      Verify your email address
    </p>

    <div style='text-align: center; margin: 30px 0;'>
      <div style='display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 16px 24px; border-radius: 10px; background: #f3f4f6;'>
        {otp}
      </div>
    </div>

    <p style='text-align: center; font-size: 14px; color: #374151;'>
      This code will expire in <strong>5 minutes</strong>.
    </p>

    <hr style='margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;' />

    <p style='font-size: 12px; color: #9ca3af; text-align: center;'>
      If you didn’t request this, you can safely ignore this email.
    </p>

  </div>

  <p style='text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;'>
    © {DateTime.UtcNow.Year} AI Productivity Coach
  </p>
</div>
";

            var emailData = new
            {
                from = "AI Productivity Coach <auth@astrasoftdigital.com>", // 🔥 improved sender
                to = new[] { email },
                subject = "Your AI Productivity Coach verification code",
                html = emailHtml
            };

            var response = await http.PostAsJsonAsync("https://api.resend.com/emails", emailData);
            var responseBody = await response.Content.ReadAsStringAsync();

            Console.WriteLine("====== RESEND RESPONSE ======");
            Console.WriteLine(responseBody);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine("❌ EMAIL FAILED");
                return StatusCode(500, responseBody);
            }

            return Ok(new { message = "OTP sent" });
        }

        // ================= VERIFY OTP =================
        [HttpPost("verify-otp")]
        public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Code))
                return BadRequest("Email and code required");

            var email = request.Email.ToLower().Trim();

            var otpRef = _firestore.Collection("email_otps").Document(email);
            var snapshot = await otpRef.GetSnapshotAsync();

            if (!snapshot.Exists)
                return BadRequest("OTP not found");

            var storedCode = snapshot.GetValue<string>("code");
            var expiresAt = snapshot.GetValue<Timestamp>("expiresAt").ToDateTime();

            if (DateTime.UtcNow > expiresAt)
                return BadRequest("OTP expired");

            if (storedCode != request.Code)
                return BadRequest("Invalid OTP");

            await otpRef.DeleteAsync();

            return Ok(new { message = "OTP verified" });
        }
    }

    public class EmailRequest
    {
        public string Email { get; set; }
    }

    public class VerifyOtpRequest
    {
        public string Email { get; set; }
        public string Code { get; set; }
    }
}