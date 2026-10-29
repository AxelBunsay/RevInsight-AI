const { GoogleGenerativeAI } = require('@google/generative-ai');

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function generateRevenueInsights(question, revenueData) {
  const systemInstruction = `
You are a revenue analyst for a motorcycle parts shop.
Answer using only supplied revenue data. Never invent or infer a number that is not present in the data.
Always format monetary amounts as Philippine pesos with thousands separators (for example ₱25,390); never use $ or USD.
Keep the answer under about 250 words. Do not use tables or horizontal rules.
Use exactly this Markdown structure:
## Summary
Write 2 sentences.
## Key numbers
Write 3-5 bullets.
## Risks and trends
Write 2-4 bullets.
## What to do next
Write 2-4 bullets.
If the question asks about the future, finish with one line stating that the result is a statistical projection, not a guarantee.
  `.trim();

  const modelNames = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    process.env.GEMINI_FALLBACK_MODEL
  ].filter(Boolean);

  let lastError;

  for (const modelName of modelNames) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const model = gemini.getGenerativeModel({ model: modelName, systemInstruction });

        const result = await model.generateContent(`Revenue Data:\n${JSON.stringify(revenueData, null, 2)}\n\nUser Question: ${question}`);
        return result.response.text().trim();
      } catch (error) {
        lastError = error;

        if (error.status !== 503 || attempt === 2) {
          break;
        }

        await wait(1500);
      }
    }
  }

  throw lastError;
}

module.exports = { generateRevenueInsights };