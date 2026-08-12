/* ==========================================================================
   Intellidigest SPECTRA Dashboard Controller
   Real-Time Firestore Integration, Chart.js Visualization, and Filters
   ========================================================================== */

const WLS    = [1650, 1300, 950, 740, 574, 365, 260];
const LABELS = ['IR', 'IR', 'NIR', 'Red', 'YGrn', 'UV', 'UV'];
// Vivid Neon Spectrum Palette
const CLR    = ['#ff3366', '#ff9900', '#ffe600', '#00ff66', '#00f0ff', '#38bdf8', '#d946ef'];
const SPBG   = ['#450a1a', '#431407', '#422006', '#053316', '#04343a', '#082f49', '#3b0764'];

let cMain, cNorm, cComp, cDosing;
let timer = null;
let allData = []; // Cache of parsed Firestore documents (Chronological, ascending)
let winSize = 50;
let offset = 0;
let yMin = null;
let yMax = null;

function formatDDMM_HHMMSS(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${dd}${mm}_${hh}${mi}${ss}`;
}

// Convert DDMM_HHMMSS or timestamp to HH:MM:SS format (UTC)
function formatDocIdToTime(id) {
  if (!id) return "--:--:--";
  const parts = id.split("_");
  if (parts.length === 2 && parts[1].length === 6) {
    const hh = parts[1].substring(0, 2);
    const mm = parts[1].substring(2, 4);
    const ss = parts[1].substring(4, 6);
    return `${hh}:${mm}:${ss}`;
  }
  return id;
}

// Firebase References
let fbApp = null;
let unsubscribeFirestore = null;

// Live Clock update (UTC)
setInterval(() => {
  const clockEl = document.getElementById('clk');
  if (clockEl) {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    clockEl.textContent = `${hh}:${mm}:${ss} UTC`;
  }
}, 500);

// Status Badge Helper
function setS(state, txt) {
  const dot = document.getElementById('dot');
  const stxt = document.getElementById('stxt');
  if (!dot || !stxt) return;
  dot.className = 'dot ' + state;
  stxt.textContent = txt;
  stxt.style.color = state === 'live' ? 'var(--green-bright)' : state === 'wait' ? 'var(--amber-bright)' : 'var(--red-bright)';
}

// Error bar Helper
function showErr(m) {
  const e = document.getElementById('err');
  if (!e) return;
  e.textContent = '⚠  ' + m;
  e.style.display = 'block';
}

function noErr() {
  const e = document.getElementById('err');
  if (e) e.style.display = 'none';
}

// Initialize Connections
window.init = async function() {
  const pidInput = document.getElementById('pid');
  const akeyInput = document.getElementById('akey');
  if (!pidInput || !akeyInput) return;

  const PID = pidInput.value.trim();
  const AKEY = akeyInput.value.trim();

  if (!PID || !AKEY) {
    showErr('Please enter both Project ID and API Key, then click CONNECT.');
    setS('wait', 'WAITING FOR KEYS');
    return;
  }

  // Save to localStorage for convenience
  try {
    localStorage.setItem('spectra_pid', PID);
    localStorage.setItem('spectra_akey', AKEY);
  } catch (e) {}

  noErr();
  if (timer) clearInterval(timer);
  if (unsubscribeFirestore) unsubscribeFirestore();

  setS('wait', 'CONNECTING...');

  try {
    if (!fbApp) {
      fbApp = firebase.initializeApp({
        apiKey: AKEY,
        projectId: PID,
        authDomain: `${PID}.firebaseapp.com`
      });
    } else {
      // If re-initializing with different keys
      try {
        await fbApp.delete();
      } catch (e) {}
      fbApp = firebase.initializeApp({
        apiKey: AKEY,
        projectId: PID,
        authDomain: `${PID}.firebaseapp.com`
      });
    }

    const auth = firebase.auth();
    auth.signInWithEmailAndPassword("wft.jaskaran@intellidigest.com", "wft.jaskaran@intellidigest.com")
      .then(() => {
        console.log("Firestore authenticated successfully.");
        setS('live', 'CONNECTED');
        setupRealtimeListener(PID);
      })
      .catch(err => {
        console.error("Firebase auth failed, falling back to REST API polling", err);
        tickRest(PID, AKEY);
        timer = setInterval(() => tickRest(PID, AKEY), 4000);
      });

  } catch (e) {
    setS('err', 'ERROR');
    showErr(e.message);
  }
};

// Real-Time Firestore snapshot listener
function setupRealtimeListener(projectId) {
  const db = firebase.firestore();
  
  unsubscribeFirestore = db.collection("Desktop_Unit")
    .orderBy(firebase.firestore.FieldPath.documentId(), "asc")
    .onSnapshot(snapshot => {
      allData = [];
      snapshot.forEach(doc => {
        const parsed = parseDoc(doc.id, doc.data());
        if (parsed) allData.push(parsed);
      });

      console.log(`Synced ${allData.length} records in real-time.`);
      noErr();
      setS('live', 'LIVE · REALTIME');
      
      updateOffsetMax();
      processAndRender();
    }, err => {
      console.error("Firestore snapshot error:", err);
      showErr("Snapshot error: " + err.message);
      setS('err', 'SYNC ERROR');
    });
}

// Fallback REST API polling
async function tickRest(projectId, apiKey) {
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/Desktop_Unit?key=${apiKey}&pageSize=300`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (!d.documents?.length) throw new Error('No documents found in Desktop_Unit.');
    
    const samps = d.documents.map(doc => {
      const parts = doc.name.split('/');
      const docId = parts[parts.length - 1];
      
      const fields = {};
      for (const [key, value] of Object.entries(doc.fields || {})) {
        if ('integerValue' in value) fields[key] = { integerValue: value.integerValue };
        else if ('doubleValue' in value) fields[key] = { doubleValue: value.doubleValue };
        else if ('stringValue' in value) fields[key] = { stringValue: value.stringValue };
        else if ('mapValue' in value) {
          const mapFields = {};
          for (const [mk, mv] of Object.entries(value.mapValue.fields || {})) {
            if ('integerValue' in mv) mapFields[mk] = { integerValue: mv.integerValue };
            else if ('doubleValue' in mv) mapFields[mk] = { doubleValue: mv.doubleValue };
            else if ('stringValue' in mv) mapFields[mk] = { stringValue: mv.stringValue };
          }
          fields[key] = { mapValue: { fields: mapFields } };
        }
      }
      
      return parseDoc(docId, fields);
    }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));

    allData = samps;
    updateOffsetMax();
    processAndRender();
    noErr();
    setS('live', 'LIVE · POLLING');
  } catch (e) {
    setS('err', 'ERROR');
    showErr(e.message);
  }
}

