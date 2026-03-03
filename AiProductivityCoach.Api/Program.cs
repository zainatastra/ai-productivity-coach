using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using AiProductivityCoach.Api.Auth;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();


// 🔥 CORS CONFIGURATION (Allow Next.js frontend)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy.WithOrigins(
                    "http://localhost:3000",
                    "https://localhost:3000"
                )
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

// 🔥 Secure Firebase Initialization
var credential = GoogleCredential
    .FromFile("Firebase/firebase-service-account.json")
    .CreateScoped("https://www.googleapis.com/auth/cloud-platform");

FirebaseApp.Create(new AppOptions()
{
    Credential = credential
});


// 🔥 Firebase Authentication
builder.Services.AddAuthentication("Firebase")
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions,
        FirebaseAuthenticationHandler>("Firebase", null);

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}


// 🔥 IMPORTANT: CORS must be before Authentication
app.UseCors("AllowFrontend");

// 🔥 REMOVE HTTPS REDIRECTION TEMPORARILY
// app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();