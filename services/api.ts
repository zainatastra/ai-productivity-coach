export async function generateProductivity(
  industry: string,
  description: string
) {
  const res = await fetch("/api/productivity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      industry,
      description,
      mode: "generate",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to generate.");
  }

  return data.data;
}

export async function compareIndustry(
  industry: string,
  description: string
) {
  const res = await fetch("/api/productivity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      industry,
      description,
      mode: "compare",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to compare.");
  }

  return data.data;
}