function val(field, defaultValue = 0) {
  if (field === undefined || field === null) return defaultValue;
  if (typeof field === 'object' && field !== null) {
    if ('integerValue' in field) return parseInt(field.integerValue);
    if ('doubleValue' in field) return parseFloat(field.doubleValue);
    if ('stringValue' in field) return field.stringValue;
  }
  return field;
}

function getMapFields(field) {
  if (field === undefined || field === null) return {};
  if (typeof field === 'object' && field !== null && 'mapValue' in field) {
    return field.mapValue.fields || {};
  }
  return field;
}

function parseDoc(id, f) {
  try {
    const compFields = getMapFields(f.composition);
    const dosingFields = getMapFields(f.dosing);

    const s = {
      id: id,
      timeStr: formatDocIdToTime(id),
      n: parseInt(val(f.sample_number, 0)),
      d0: parseInt(val(f.dark_adc0, 0)),
      d1: parseInt(val(f.dark_adc1, 0)),
      a0: parseFloat(val(f.avg_adc0, 0)),
      a1: parseFloat(val(f.avg_adc1, 0)),
      fill_level: parseFloat(val(f.fill_level, 0)),
      distance: parseFloat(val(f.distance, 0)),
      composition: {
        carb: parseFloat(val(compFields.CarbPerc || compFields.carb_pct, 0)),
        prot: parseFloat(val(compFields.ProtPerc || compFields.prot_pct, 0)),
        lipid: parseFloat(val(compFields.LipidPerc || compFields.lipid_pct, 0)),
        moist: parseFloat(val(compFields.MoistPerc || compFields.moist_pct, 0))
      },
      dosing: {
        carb: parseFloat(val(dosingFields.CarbEnzMl || dosingFields.carb_ml, 0)),
        prot: parseFloat(val(dosingFields.ProtEnzMl || dosingFields.prot_ml, 0)),
        lipid: parseFloat(val(dosingFields.LipidEnzMl || dosingFields.lipid_ml, 0))
      },
      leds: {}
    };

    WLS.forEach(wl => {
      const k = `led_${wl}nm`;
      if (f[k]) {
        const ledFields = getMapFields(f[k]);
        s.leds[wl] = {
          a0: parseInt(val(ledFields.adc0, 0)),
          a1: parseInt(val(ledFields.adc1, 0)),
          n1: parseFloat(val(ledFields.norm_adc1 || ledFields.n1, 0)),
          d1: parseFloat(val(ledFields.diff_from_avg1 || ledFields.d1, 0))
        };
      } else {
        s.leds[wl] = { a0: 0, a1: 0, n1: 0, d1: 0 };
      }
    });
    return s;
  } catch (err) {
    console.error("Doc parsing failed:", err, f);
    return null;
  }
}

