import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
});
const chartColors = ['#e8630f', '#7b8f55', '#d2a148', '#5b7f91', '#9d6d57'];

function getChartLabel(chart) {
  if (chart.type === 'quarter_comparison') return 'Bar chart comparing completed quarter revenue.';
  if (chart.type === 'quarterly_trend') return 'Line chart showing revenue across completed quarters.';
  if (chart.type === 'category_share') return 'Bar chart showing revenue share by category.';
  return 'Bar chart showing the top revenue contributors.';
}

function RevenueAnswerChart({ chart }) {
  const canvasRef = useRef(null);
  const isShare = chart.type === 'category_share';
  const chartType = chart.type === 'quarterly_trend' ? 'line' : 'bar';
  const ariaLabel = getChartLabel(chart);

  useEffect(() => {
    if (!canvasRef.current || !Array.isArray(chart.labels) || !Array.isArray(chart.datasets)) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instance = new Chart(canvasRef.current, {
      type: chartType,
      data: {
        labels: chart.labels,
        datasets: chart.datasets.map((dataset, index) => ({
          ...dataset,
          backgroundColor: chartType === 'line' ? 'rgba(232, 99, 15, .16)' : chartColors[index % chartColors.length],
          borderColor: chartType === 'line' ? chartColors[0] : chartColors[index % chartColors.length],
          borderWidth: chartType === 'line' ? 2 : 1,
          borderRadius: chartType === 'bar' ? 5 : 0,
          tension: chartType === 'line' ? 0.25 : 0,
          fill: chartType === 'line'
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: reduceMotion ? 0 : 220 },
        plugins: {
          legend: { display: chart.datasets.length > 1, labels: { color: '#6b5440' } },
          title: { display: true, text: chart.title, color: '#33271e', align: 'start' },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label ? `${context.dataset.label}: ` : ''}${isShare ? `${context.parsed.y ?? context.parsed.x}%` : peso.format(context.parsed.y ?? context.parsed.x)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#6b5440', maxRotation: 0, autoSkip: true }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f3dcc3' },
            ticks: {
              color: '#6b5440',
              callback: (value) => isShare ? `${value}%` : peso.format(value)
            }
          }
        }
      }
    });
    return () => instance.destroy();
  }, [chart, chartType, isShare]);

  return <figure className="ai-revenue-answer-chart">
    <div className="ai-revenue-answer-chart__canvas" role="img" aria-label={ariaLabel}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
    <figcaption>Chart built from your recorded data</figcaption>
  </figure>;
}

export default RevenueAnswerChart;
