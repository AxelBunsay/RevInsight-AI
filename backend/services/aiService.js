const { GoogleGenerativeAI } = require('@google/generative-ai');

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const CARD_INSIGHT_KEYS = ['trend', 'risk', 'concentration', 'service', 'forecast'];
const CARD_INSIGHT_FIELDS = ['summary', 'recommendation', 'ifFollowed', 'ifIgnored'];

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
    && Object.keys(insights).length === CARD_INSIGHT_KEYS.length
    && CARD_INSIGHT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(insights, key))
    && CARD_INSIGHT_KEYS.every((key) => {
      const card = insights[key];
      return card
        && Object.keys(card).length === CARD_INSIGHT_FIELDS.length
        && CARD_INSIGHT_FIELDS.every((field) => (
          typeof card[field] === 'string'
          && card[field].trim().length > 0
          && !/[\r\n]/.test(card[field])
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
  const contributors = analysisData.revenueConcentration?.contributors || [];
  const topService = contributors.find((item) => /service/i.test(item.contributorType));
  const forecast = analysisData.officialForecast || analysisData.revenueRisk?.officialForecast;
  const qoqValue = formatMetric(indicators.qoqChange?.value, '%');
  const hhiValue = formatMetric(indicators.concentrationHhi?.value);
  const contributorShare = formatMetric(indicators.topContributorShare?.value, '%');
  const forecastChange = formatMetric(indicators.forecastVsFourQuarterAverage?.value, '%');
  const level = (indicator) => indicator?.level || 'Not enough data';
  const topServiceShare = isFiniteNumber(topService?.share) ? formatMetric(topService.share, '%') : null;
  const topServiceName = briefLabel(topService?.name);
  const forecastValue = isFiniteNumber(forecast?.expected)
    ? `PHP ${Number(forecast.expected).toLocaleString('en-PH')}`
    : null;
  const riskLevels = {
    trend: level(indicators.qoqChange),
    risk: overallRisk.level || 'Not enough data',
    concentration: level(indicators.concentrationHhi),
    service: level(indicators.topContributorShare),
    forecast: level(indicators.forecastVsFourQuarterAverage)
  };
  const summaries = {
    trend: qoqValue
      ? `Completed-quarter revenue changed ${qoqValue}; the risk level is ${riskLevels.trend}.`
      : 'Not enough data yet to calculate completed-quarter revenue change.',
    risk: overallRisk.level
      ? `Overall revenue risk is ${overallRisk.level}${overallRisk.reason ? `, driven by ${briefLabel(overallRisk.reason)}.` : '.'}`
      : 'Not enough data yet to calculate overall revenue risk.',
    concentration: hhiValue && contributorShare
      ? `Revenue concentration HHI is ${hhiValue}, and the top contributor share is ${contributorShare} (${riskLevels.concentration} risk).`
      : 'Not enough data yet to describe revenue concentration.',
    service: topService && topServiceShare
      ? `The leading service contributor is ${topServiceName}, representing ${topServiceShare} of categorized revenue.`
      : 'Not enough data yet to describe service revenue contribution.',
    forecast: forecastChange && forecast?.targetLabel && forecastValue
      ? `The official forecast for ${briefLabel(forecast.targetLabel)} is ${forecastValue}, ${forecastChange} versus the four-quarter average (${riskLevels.forecast} risk).`
      : 'Not enough data yet to compare the official forecast with the four-quarter average.'
  };
  const topics = {
    trend: 'quarter-over-quarter revenue momentum',
    risk: 'the overall revenue risk driver',
    concentration: 'the balance among revenue contributors',
    service: 'service demand and shop capacity',
    forecast: 'the forecast comparison with the four-quarter average'
  };
  const recommendations = {
    trend: {
      High: 'Compare the last two completed-quarter totals and revise promotions after the revenue decline.',
      Moderate: 'Review completed-quarter revenue monthly and adjust promotions if the change persists.',
      Normal: 'Keep effective promotions in place and verify revenue at the next quarter close.',
      default: 'Record more completed-quarter sales before changing the promotion plan.'
    },
    risk: {
      High: `Review ${briefLabel(overallRisk.reason || 'the leading risk driver')} and set a corrective pricing or promotion action.`,
      Moderate: `Check ${briefLabel(overallRisk.reason || 'the leading risk driver')} and choose one targeted sales-mix adjustment.`,
      Normal: 'Review pricing and promotion results before setting the next quarterly sales plan.',
      default: 'Complete revenue risk records before choosing a corrective shop action.'
    },
    concentration: {
      High: 'Promote a secondary revenue category and review the leading contributor’s sales mix.',
      Moderate: 'Run a focused promotion for a smaller category and compare its revenue share.',
      Normal: 'Review category performance and retain the offers supporting a balanced revenue mix.',
      default: 'Complete category revenue records before planning a sales-mix promotion.'
    },
    service: {
      High: topServiceName
        ? `Review staffing and pricing for ${topServiceName} before taking additional service bookings.`
        : 'Compare completed service jobs with shop capacity before adjusting staffing.',
      Moderate: topServiceName
        ? `Check booking capacity for ${topServiceName} and test a focused service promotion.`
        : 'Compare completed service jobs with available capacity before promoting services.',
      Normal: topServiceName
        ? `Keep ${topServiceName} visible in the booking menu and review its completed jobs.`
        : 'Review completed service jobs before changing the service booking menu.',
      default: 'Record completed service jobs before changing staffing or service promotions.'
    },
    forecast: {
      High: 'Review the next-quarter promotion and purchasing plan against the official forecast comparison.',
      Moderate: 'Use the official forecast comparison to revise the next-quarter sales plan.',
      Normal: 'Align the next-quarter staffing plan with the official forecast comparison.',
      default: 'Record more completed quarters before revising the next-quarter shop plan.'
    }
  };
  const outcomes = {
    trend: {
      High: ['Responding to the decline may stabilize quarter-over-quarter revenue momentum.', 'Ignoring the decline could prolong weaker completed-quarter sales.'],
      Moderate: ['Adjusting promotions may support revenue recovery if the change continues.', 'Overlooking the change could delay a response to shifting sales.'],
      Normal: ['Maintaining effective promotions may preserve the current revenue trend.', 'Unnecessary promotion changes could disrupt a stable sales pattern.']
    },
    risk: {
      High: ['Addressing the leading driver may reduce pressure on overall revenue stability.', 'Ignoring the leading driver could leave the current risk unresolved.'],
      Moderate: ['A targeted response may keep the overall risk from increasing.', 'Delaying a response could allow the identified risk to grow.'],
      Normal: ['Reviewing shop pricing and promotions may help preserve stable revenue.', 'Skipping the review could leave new risk signals unnoticed.']
    },
    concentration: {
      High: ['Promoting another category may reduce dependence on the leading contributor.', 'Ignoring the imbalance could keep revenue concentrated in one contributor.'],
      Moderate: ['A secondary-category promotion may gradually broaden the revenue mix.', 'Ignoring the mix could preserve the current contributor imbalance.'],
      Normal: ['Maintaining balanced category offers may support revenue diversity.', 'Changing balanced offers without evidence could weaken the current mix.']
    },
    service: {
      High: ['Adjusting service capacity may improve availability for customer bookings.', 'Ignoring capacity pressure could limit service availability.'],
      Moderate: ['A focused service promotion may help align bookings with shop capacity.', 'Leaving service demand unchecked could create scheduling mismatches.'],
      Normal: ['Keeping the leading service available may sustain its contribution.', 'Removing attention from it could reduce booking visibility.']
    },
    forecast: {
      High: ['Revising the shop plan may better prepare for the projected revenue gap.', 'Ignoring the comparison could leave the next-quarter plan misaligned.'],
      Moderate: ['Using the forecast comparison may improve next-quarter planning.', 'Ignoring the comparison could weaken planning readiness.'],
      Normal: ['Aligning staffing with the projection may support steady operations.', 'Ignoring the projection could leave staffing plans less prepared.']
    }
  };
  const hasData = {
    trend: Boolean(qoqValue),
    risk: Boolean(overallRisk.level && overallRisk.level !== 'Not enough data'),
    concentration: Boolean(hhiValue && contributorShare),
    service: Boolean(topService && topServiceShare),
    forecast: Boolean(forecastChange && forecast?.targetLabel && forecastValue)
  };

  return Object.fromEntries(CARD_INSIGHT_KEYS.map((cardKey) => {
    const tier = riskLevels[cardKey];
    const cardOutcomes = outcomes[cardKey][tier] || outcomes[cardKey].Normal;
    return [cardKey, {
      summary: summaries[cardKey],
      recommendation: recommendations[cardKey][tier] || recommendations[cardKey].default,
      ifFollowed: hasData[cardKey]
        ? cardOutcomes[0]
        : `Not enough data yet to estimate how this choice could affect ${topics[cardKey]}.`,
      ifIgnored: hasData[cardKey]
        ? cardOutcomes[1]
        : `Not enough data yet to estimate how ignoring this signal could affect ${topics[cardKey]}.`
    }];
  }));
}

async function generateRevenueInsights(question, revenueData, dependencies = {}) {
  const client = dependencies.client || gemini;
  const modelNames = dependencies.modelNames || getModelNames();
  const systemInstruction = `
You are a revenue analyst for a motorcycle parts shop.
Answer using only supplied revenue data. Never invent or infer a number that is not present in the data.
Always format monetary amounts as Philippine pesos with thousands separators (for example ₱25,390); never use $ or USD.
Keep the answer concise and use only the supplied Normal, Moderate, and High risk labels and their supplied thresholds.
Start with an opening paragraph of one to three sentences and no heading, describing what the supplied numbers show now.
Then use a bold **Recommendation** heading with one to three sentences describing specific practical shop-owner actions grounded in the supplied data.
Then use a bold **Possible outcome** heading followed by exactly two lines labeled "If you act:" and "If you ignore it:". Describe qualitative, conditional possibilities grounded in the supplied numbers; do not promise outcomes. If data is insufficient for either line, say "Not enough data yet."
When a question asks about the future, quote the official forecast's target quarter label, expected value, likely range, and quarter-to-date revenue/progress exactly when available; otherwise say the forecast is unavailable. Treat forecasts as statistical projections, not guarantees, and never create an alternative forecast.
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
Each card value must contain exactly four string properties: summary, recommendation, ifFollowed, and ifIgnored.
Each property must be one short sentence of no more than 25 words, with no line breaks. Summary describes the supplied numbers now. Recommendation is a specific action the shop owner can take, not generic tracking advice.
ifFollowed and ifIgnored are qualitative, conditional possibilities based on that card's supplied numbers, never guarantees. Do not repeat the same sentence across cards. Only the forecast card may mention the official forecast; use the supplied forecast only and call it a projection. If relevant data is insufficient, say "Not enough data yet" in that property.
Use card-specific facts to describe possible effects on concentration risk, revenue stability, service capacity, or another relevant indicator. Never invent figures, products, or dates.
Output JSON only, with no Markdown fences or extra properties.
  `.trim();
  const prompt = `Computed revenue analysis data:\n${JSON.stringify(analysisData, null, 2)}`;

  let lastFailure = null;
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
      lastFailure = {
        modelName,
        message: 'Gemini response did not match the card insight schema.'
      };
    } catch (error) {
      lastFailure = {
        modelName,
        message: error?.message || 'Gemini card insight generation failed.'
      };
      if (dependencies.onError) dependencies.onError(error, modelName);
    }
  }

  const failedModel = lastFailure?.modelName || 'no configured model';
  let failureMessage = lastFailure?.message || 'No model returned valid card insights.';
  if (process.env.GEMINI_API_KEY) {
    failureMessage = failureMessage.split(process.env.GEMINI_API_KEY).join('[redacted]');
  }
  console.warn(`[generateCardInsights] Template fallback used; model ${failedModel} failed: ${failureMessage}`);
  return { insights: fallback, source: 'template' };
}

module.exports = {
  CARD_INSIGHT_KEYS,
  CARD_INSIGHT_FIELDS,
  buildTemplateCardInsights,
  generateCardInsights,
  generateRevenueInsights,
  isValidCardInsights
};