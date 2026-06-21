export async function llmAnswer(question: string, context: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";

  const prompt = `Anda adalah asisten AI yang membantu developer menjawab pertanyaan tentang proyek berdasarkan dokumentasi.
Gunakan HANYA konteks yang diberikan di bawah ini. Jika jawaban tidak ada di konteks, katakan Anda tidak tahu.

${context}

Pertanyaan: ${question}
`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("LLM API Error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error("LLM Fetch Error:", error);
    return null;
  }
}
