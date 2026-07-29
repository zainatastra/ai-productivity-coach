using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace AiProductivityCoach.Api.Controllers
{
    public class ActivityWorkflowItem
    {
        public string Title { get; set; } = "";
        public string Hours { get; set; } = "";
        public string Description { get; set; } = "";
        public List<string> Tools { get; set; } = new();
    }

    public class ProductivityRequest
    {
        public string Industry    { get; set; } = "";
        public string Description { get; set; } = "";
        public string Mode        { get; set; } = "generate";
        public string Language    { get; set; } = "de";
        public List<ActivityWorkflowItem> Activities { get; set; } = new();
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
            if (request == null ||
                string.IsNullOrWhiteSpace(request.Industry) ||
                string.IsNullOrWhiteSpace(request.Description))
            {
                return BadRequest(new { success = false, message = "Industry and Description are required." });
            }

            try
            {
                // ✅ API KEY — env first, then config
                var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                             ?? _config["OpenAI:ApiKey"];

                if (string.IsNullOrEmpty(apiKey))
                {
                    return Ok(new
                    {
                        success = true,
                        data    = new { message = "⚠️ OpenAI API key missing. Please configure backend." }
                    });
                }

                // ✅ LANGUAGE INSTRUCTION
                var requestedLanguage = string.IsNullOrWhiteSpace(request.Language) ? "de" : request.Language.Trim().ToLowerInvariant();
                string langInstruction = requestedLanguage == "de"
                    ? "Respond ONLY in German language using professional, native-level fluency (C1/C2 level). Keep structure exactly the same."
                    : "Respond ONLY in English language. Keep structure exactly the same.";

                // ✅ BUILD PROMPT BY MODE
                string prompt;

                switch (request.Mode)
                {
                    // ─────────────────────────────────────────
                    // TITLE MODE  — short AI-generated title
                    // ─────────────────────────────────────────
                    case "title":
                        prompt = $@"
You are a concise labeling assistant.

Generate a SHORT, descriptive conversation title for the following user context.

RULES:
- Maximum 5 words
- No punctuation at the end
- No quotes around the title
- Capture the essence of the profession/industry
- Return ONLY the title, nothing else

Industry: {request.Industry}
Description: {request.Description}
Language: {(requestedLanguage == "de" ? "German" : "English")}

Title:";
                        break;

                    // ─────────────────────────────────────────
                    // ACTIVITY ANALYSIS MODE
                    // ─────────────────────────────────────────
                    case "activity-analysis":
                        var activitiesJson = JsonSerializer.Serialize(request.Activities ?? new List<ActivityWorkflowItem>());

                        prompt = $@"
You are a senior AI productivity and workflow optimization analyst.

{langInstruction}

User Context:
Industry: {request.Industry}
Job Description: {request.Description}

Activity Context Provided By User:
{activitiesJson}

Your task:
Analyze the weekly activity breakdown using the activity name, weekly hours, the user's own explanation, and selected tools.

For each activity:
1. Explain what the person is actually spending time on.
2. Detect workflow maturity from the selected tools.
3. Identify manual work, weak tooling, repeated effort, debugging friction, communication overhead, documentation gaps, or automation gaps.
4. Recommend practical tools, technologies, software, methods, or workflow improvements that match the exact activity and industry.
5. Estimate realistic weekly time saving.

STRICT WRITING RULES:
- Speak DIRECTLY to the user using ""you"" and ""your"".
- NEVER write ""the user"", ""this user"", ""they"", or indirect third-person phrasing.
- Do not give generic productivity advice. Every sentence must connect to the activity description, selected tools, or weekly hours.
- The analysis field must be professional, polished, and practical.
- The analysis field must be 4-6 complete sentences and around 80-120 words for each activity.
- Mention what is working well, what is creating friction, and what should be improved next.
- Recommend tools only when they fit the exact activity, not just the broad industry.
- Recommended tools must be specific, useful and directly connected to the activity bottleneck. Do not recommend random, fashionable, or fixed tools across roles.
- Never recommend software development tools for non-development activities. For example, do not suggest VS Code, GitHub, Docker, Swagger, Postman, SonarQube, Sentry, or GitHub Copilot for marketing campaign planning, client communication, audience research, copywriting, design coordination, or reporting unless the user explicitly says they are doing technical development work.
- Match tools to the activity intent: campaign planning needs strategy, research and ad planning tools; performance reporting needs analytics, dashboards and tracking tools; client communication needs meeting, CRM and presentation tools; design coordination needs design, copywriting, approval and collaboration tools; software activities need developer tools.
- The recommendedTools array should contain 3-5 high-impact tools, technologies, software platforms or methods that directly solve the bottleneck.
- Use the selected tools as context, but do not blindly repeat them. If selected tools are weak, incomplete, or not suitable for the activity, recommend better tools and explain why.
- Recommended tools must feel expert-level and activity-specific. Avoid safe generic choices unless they are genuinely the best option for that activity.
- Time saving must be realistic, such as ""1-2 hrs/week"" or ""4-6 hrs/week"".
- Return ONLY valid JSON.
- No markdown.
- No extra commentary outside JSON.

Return JSON exactly in this structure:

{{
  ""overview"": ""A direct 2-3 sentence overall workflow diagnosis written to the user using you/your."",
  ""activities"": [
    {{
      ""title"": ""Activity title exactly as provided"",
      ""analysis"": ""Write a direct, polished 4-6 sentence recommendation addressed to the user. Use you/your. Explain the current workflow, the main bottleneck, the recommended improvement, and the reason it will save time."",
      ""recommendedTools"": [""Relevant tool 1"", ""Relevant tool 2"", ""Relevant tool 3""],
      ""automationGaps"": [""Gap 1"", ""Gap 2""],
      ""timeSaving"": ""X-Y hrs/week""
    }}
  ]
}}
";
                        break;

                    // ─────────────────────────────────────────
                    // COMPARE MODE
                    // ─────────────────────────────────────────
                    case "compare":
                        prompt = $@"
You are an expert workforce analyst and software/tooling intelligence engine.

{langInstruction}

User Context:
Industry: {request.Industry}
Description: {request.Description}

Your task:
Generate a realistic weekly workload breakdown for this role AND generate the most relevant selectable tool chips for each activity.

CRITICAL TOOL RULES:
- Tool chips must be generated by your own intelligence from the exact activity, role, industry, and description.
- Do NOT use a fixed generic list. Do NOT dump the same tools under every activity.
- Each activity must have 8 to 20 toolOptions. Prefer 10 to 14 when possible.
- Every tool must be directly useful for that exact activity. If a tool is only broadly related to the industry but not useful for that activity, exclude it.
- Avoid unrelated cross-industry tools. For example, do not suggest developer tools for admissions, healthcare, e-commerce operations, marketing strategy, client communication or design coordination unless the role clearly involves software development.
- For each activity, include a balanced mix of real software platforms, workflow tools, analytics tools, automation tools, communication tools or specialist systems that fit the exact work.
- Prefer current, recognizable, practical tools used by professionals.
- Do not include vague categories like CRM, EHR System, Database or Dashboard Tool unless a specific platform is not appropriate. Prefer named tools such as Slate, Salesforce Education Cloud, HubSpot, Zendesk, Shopify, ShipStation, Qventus, Looker Studio, etc.
- Do not include tools just because they are popular. Include them only when they solve that activity's actual workflow.

ACTIVITY RULES:
- Total working time MUST be approximately 40 hours/week.
- Show 5 to 8 meaningful activity categories.
- Each activity must have an hours range such as 6-8 hrs/week.
- Activity names must be specific and practical.
- Activities must reflect real behavior for the role, not generic office work.

Return ONLY valid JSON.
No markdown.
No explanations outside JSON.

Return JSON exactly in this structure:

{{
  ""activities"": [
    {{
      ""title"": ""Specific activity name"",
      ""hours"": ""6-8 hrs/week"",
      ""toolOptions"": [""8 to 20 highly relevant activity-specific tools""]
    }}
  ]
}}
";
                        break;

                    // ─────────────────────────────────────────
                    // GENERATE MODE (default)
                    // ─────────────────────────────────────────
                    default:
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
                        break;
                }

                // ✅ CALL OPENAI
                using var httpClient = new HttpClient();
                httpClient.DefaultRequestHeaders.Clear();
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

                var requestBody = new
                {
                    model    = "gpt-4o-mini",
                    messages = new[] { new { role = "user", content = prompt } },
                    temperature = request.Mode == "title" ? 0.4 : (request.Mode == "activity-analysis" ? 0.45 : (request.Mode == "compare" ? 0.35 : 0.7)),
                    max_tokens  = request.Mode == "title" ? 20 : (request.Mode == "activity-analysis" ? 2600 : (request.Mode == "compare" ? 2200 : 1000)),
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response       = await httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content);
                var responseString = await response.Content.ReadAsStringAsync();

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

                return Ok(new { success = true, data = new { message = aiText } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}