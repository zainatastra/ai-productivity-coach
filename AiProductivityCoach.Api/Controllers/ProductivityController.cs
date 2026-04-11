using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace AiProductivityCoach.Api.Controllers
{
    public class ProductivityRequest
    {
        public string Industry { get; set; }
        public string Description { get; set; }
        public string Mode { get; set; }
        public string Language { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class ProductivityController : ControllerBase
    {
        private readonly IConfiguration _config;

        public ProductivityController(IConfiguration config)
        {
            _config = config;
        }

        [HttpPost]
        public async Task<IActionResult> HandleProductivity([FromBody] ProductivityRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Industry) || string.IsNullOrWhiteSpace(request.Description))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Industry and Description are required."
                });
            }

            try
            {
                // ✅ GET API KEY (ENV FIRST, THEN CONFIG)
                var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                             ?? _config["OpenAI:ApiKey"];

                if (string.IsNullOrEmpty(apiKey))
                {
                    return Ok(new
                    {
                        success = true,
                        data = new
                        {
                            message = "⚠️ OpenAI API key missing. Please configure backend."
                        }
                    });
                }

                // ✅ LANGUAGE CONTROL (NEW)
                string langInstruction = request.Language == "de"
                    ? "Respond ONLY in German language using professional, native-level fluency (C1/C2 level). Keep structure exactly the same."
                    : "Respond ONLY in English language. Keep structure exactly the same.";

                // ✅ BRANCH BY MODE
                string prompt;

                if (request.Mode == "compare")
                {
                    prompt = $@"
You are an expert workforce analyst.

{langInstruction}

User Context:
Industry: {request.Industry}
Description: {request.Description}

Your task:
Generate a realistic weekly workload breakdown of professionals in this field.

RULES:
- Total working time MUST be ~40 hours/week
- Show 5–8 meaningful activity categories (NOT fixed)
- Each activity must have hours range (e.g. 6–8 hrs/week)
- Activities must reflect REAL industry behavior
- Be practical, not generic

FORMAT:

<Activity Name> — <hours/week>

Example:
Development — 18–22 hrs/week
Meetings — 5–7 hrs/week
...

DO NOT include explanations.
DO NOT repeat previous output.
ONLY return the activity breakdown.
";
                }
                else
                {
                    prompt = $@"
You are an expert labor market analyst specializing in workforce classification and job role analysis in Germany.

{langInstruction}

User Input:
Industry: {request.Industry}
Description: {request.Description}

Your task:
1. Map the user's input to a REAL and OFFICIAL industry category.
2. Identify the TRUE professional work field (not what user says, but what it actually is).
3. Provide a strong, structured explanation (4–7 FULL sentences).
4. Provide a realistic benchmark (approximate number or range of workers in Germany).

STRICT RULES:
- MUST use complete, professional sentences (NO fragments like ""The role of a"")
- MUST be between 4 to 7 sentences (not less, not more)
- MUST clearly describe responsibilities and nature of work
- MUST include 1–2 **bold insights**
- MUST NOT repeat the user input directly
- MUST NOT hallucinate unrealistic numbers
- If exact data is unknown → provide a logical approximation range

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

**Industry**
<Official industry name>

**Work Field**
<Professional classification (e.g. Software Engineering - Frontend Development)>

**Description**
Write 4–7 full sentences explaining the role clearly.
Include:
- What the person actually does
- Key responsibilities
- Tools/skills involved
- 1–2 important insights in **bold**

**Benchmark**
<Approximate number or range of similar professionals in Germany>

**Next**
Would you like to see what activities they spend their working week doing?
";
                }

                using var httpClient = new HttpClient();

                httpClient.DefaultRequestHeaders.Clear();
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

                var requestBody = new
                {
                    model = "gpt-4o-mini",
                    messages = new[]
                    {
                        new { role = "user", content = prompt }
                    },
                    temperature = 0.7
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await httpClient.PostAsync(
                    "https://api.openai.com/v1/chat/completions",
                    content
                );

                var responseString = await response.Content.ReadAsStringAsync();

                // ✅ HANDLE OPENAI ERROR PROPERLY
                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, new
                    {
                        success = false,
                        message = "OpenAI API error",
                        details = responseString
                    });
                }

                using var doc = JsonDocument.Parse(responseString);

                var aiText = doc
                    .RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        message = aiText
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }
    }
}