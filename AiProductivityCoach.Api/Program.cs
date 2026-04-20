using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.Auth;

var builder = WebApplication.CreateBuilder(args);

// ==========================================
// 🔥 CONFIGURATION
// ==========================================

builder.Configuration
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

// ==========================================
// 🔑 OPENAI KEY
// ==========================================

var openAiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
    ?? builder.Configuration["OpenAI:ApiKey"];

if (string.IsNullOrWhiteSpace(openAiKey))
{
    throw new InvalidOperationException(
        "OpenAI API key is not configured. " +
        "Set the OPENAI_API_KEY environment variable or OpenAI:ApiKey in appsettings."
    );
}

builder.Configuration["OpenAI:ApiKey"] = openAiKey;

// ==========================================
// 🔥 CORE SERVICES
// ==========================================

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ==========================================
// 🌍 CORS
// ==========================================

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()
    ?? new[]
    {
        "http://localhost:3000",
        "https://localhost:3000",
        "https://ai-productivity-coach-zeta.vercel.app"
    };

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// ==========================================
// 🔐 FIREBASE CREDENTIAL RESOLUTION
// Priority: ENV var → local firebase-key.json (dev only)
// ==========================================

var firebaseJson = Environment.GetEnvironmentVariable("FIREBASE_CREDENTIALS");

if (string.IsNullOrWhiteSpace(firebaseJson))
{
    if (builder.Environment.IsDevelopment())
    {
        // ✅ Local dev: load from file inside Firebase/ folder
        var localKeyPath = Path.Combine(
            Directory.GetCurrentDirectory(),
            "Firebase",
            "firebase-key.json"
        );

        if (File.Exists(localKeyPath))
        {
            firebaseJson = File.ReadAllText(localKeyPath);
            Console.WriteLine("[Firebase] Loaded credentials from local firebase-key.json");
        }
        else
        {
            throw new InvalidOperationException(
                $"[Firebase] Running in Development but no credentials found. " +
                $"Set FIREBASE_CREDENTIALS env var OR place firebase-key.json at: {localKeyPath}"
            );
        }
    }
    else
    {
        // ❌ Production/Staging must always use env var — never ship key files
        throw new InvalidOperationException(
            "[Firebase] FIREBASE_CREDENTIALS environment variable is required in non-development environments. " +
            "Set it in your hosting provider (Render, Railway, etc.) as a secret environment variable."
        );
    }
}

// ==========================================
// 🔐 FIREBASE INITIALIZATION
// ==========================================

GoogleCredential credential;

try
{
    credential = GoogleCredential
        .FromJson(firebaseJson)
        .CreateScoped("https://www.googleapis.com/auth/cloud-platform");
}
catch (Exception ex)
{
    throw new InvalidOperationException(
        "[Firebase] Failed to parse Firebase credentials JSON. Ensure it is a valid service account key.", ex
    );
}

if (FirebaseApp.DefaultInstance == null)
{
    FirebaseApp.Create(new AppOptions { Credential = credential });
    Console.WriteLine("[Firebase] FirebaseApp initialized.");
}

// ==========================================
// 🗄 FIRESTORE  (✅ FIX: explicit generic type)
// ==========================================

var firestoreProjectId = builder.Configuration["Firebase:ProjectId"]
    ?? "ai-productivity-coach-d40b7";

builder.Services.AddSingleton<FirestoreDb>(_ =>
    new FirestoreDbBuilder
    {
        ProjectId = firestoreProjectId,
        Credential = credential
    }.Build()
);

Console.WriteLine($"[Firestore] Registered in DI (Project = {firestoreProjectId})");

// ==========================================
// 🔐 AUTHENTICATION
// ==========================================

builder.Services
    .AddAuthentication("Firebase")
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, FirebaseAuthenticationHandler>("Firebase", null);

builder.Services.AddAuthorization();

// ==========================================
// 🚀 BUILD APP
// ==========================================

var app = builder.Build();

// ==========================================
// 🔧 MIDDLEWARE PIPELINE
// ==========================================

app.UseRouting();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Swagger only in non-production to avoid exposing API surface
if (!app.Environment.IsProduction())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/", () => Results.Ok(new
{
    status = "running",
    app = "AI Productivity Coach API",
    environment = app.Environment.EnvironmentName,
    timestamp = DateTime.UtcNow
}));

// Health check endpoint for Render / uptime monitors
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// ==========================================
// 🧪 STARTUP DIAGNOSTICS (non-production only)
// ==========================================

if (!app.Environment.IsProduction())
{
    Console.WriteLine("===========================================");
    Console.WriteLine($"  Environment : {app.Environment.EnvironmentName}");
    Console.WriteLine($"  OpenAI Key  : {(string.IsNullOrEmpty(openAiKey) ? "❌ MISSING" : "✅ Loaded")}");
    Console.WriteLine($"  Firebase    : ✅ Loaded");
    Console.WriteLine($"  Firestore   : Project = {firestoreProjectId}");
    Console.WriteLine($"  CORS Origins: {string.Join(", ", allowedOrigins)}");
    Console.WriteLine("===========================================");
}

app.Run();