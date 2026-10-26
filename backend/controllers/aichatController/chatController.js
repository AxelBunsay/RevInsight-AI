const { GoogleGenerativeAI } = require('@google/generative-ai');

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const generateReply = async (message) => {
  const modelNames = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    process.env.GEMINI_FALLBACK_MODEL
  ].filter(Boolean);

  let lastError;

  for (const modelName of modelNames) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const model = gemini.getGenerativeModel({
          model: modelName,
          systemInstruction: 'You are a helpful assistant for a motorcycle parts and service shop. Only answer questions about motorcycle parts, maintenance, services, reservations, and shop operations. For unrelated requests, briefly explain that you can only help with motorcycle and shop questions.'
        });

        const result = await model.generateContent(message);

        return result.response.text();
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
};

const chat = async (req, res) => {
  try {
    const { message } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        message: 'Message is required'
      });
    }
    if (message.length > 500) {
      return res.status(400).json({
        message: 'Message must be 500 characters or fewer.'
      });
    }

    const reply = await generateReply(message.trim());

    return res.status(200).json({
      reply
    });
  } catch (error) {
    console.error('[chat] error:', error);

    if (error.status === 503) {
      return res.status(503).json({
        message: 'The AI service is temporarily busy. Please try again.'
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        message: 'AI usage limit reached. Please try again later.'
      });
    }

    return res.status(500).json({
      message: 'Unable to process chat message'
    });
  }
};

module.exports = {
  chat
};