function parseDocIdToDate(id) {
  const parts = id.split("_");
  if (parts.length !== 2) return null;
  
  const datePart = parts[0]; // "DDMM"
  const timePart = parts[1]; // "HHMMSS"
  
  if (datePart.length !== 4 || timePart.length !== 6) return null;
  
  const day = parseInt(datePart.substring(0, 2));
  const month = parseInt(datePart.substring(2, 4)) - 1;
  const year = 2026;
  
  const hour = parseInt(timePart.substring(0, 2));
  const min = parseInt(timePart.substring(2, 4));
  const sec = parseInt(timePart.substring(4, 6));
  
  // Construct explicitly in UTC timestamp
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

function parseInputDateToUTC(val) {
  if (!val) return null;
  const [dPart, tPart] = val.split("T");
  const [year, month, day] = dPart.split("-").map(Number);
  const [hour, min] = tPart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, min, 0));
}

function getFilteredDataset() {
  let dataset = allData;

  const startVal = document.getElementById("filter-start").value;
  const endVal = document.getElementById("filter-end").value;

  if (startVal) {
    const startDate = parseInputDateToUTC(startVal);
    dataset = dataset.filter(d => {
      const dDate = parseDocIdToDate(d.id);
      return dDate && dDate.getTime() >= startDate.getTime();
    });
  }

  if (endVal) {
    const endDate = parseInputDateToUTC(endVal);
    dataset = dataset.filter(d => {
      const dDate = parseDocIdToDate(d.id);
      return dDate && dDate.getTime() <= endDate.getTime();
    });
  }

  return dataset;
}

function getWindow(filteredData) {
  const total = filteredData.length;
  const end = total - offset;
  const start = Math.max(0, end - winSize);
  return filteredData.slice(start, end);
}

function updateOffsetMax() {
  const filtered = getFilteredDataset();
  const max = Math.max(0, filtered.length - winSize);
  const sl = document.getElementById('off-slider');
  if (sl) {
    sl.max = max;
    if (parseInt(sl.value) > max) {
      sl.value = 0;
      offset = 0;
    }
  }
}

// Slider and Filters Event Handlers
window.onSlider = function(v) {
  winSize = parseInt(v);
  document.getElementById('win-val').textContent = `${winSize} samples`;
  updateOffsetMax();
  processAndRender();
};

window.onOffset = function(v) {
  offset = parseInt(v);
  const filtered = getFilteredDataset();
  const total = filtered.length;
  const end = total - offset;
  const start = Math.max(0, end - winSize);
  
  const label = document.getElementById('off-val');
  if (label) {
    label.textContent = offset === 0 ? 'latest' : `${filtered[start]?.timeStr} – ${filtered[end-1]?.timeStr}`;
  }
  processAndRender();
};

window.snapLatest = function() {
  offset = 0;
  const sl = document.getElementById('off-slider');
  if (sl) sl.value = 0;
  document.getElementById('off-val').textContent = 'latest';
  processAndRender();
};

