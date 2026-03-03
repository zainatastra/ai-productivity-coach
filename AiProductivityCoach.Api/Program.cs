using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.Auth;

var builder = WebApplication.CreateBuilder(args);

// ==========================================
// 🔥 SERVICES
// ==========================================

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ==========================================
// 🌍 CORS CONFIGURATION
// ==========================================

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:3000",
                "https://localhost:3000"
                // Add your frontend production domain here later
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// ==========================================
// 🔐 FIREBASE INITIALIZATION
// ==========================================

var firebaseJson = Environment.GetEnvironmentVariable("FIREBASE_CREDENTIALS");

if (string.IsNullOrWhiteSpace(firebaseJson))
{
    throw new Exception("FIREBASE_CREDENTIALS environment variable is not set.");
}

var credential = GoogleCredential
    .FromJson(firebaseJson)
    .CreateScoped("https://www.googleapis.com/auth/cloud-platform");

if (FirebaseApp.DefaultInstance == null)
{
    FirebaseApp.Create(new AppOptions
    {
        Credential = credential
    });
}

// ==========================================
// 🗄 FIRESTORE
// ==========================================

builder.Services.AddSingleton(provider =>
{
    return new FirestoreDbBuilder
    {
        ProjectId = "ai-productivity-coach-d40b7",
        Credential = credential
    }.Build();
});

// ==========================================
// 🔐 AUTHENTICATION
// ==========================================

builder.Services
    .AddAuthentication("Firebase")
    .AddScheme<
        Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions,
        FirebaseAuthenticationHandler>("Firebase", null);

builder.Services.AddAuthorization();

// ==========================================
// 🚀 APP PIPELINE
// ==========================================

var app = builder.Build();

// Enable Swagger in production too
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Optional health check endpoint
app.MapGet("/", () => "AI Productivity Coach API is running 🚀");

app.Run();