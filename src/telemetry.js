// ESP32 Serial Monitor Telemetry Output Builder

const WAVELENGTHS = [0, 1650, 1300, 950, 740, 574, 365, 260];

/**
 * Builds formatted text matching the ESP32 Serial output log.
 * @param {number} sampleNum 
 * @param {number} darkADC 
 * @param {number[]} ledsADC 
 * @param {number} distanceMm 
 * @param {number} fillLevelPct 
 * @param {{ carb_pct: number, prot_pct: number, lipid_pct: number, moist_pct: number }} comp 
 * @param {{ carb_ml: number, prot_ml: number, lipid_ml: number, actual_volume_l: number }} dose 
 * @returns {string} Formatted serial log string
 */
export function generateSerialLog(sampleNum, darkADC, ledsADC, distanceMm, fillLevelPct, comp, dose) {
  let log = "";
  log += `=== ESP32 Serial Output (9600 Baud) ===\n\n`;
  log += `+--------+----------+--------+--------+-----------+-----------+\n`;
  log += `| SAMPLE #${String(sampleNum).padEnd(3)}                                               |\n`;
  log += `+--------+----------+--------+--------+-----------+-----------+\n`;
  log += `| LED    |    nm    |  ADC0  |  ADC1  | Norm ADC1 | Diff1/Avg |\n`;
  log += `+--------+----------+--------+--------+-----------+-----------+\n`;
  log += `| Dark   |   --     |   ${String(darkADC - 15).padStart(4)} |   ${String(darkADC).padStart(4)} |    --     |    --     |\n`;
  log += `+--------+----------+--------+--------+-----------+-----------+\n`;

  const avg1 = ledsADC.reduce((a, b) => a + b, 0) / 7.0;

  for (let i = 0; i < 7; i++) {
    const val = ledsADC[i];
    const nm = WAVELENGTHS[i + 1];
    const norm = darkADC !== 0 ? (((val - darkADC) / darkADC) * 100.0).toFixed(1) : "0.0";
    const diff = avg1 !== 0 ? (((val - avg1) / avg1) * 100.0).toFixed(1) : "0.0";

    const normStr = (parseFloat(norm) >= 0 ? "+" : "") + norm + "%";
    const diffStr = (parseFloat(diff) >= 0 ? "+" : "") + diff + "%";

    log += `| LED ${i + 1}  | ${String(nm).padStart(4)} nm  |   ${String(Math.round(val * 0.95)).padStart(4)} |   ${String(val).padStart(4)} | ${normStr.padStart(9)} | ${diffStr.padStart(9)} |\n`;
  }
  log += `+--------+----------+--------+--------+-----------+-----------+\n\n`;

  log += `┌─────────────────────────────────────────┐\n`;
  log += `│         Composition Analysis            │\n`;
  log += `├─────────────────────────────────────────┤\n`;
  log += `│  Carbohydrate : ${comp.carb_pct.toFixed(1).padStart(5)}%                  │\n`;
  log += `│  Protein      : ${comp.prot_pct.toFixed(1).padStart(5)}%                  │\n`;
  log += `│  Lipid        : ${comp.lipid_pct.toFixed(1).padStart(5)}%                  │\n`;
  log += `│  Moisture     : ${comp.moist_pct.toFixed(1).padStart(5)}%                  │\n`;
  const totalComp = (comp.carb_pct + comp.prot_pct + comp.lipid_pct + comp.moist_pct).toFixed(1);
  log += `│  Total        : ${totalComp.padStart(5)}%                  │\n`;
  log += `├─────────────────────────────────────────┤\n`;
  log += `│         Enzyme Dosing (mL)              │\n`;
  log += `├─────────────────────────────────────────┤\n`;
  log += `│  Carb Enzyme  : ${dose.carb_ml.toFixed(2).padStart(5)} mL                 │\n`;
  log += `│  Prot Enzyme  : ${dose.prot_ml.toFixed(2).padStart(5)} mL                 │\n`;
  log += `│  Lipid Enzyme : ${dose.lipid_ml.toFixed(2).padStart(5)} mL                 │\n`;
  log += `├─────────────────────────────────────────┤\n`;
  log += `│         Chamber 2 Level Info            │\n`;
  log += `├─────────────────────────────────────────┤\n`;
  log += `│  Distance     : ${distanceMm.toFixed(1).padStart(5)} mm                 │\n`;
  log += `│  Fill Level   : ${fillLevelPct.toFixed(1).padStart(5)}%                  │\n`;
  log += `│  Actual Vol   : ${dose.actual_volume_l.toFixed(1).padStart(5)} L                  │\n`;
  log += `└─────────────────────────────────────────┘\n`;

  return log;
}