window.onTimeFilterChange = function() {
  updateOffsetMax();
  processAndRender();
};

window.clearTimeFilter = function() {
  document.getElementById("filter-start").value = "";
  document.getElementById("filter-end").value = "";
  updateOffsetMax();
  processAndRender();
};

window.onYSlider = function() {
  const minV = parseInt(document.getElementById('y-min-sl').value);
  const maxV = parseInt(document.getElementById('y-max-sl').value);
  if (minV >= maxV) return;
  yMin = minV;
  yMax = maxV;
  document.getElementById('y-min-val').textContent = minV;
  document.getElementById('y-max-val').textContent = maxV;
  
  destroyCharts();
  processAndRender();
};

window.resetY = function() {
  yMin = null;
  yMax = null;
  document.getElementById('y-min-sl').value = 0;
  document.getElementById('y-max-sl').value = 32767;
  document.getElementById('y-min-val').textContent = '0';
  document.getElementById('y-max-val').textContent = 'auto';
  
  destroyCharts();
  processAndRender();
};

// ----------------------------------------------------------
//  Batch‑run recorder state
// ----------------------------------------------------------
let batchLabel = "";
let batchStart = null;
let batchTimerInterval = null;
let isConnected = false;

// Online / Offline Global Network Monitoring
window.addEventListener('offline', () => {
  showErr('Network offline: Your internet connection was lost! Firebase syncing paused.');
  setS('err', 'OFFLINE · NO INTERNET');
});

window.addEventListener('online', () => {
  noErr();
  setS('wait', 'RECONNECTED · SYNCING');
  init();
});

// Helper: Format seconds to HH:MM:SS
function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ----------------------------------------------------------
//  Dedicated Batch Recorder Logic (With Pre-Flight Warnings & UTC)
// ----------------------------------------------------------
window.startBatch = async function () {
  const input = document.getElementById('batch-input');
  const startBtn = document.getElementById('batch-start');
  const endBtn = document.getElementById('batch-end');
  const statusEl = document.getElementById('batch-status-msg');

  const label = input.value.trim();
  if (!label) {
    showErr('Please enter a batch/run name (e.g. Batch2323) before starting.');
    input.focus();
    return;
  }

  // 1. Pre-flight Check: Internet Connection
  if (!navigator.onLine) {
    showErr('CANNOT START BATCH: Your device is offline. Please check your internet connection.');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--red-bright);font-weight:700">⚠ ERROR:</span> No internet connection.`;
    }
    return;
  }

  // 2. Pre-flight Check: Firebase Client Initialization
  const pid = document.getElementById('pid')?.value.trim();
  const akey = document.getElementById('akey')?.value.trim();
  if (!pid || !akey) {
    showErr('CANNOT START BATCH: Project ID or API Key is missing. Enter credentials and click CONNECT first.');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--red-bright);font-weight:700">⚠ NOT CONNECTED:</span> Enter Project ID & API Key.`;
    }
    return;
  }

  // 3. Pre-flight Check: Live Firestore Write Verification
  startBtn.disabled = true;
  startBtn.textContent = 'CHECKING...';
  if (statusEl) {
    statusEl.innerHTML = `<span style="color:var(--amber-bright);font-weight:700">⌛ CONNECTING:</span> Verifying Firestore write permissions...`;
  }

  const testStart = new Date();
  const docId = `${label.replace(/\s+/g, '_')}_${formatDDMM_HHMMSS(testStart)}`;

  try {
    const db = firebase.firestore();
    // Immediately write initial batch record in UTC
    await db.collection('batch_runs').doc(docId).set({
      label: label,
      status: "IN_PROGRESS",
      startTime: firebase.firestore.Timestamp.fromDate(testStart),
      startTimestamp: formatDDMM_HHMMSS(testStart),
      createdFrom: "web_dashboard",
      timezone: "UTC"
    });

    // Write Succeeded -> Start live recording!
    batchLabel = label;
    batchStart = testStart;
    
    startBtn.textContent = 'RECORDING';
    startBtn.disabled = true;
    endBtn.disabled = false;

    const startH = String(batchStart.getUTCHours()).padStart(2, '0');
    const startM = String(batchStart.getUTCMinutes()).padStart(2, '0');
    const startS = String(batchStart.getUTCSeconds()).padStart(2, '0');
    const startUTCStr = `${startH}:${startM}:${startS} UTC`;

    // Start live elapsed timer
    if (batchTimerInterval) clearInterval(batchTimerInterval);
    batchTimerInterval = setInterval(() => {
      if (!batchStart) return;
      const elapsedSec = Math.floor((new Date() - batchStart) / 1000);
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--green-bright);font-weight:700">● RECORDING:</span> "${batchLabel}" (${startUTCStr}) — <strong style="color:var(--cyan-bright);">${formatDuration(elapsedSec)}</strong>`;
      }
    }, 1000);

    setS('live', `BATCH "${batchLabel}" RECORDING`);
    noErr();

  } catch (e) {
    // Write Failed -> Show immediate prominent warning so no work is wasted!
    startBtn.disabled = false;
    startBtn.textContent = 'START RECORDING';
    endBtn.disabled = true;
    batchLabel = "";
    batchStart = null;

    console.error("Batch start pre-flight failed:", e);
    const errorMsg = `CANNOT START BATCH: Firestore Error (${e.message}). Ensure Firestore rules allow writes to 'batch_runs' and keys are valid.`;
    showErr(errorMsg);
    setS('err', 'FIREBASE WRITE ERROR');

    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--red-bright);font-weight:700">⚠ WRITE FAILED:</span> ${e.message}`;
    }
  }
};

