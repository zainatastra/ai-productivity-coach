using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.Auth;

var builder = WebApplication.CreateBuilder(args);

// ==========================================
// 🔥 LOAD ENV VARIABLES
// ==========================================

builder.Configuration.AddEnvironmentVariables();

// Override OpenAI key from ENV if available
var openAiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");

if (!string.IsNullOrWhiteSpace(openAiKey))
{
    builder.Configuration["OpenAI:ApiKey"] = openAiKey;
}

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
                "https://localhost:3000",
                "https://ai-productivity-coach-zeta.vercel.app"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetIsOriginAllowed(origin => true);
    });
});

// ==========================================
// 🔐 FIREBASE INITIALIZATION (FIXED FOR RENDER)
// ==========================================

var firebaseJson = Environment.GetEnvironmentVariable("FIREBASE_CREDENTIALS");

if (string.IsNullOrWhiteSpace(firebaseJson))
{
    throw new Exception("❌ FIREBASE_CREDENTIALS environment variable is missing.");
}

// ✅ Create credential from ENV JSON
var credential = GoogleCredential
    .FromJson(firebaseJson)
    .CreateScoped("https://www.googleapis.com/auth/cloud-platform");

// ✅ Initialize Firebase
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

app.UseRouting();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/", () => "AI Productivity Coach API is running 🚀");

// ==========================================
// 🧪 DEBUG
// ==========================================

Console.WriteLine("=================================");
Console.WriteLine("OPENAI KEY LOADED: " + (builder.Configuration["OpenAI:ApiKey"] ?? "NULL"));
Console.WriteLine("FIREBASE ENV LOADED: " + (!string.IsNullOrEmpty(firebaseJson)));
Console.WriteLine("=================================");

app.Run();