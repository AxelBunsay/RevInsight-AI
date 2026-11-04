const { GoogleGenerativeAI } = require('@google/generative-ai');

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const CARD_INSIGHT_KEYS = ['trend', 'risk', 'concentration', 'service', 'forecast'];

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function getModelNames() {
  return [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    process.env.GEMINI_FALLBACK_MODEL
  ].filter((modelName, index, models) => modelName && models.indexOf(modelName) === index);
}

function isValidCardInsights(insights) {
  return insights
    && CARD_INSIGHT_KEYS.every((key) => {
      const card = insights[key];
      return card
        && ['descriptive', 'predictive', 'prescriptive'].every((field) => (
          typeof card[field] === 'string'
          && card[field].trim().length > 0
          && card[field].trim().split(/\s+/).length <= 25
        ));
    });
}

function formatMetric(value, suffix = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}${suffix}`;
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function briefLabel(value, wordLimit = 5) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  return words.length > wordLimit ? `${words.slice(0, wordLimit).join(' ')}…` : words.join(' ');
}

function buildTemplateCardInsights(analysisData = {}) {
  const indicators = analysisData.riskLevels || analysisData.revenueRisk?.indicators || {};
  const overallRisk = analysisData.overallRisk || analysisData.revenueRisk?.overallRisk || {};
  const concentrationIndicators = analysisData.revenueConcentration?.indicators || {};
  const contributors = analysisData.revenueConcentration?.contributors || [];
  const topService = contributors.find((item) => /service/i.test(item.contributorType));
  const forecast = analysisData.officialForecast || analysisData.revenueRisk?.officialForecast;
  const qoqValue = formatMetric(indicators.qoqChange?.value, '%');
  const hhiValue = formatMetric(indicators.concentrationHhi?.value);
  const contributorShare = formatMetric(indicators.topContributorShare?.value, '%');
  const forecastChange = formatMetric(indicators.forecastVsFourQuarterAverage?.value, '%');
  const level = (indicator) => indicator?.level || 'Not enough data';
  const forecastText = forecast?.targetLabel && isFiniteNumber(forecast.expected)
    ? `The official projection for ${forecast.targetLabel} is PHP ${Number(forecast.expected).toLocaleString('en-PH')}${isFiniteNumber(forecast.low) && isFiniteNumber(forecast.high) ? `, with a likely range of PHP ${Number(forecast.low).toLocaleString('en-PH')} to PHP ${Number(forecast.high).toLocaleString('en-PH')}` : ''}.`
    : 'Not enough data yet for an official revenue projection.';
  const actionFor = (riskLevel) => riskLevel === 'High'
    ? 'Review the main risk driver and adjust purchasing plans before the next quarter.'
    : riskLevel === 'Moderate'
      ? 'Monitor the main risk driver and review the sales mix before the next quarter.'
      : riskLevel === 'Normal'
        ? 'Continue tracking these indicators during the next regular business review.'
        : 'Record more completed sales and review this indicator again when data is available.';
  const topServiceShare = isFiniteNumber(topService?.share) ? formatMetric(topService.share, '%') : null;
  const topServiceName = briefLabel(topService?.name);

  return {
    trend: {
      descriptive: qoqValue
        ? `Completed-quarter revenue changed ${qoqValue}; the risk level is ${level(indicators.qoqChange)}.`
        : 'Not enough data yet to calculate completed-quarter revenue change.',
      predictive: forecastText,
      prescriptive: actionFor(level(indicators.qoqChange))
    },
    risk: {
      descriptive: overallRisk.level
        ? `Overall revenue risk is ${overallRisk.level}${overallRisk.reason ? `, driven by ${overallRisk.reason}` : ''}.`
        : 'Not enough data yet to calculate overall revenue risk.',
      predictive: forecastText,
      prescriptive: actionFor(overallRisk.level)
    },
    concentration: {
      descriptive: hhiValue && contributorShare
        ? `Revenue concentration HHI is ${hhiValue}, and the top contributor share is ${contributorShare} (${level(indicators.concentrationHhi)} risk).`
        : 'Not enough data yet to describe revenue concentration.',
      predictive: forecastText,
      prescriptive: actionFor(level(indicators.concentrationHhi))
    },
    service: {
      descriptive: topService && topServiceShare
        ? `The leading service contributor is ${topServiceName}, representing ${topServiceShare} of categorized revenue.`
        : 'No service contributor data is available yet.',
      predictive: forecastText,
      prescriptive: 'Review service demand alongside parts sales when planning staffing and inventory.'
    },
    forecast: {
      descriptive: forecastChange
        ? `The official forecast is ${forecastChange} versus the four-quarter average (${level(indicators.forecastVsFourQuarterAverage)} risk).`
        : 'Not enough completed-quarter data is available to compare the forecast with its average.',
      predictive: forecastText,
      prescriptive: actionFor(level(indicators.forecastVsFourQuarterAverage))
    }
  };
}

async function generateRevenueInsights(question, revenueData, dependencies = {}) {
  const client = dependencies.client || gemini;
  const modelNames = dependencies.modelNames || getModelNames();
  const systemInstruction = `