window.endBatch = async function () {
  const startBtn = document.getElementById('batch-start');
  const endBtn = document.getElementById('batch-end');
  const statusEl = document.getElementById('batch-status-msg');

  if (!batchLabel || !batchStart) {
    showErr('No active batch is currently recording.');
    return;
  }

  // Stop elapsed timer
  if (batchTimerInterval) {
    clearInterval(batchTimerInterval);
    batchTimerInterval = null;
  }

  endBtn.disabled = true;
  endBtn.textContent = 'SAVING...';
  if (statusEl) statusEl.innerHTML = `<span style="color:var(--amber-bright);font-weight:700">⌛ SAVING:</span> Finalizing batch in Firestore (UTC)...`;

  const endTime = new Date();
  const docId = `${batchLabel.replace(/\s+/g, '_')}_${formatDDMM_HHMMSS(batchStart)}`;
  const durationSec = Math.round((endTime - batchStart) / 1000);

  try {
    const db = firebase.firestore();
    await db.collection('batch_runs').doc(docId).set({
      label: batchLabel,
      status: "COMPLETED",
      startTime: firebase.firestore.Timestamp.fromDate(batchStart),
      endTime: firebase.firestore.Timestamp.fromDate(endTime),
      startTimestamp: formatDDMM_HHMMSS(batchStart),
      endTimestamp: formatDDMM_HHMMSS(endTime),
      durationSeconds: durationSec,
      durationFormatted: formatDuration(durationSec),
      timezone: "UTC"
    }, { merge: true });
    
    document.getElementById('batch-input').value = '';
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--cyan-bright);font-weight:700">✓ BATCH SAVED (UTC):</span> <strong>${docId}</strong> (${formatDuration(durationSec)})`;
    }
    batchLabel = '';
    batchStart = null;
    startBtn.disabled = false;
    startBtn.textContent = 'START RECORDING';
    endBtn.disabled = true;
    endBtn.textContent = 'END & SAVE';
    setS('live', 'BATCH SAVED');
    noErr();
  } catch (e) {
    console.error("Batch end save error:", e);
    setS('err', 'ERROR SAVING BATCH');
    endBtn.disabled = false;
    endBtn.textContent = 'RETRY END & SAVE';
    
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--red-bright);font-weight:700">⚠ SAVE FAILED:</span> ${e.message} <button class="btn-sm" style="margin-left:6px;" onclick="endBatch()">RETRY</button>`;
    }
    showErr('Failed to finalize batch in Firestore: ' + e.message);
  }
};

