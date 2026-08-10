// Spectral Profile Canvas Renderer

const WAVELENGTHS = [1650, 1300, 950, 740, 574, 365, 260];
const LED_NAMES = ["LED 1 (1650nm)", "LED 2 (1300nm)", "LED 3 (950nm)", "LED 4 (740nm)", "LED 5 (574nm)", "LED 6 (365nm)", "LED 7 (260nm)"];

/**
 * Draws the spectral profile graph on HTML5 Canvas element.
 * @param {HTMLCanvasElement} canvas 
 * @param {number} darkADC 
 * @param {number[]} ledsADC 
 */
export function drawSpectralChart(canvas, darkADC, ledsADC) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement.clientWidth || 600;
  const height = canvas.height = 240;

  // Clear background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 40;

  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;

  // Y-axis range (0 to max ADC)
  const maxVal = Math.max(30000, ...ledsADC);
  const minVal = 0;

  // Grid lines
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#64748b";
  ctx.font = "11px Inter, sans-serif";

  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const yVal = minVal + (maxVal - minVal) * (i / ySteps);
    const y = height - paddingBottom - (i / ySteps) * graphHeight;

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.round(yVal).toLocaleString(), paddingLeft - 8, y);
  }

  // Dark baseline line
  const darkY = height - paddingBottom - ((darkADC - minVal) / (maxVal - minVal)) * graphHeight;
  ctx.strokeStyle = "#cbd5e1";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(paddingLeft, darkY);
  ctx.lineTo(width - paddingRight, darkY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot line
  const points = ledsADC.map((val, idx) => {
    const x = paddingLeft + (idx / (ledsADC.length - 1)) * graphWidth;
    const y = height - paddingBottom - ((val - minVal) / (maxVal - minVal)) * graphHeight;
    return { x, y, val, nm: WAVELENGTHS[idx] };
  });

  // Gradient area under curve
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.15)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.0)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
  ctx.lineTo(points[0].x, height - paddingBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Solid line curve
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Data point markers & X labels
  points.forEach((p, idx) => {
    // Circle marker
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // X-axis label (Wavelength nm)
    ctx.fillStyle = "#334155";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 11px Inter, sans-serif";
    ctx.fillText(`${p.nm}nm`, p.x, height - paddingBottom + 8);
  });
}