You are a revenue analyst for a motorcycle parts shop.
Answer using only supplied revenue data. Never invent or infer a number that is not present in the data.
Always format monetary amounts as Philippine pesos with thousands separators (for example ₱25,390); never use $ or USD.
Keep the answer concise and use only the supplied Normal, Moderate, and High risk labels and their supplied thresholds.
Organize every answer under exactly these three bold headings, in this order: **Descriptive**, **Predictive**, and **Prescriptive**. Write one to three sentences under each heading.
Descriptive says what the supplied numbers show now. Predictive describes what is likely next using only the official forecast; quote its target quarter label, expected value, likely range, and quarter-to-date revenue/progress exactly when available. If the official forecast or its progress is unavailable, say so. Treat forecasts as statistical projections, not guarantees; never create an alternative forecast. Prescriptive gives practical actions grounded in the supplied data.
Do not use tables or horizontal rules. Never invent products, dates, risk labels, or figures.
  `.trim();

  let lastError;

  for (const modelName of modelNames) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const model = client.getGenerativeModel({ model: modelName, systemInstruction });

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

async function generateCardInsights(analysisData, dependencies = {}) {
  const client = dependencies.client || gemini;
  const modelNames = dependencies.modelNames || getModelNames();
  const fallback = buildTemplateCardInsights(analysisData);
  const systemInstruction = `
You write concise revenue-card insights for a motorcycle shop owner.
Use only the supplied computed numbers, risk labels, and thresholds. Never invent figures, products, or dates.
Return a JSON object with exactly these card keys: ${CARD_INSIGHT_KEYS.join(', ')}.
Each card value must contain exactly three string properties: descriptive, predictive, and prescriptive.
Each property must be one short sentence of no more than 25 words.
Descriptive states what the supplied numbers show now. Predictive uses only the supplied official forecast and explicitly calls it a projection, or says "Not enough data yet" when forecast data is missing. Prescriptive gives one practical shop-owner action.
Output JSON only, with no Markdown fences or extra properties.
  `.trim();
  const prompt = `Computed revenue analysis data:\n${JSON.stringify(analysisData, null, 2)}`;

  for (const modelName of modelNames) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: { responseMimeType: 'application/json' }
      });
      const result = await model.generateContent(prompt);
      const insights = JSON.parse(result.response.text());
      if (isValidCardInsights(insights)) return { insights, source: 'ai' };
    } catch (error) {
      if (dependencies.onError) dependencies.onError(error, modelName);
    }
  }

  return { insights: fallback, source: 'template' };
}

module.exports = {
  CARD_INSIGHT_KEYS,
  buildTemplateCardInsights,
  generateCardInsights,
  generateRevenueInsights,
  isValidCardInsights
};