function destroyCharts() {
  [cMain, cNorm, cComp, cDosing].forEach(c => { if(c) c.destroy(); });
  cMain = cNorm = cComp = cDosing = null;
}

// Setup static layout segments
WLS.forEach((wl, i) => {
  const d = document.createElement('div');
  d.className = 'spec-seg';
  d.id = `ss-${wl}`;
  d.style.cssText = `background:${SPBG[i]};color:#ffffff;`;
  d.textContent = `${wl} nm`;
  const specBar = document.getElementById('spec');
  if (specBar) specBar.appendChild(d);
});

// Setup dynamic bottom LED cells layout
const lcells = document.getElementById('lcells');
if (lcells) {
  WLS.forEach((wl, i) => {
    lcells.innerHTML += `<div class="lc">
      <div class="lc-top">
        <div class="lc-nm">${wl} nm</div>
        <div class="lc-id" style="color:${CLR[i]}">LED ${i+1}</div>
      </div>
      <div class="lc-a1" id="lv-${wl}" style="color:${CLR[i]}">----</div>
      <div class="lc-a0" id="l0-${wl}">norm: --</div>
      <div class="lc-norm" id="ln-${wl}">--</div>
      <div class="lc-bar"><div class="lc-bar-fill" id="lb-${wl}" style="background:${CLR[i]};width:0%"></div></div>
    </div>`;
  });
  lcells.innerHTML += `<div class="lc">
    <div class="lc-top"><div class="lc-nm">baseline</div><div class="lc-id" style="color:var(--purple-bright)">DARK</div></div>
    <div class="lc-a1" id="lv-dark" style="color:var(--purple-bright)">----</div>
    <div class="lc-a0" id="l0-dark">ADC1 dark</div>
    <div class="lc-norm" style="color:var(--txt3)">ambient</div>
    <div class="lc-bar"><div class="lc-bar-fill" style="background:var(--purple-bright);width:100%"></div></div>
  </div>`;
}

// ==========================================================================
// Data Processing and Visual Renderers
// ==========================================================================

function processAndRender() {
  const filtered = getFilteredDataset();
  const data = getWindow(filtered);

  if (data.length === 0) {
    document.getElementById('s0').textContent = '0';
    document.getElementById('s1').textContent = '--';
    document.getElementById('s3').textContent = '--';
    document.getElementById('s5').textContent = '--';
    document.getElementById('s-dose').textContent = '--';
    return;
  }

  const L = data[data.length - 1];
  // Format X-axis with time (HH:MM:SS UTC)
  const lbs = data.map(s => s.timeStr);
  const mx = Math.max(1, ...data.flatMap(s => WLS.map(wl => s.leds[wl]?.a1 || 0)));

  // Numerical indicators
  document.getElementById('s0').textContent = filtered.length;
  document.getElementById('s1').textContent = L.id;
  document.getElementById('s3').textContent = L.a1.toFixed(0);
  document.getElementById('s5').textContent = L.d1;
  document.getElementById('s-dose').textContent = `${L.dosing.carb.toFixed(1)} / ${L.dosing.prot.toFixed(1)} / ${L.dosing.lipid.toFixed(1)} mL`;
  
  const now = new Date();
  const uH = String(now.getUTCHours()).padStart(2, '0');
  const uM = String(now.getUTCMinutes()).padStart(2, '0');
  const uS = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById('s6').textContent = `${uH}:${uM}:${uS} UTC`;

  // Wavelength Spectrum bars opacity update
  WLS.forEach((wl, i) => {
    const led = L.leds[wl];
    const p = led ? led.a1 / mx : 0;
    const bar = document.getElementById(`ss-${wl}`);
    if (bar) bar.style.opacity = 0.35 + p * 0.65;
  });

  // Individual LED cards updates
  WLS.forEach((wl, i) => {
    const led = L.leds[wl];
    if (!led) return;
    const p = Math.max(0, Math.min(100, led.a1 / mx * 100));
    const sg = led.n1 >= 0 ? '+' : '';
    const nc = led.n1 > 5 ? 'up' : led.n1 < -5 ? 'dn' : 'nt';
    
    document.getElementById(`lv-${wl}`).textContent = led.a1;
    document.getElementById(`l0-${wl}`).textContent = `norm: ${sg}${led.n1.toFixed(1)}%`;
    
    const dPrev = diffPrevVal(wl);
    const ln = document.getElementById(`ln-${wl}`);
    if (ln) {
      ln.textContent = `Δprev: ${dPrev !== null ? (dPrev >= 0 ? '+' : '') + dPrev.toFixed(1) + '%' : '--'}`;
      ln.className = 'lc-norm ' + nc;
    }

    const fillBar = document.getElementById(`lb-${wl}`);
    if (fillBar) fillBar.style.width = p + '%';
  });
  document.getElementById('lv-dark').textContent = L.d1;

  // Differential helper calculations
  function diff5(wl) {
    const prev = allData.filter(s => s.n < L.n && s.leds[wl]).slice(-5);
    if (!prev.length) return null;
    const avg = prev.reduce((s, p) => s + p.leds[wl].a1, 0) / prev.length;
    return L.leds[wl] ? (L.leds[wl].a1 - avg) / Math.max(1, avg) * 100 : null;
  }

  function diffPrevVal(wl) {
    for (let i = allData.length - 2; i >= 0; i--) {
      if (allData[i].leds[wl]) {
        const prev = allData[i].leds[wl].a1;
        return L.leds[wl] ? (L.leds[wl].a1 - prev) / Math.max(1, prev) * 100 : null;
      }
    }
    return null;
  }

  // Wavelength breakdown table
  const tbody = document.getElementById('ltbody');
  if (tbody) {
    tbody.innerHTML = '';
    WLS.forEach((wl, i) => {
      const led = L.leds[wl];
      if (!led) return;
      const n1s = (led.n1 >= 0 ? '+' : '') + led.n1.toFixed(1) + '%';
      const d5 = diff5(wl);
      const dp = diffPrevVal(wl);
      const d5s = d5 !== null ? (d5 >= 0 ? '+' : '') + d5.toFixed(1) + '%' : '--';
      const dps = dp !== null ? (dp >= 0 ? '+' : '') + dp.toFixed(1) + '%' : '--';
      const nc = led.n1 > 5 ? 'up' : led.n1 < -5 ? 'dn' : 'nt';
      const d5c = d5 !== null ? (d5 > 5 ? 'up' : d5 < -5 ? 'dn' : 'nt') : 'nt';
      const dpc = dp !== null ? (dp > 5 ? 'up' : dp < -5 ? 'dn' : 'nt') : 'nt';

      tbody.innerHTML += `<tr>
        <td><span class="sw" style="background:${CLR[i]}"></span><strong style="color:${CLR[i]}">${wl} nm</strong> <span style="font-size:11px;color:var(--txt3)">(${LABELS[i]})</span></td>
        <td class="td-big" style="color:${CLR[i]}">${led.a1}</td>
        <td class="${nc}">${n1s}</td>
        <td class="${d5c}">${d5s}</td>
        <td class="${dpc}">${dps}</td>
      </tr>`;
    });
  }

  const o = baseOpts();

  // 1. Chart Main: Raw Wavelengths over time
  if (cMain) {
    cMain.data.labels = lbs;
    cMain.data.datasets.forEach((ds, i) => ds.data = data.map(s => s.leds[WLS[i]]?.a1 ?? null));
    cMain.update('none');
  } else {
    cMain = new Chart(document.getElementById('c-main'), {
      type: 'line',
      data: {
        labels: lbs,
        datasets: WLS.map((wl, i) => ({
          label: `${wl}nm`,
          data: data.map(s => s.leds[wl]?.a1 ?? null),
          borderColor: CLR[i],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25
        }))
      },
      options: o
    });
  }

  // 2. Chart Norm: Normalized values over time
  if (cNorm) {
    cNorm.data.labels = lbs;
    cNorm.data.datasets.forEach((ds, i) => ds.data = data.map(s => s.leds[WLS[i]]?.n1 ?? null));
    cNorm.update('none');
  } else {
    cNorm = new Chart(document.getElementById('c-norm'), {
      type: 'line',
      data: {
        labels: lbs,
        datasets: WLS.map((wl, i) => ({
          label: `${wl}nm`,
          data: data.map(s => s.leds[wl]?.n1 ?? null),
          borderColor: CLR[i],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25
        }))
      },
      options: o
    });
  }

  // 3. Chart Composition: Predictions trends
  if (cComp) {
    cComp.data.labels = lbs;
    cComp.data.datasets[0].data = data.map(s => s.composition.carb);
    cComp.data.datasets[1].data = data.map(s => s.composition.prot);
    cComp.data.datasets[2].data = data.map(s => s.composition.lipid);
    cComp.data.datasets[3].data = data.map(s => s.composition.moist);
    cComp.update('none');
  } else {
    cComp = new Chart(document.getElementById('c-comp'), {
      type: 'line',
      data: {
        labels: lbs,
        datasets: [
          { label: 'Carbs', data: data.map(s => s.composition.carb), borderColor: '#818cf8', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.25 },
          { label: 'Protein', data: data.map(s => s.composition.prot), borderColor: '#00ff66', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.25 },
          { label: 'Lipids', data: data.map(s => s.composition.lipid), borderColor: '#ffb703', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.25 },
          { label: 'Moisture', data: data.map(s => s.composition.moist), borderColor: '#00f0ff', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.25 }
        ]
      },
      options: { ...o, scales: { ...o.scales, y: { min: 0, max: 100, ticks: o.scales.y.ticks, grid: o.scales.y.grid } } }
    });
  }

  // 4. Chart Dosing: Enzyme volumes bar chart
  if (cDosing) {
    cDosing.data.labels = lbs;
    cDosing.data.datasets[0].data = data.map(s => s.dosing.carb);
    cDosing.data.datasets[1].data = data.map(s => s.dosing.prot);
    cDosing.data.datasets[2].data = data.map(s => s.dosing.lipid);
    cDosing.update('none');
  } else {
    cDosing = new Chart(document.getElementById('c-dosing-bar'), {
      type: 'bar',
      data: {
        labels: lbs,
        datasets: [
          { label: 'Carb Vol', data: data.map(s => s.dosing.carb), backgroundColor: 'rgba(129, 140, 248, 0.85)', borderWidth: 0 },
          { label: 'Prot Vol', data: data.map(s => s.dosing.prot), backgroundColor: 'rgba(0, 255, 102, 0.85)', borderWidth: 0 },
          { label: 'Lipid Vol', data: data.map(s => s.dosing.lipid), backgroundColor: 'rgba(255, 183, 3, 0.85)', borderWidth: 0 }
        ]
      },
      options: o
    });
  }
}

// Chart Options with High Contrast Fonts & Dark Grid
function baseOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: '#cbd5e1',
          font: { family: 'IBM Plex Mono', size: 11, weight: '600' },
          boxWidth: 10,
          padding: 10,
          usePointStyle: true,
          pointStyleWidth: 7
        }
      },
      tooltip: {
        backgroundColor: '#0f121d',
        borderColor: '#00f0ff',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        titleFont: { family: 'IBM Plex Mono', size: 12, weight: '700' },
        bodyFont: { family: 'IBM Plex Mono', size: 11 },
        padding: 10
      }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { family: 'IBM Plex Mono', size: 11, weight: '500' }, maxTicksLimit: 8 },
        grid: { color: '#1a1f2e' }
      },
      y: {
        min: yMin !== null ? yMin : undefined,
        max: yMax !== null ? yMax : undefined,
        ticks: { color: '#94a3b8', font: { family: 'IBM Plex Mono', size: 11, weight: '500' } },
        grid: { color: '#1a1f2e' }
      }
    }
  };
}

// Page Boot: Restore saved keys if available, else wait for user
try {
  const savedPid = localStorage.getItem('spectra_pid');
  const savedAkey = localStorage.getItem('spectra_akey');
  if (savedPid) document.getElementById('pid').value = savedPid;
  if (savedAkey) document.getElementById('akey').value = savedAkey;
  if (savedPid && savedAkey) {
    init();
  } else {
    setS('wait', 'OFFLINE · ENTER KEYS');
  }
} catch (e) {
  setS('wait', 'OFFLINE · ENTER KEYS');
}

