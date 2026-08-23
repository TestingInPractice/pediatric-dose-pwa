(function () {
  'use strict';

  const INDICATORS = [
    { id: 'weight', label: 'Вес', unit: 'кг', sexLabel: ['', ''] },
    { id: 'height', label: 'Рост', unit: 'см', sexLabel: ['', ''] },
    { id: 'bmi', label: 'ИМТ', unit: 'кг/м²', sexLabel: ['', ''] }
  ];

  const P_COLORS = { p3: '#e53935', p10: '#ff9800', p25: '#ffc107', p50: '#4caf50', p75: '#ffc107', p90: '#ff9800', p97: '#e53935' };
  const P_ALPHA = { p3: 0.15, p10: 0.1, p25: 0.05, p50: 0, p75: 0.05, p90: 0.1, p97: 0.15 };
  const P_LABELS = ['p3', 'p10', 'p25', 'p50', 'p75', 'p90', 'p97'];
  const P_DISPLAY = { p3: '3%', p10: '10%', p25: '25%', p50: '50%', p75: '75%', p90: '90%', p97: '97%' };

  const MONTH_MAX = 60;

  function openGrowthCharts(patient) {
    if (!patient) return;
    const sex = patient.sex || 'boy';
    const birth = patient.birthDate ? new Date(patient.birthDate) : null;
    const ageMonths = birth ? calcAgeMonths(birth) : null;

    let tabsHtml = INDICATORS.map((ind, i) =>
      `<button class="filter-chip ${i === 0 ? 'active' : ''}" data-ind="${ind.id}">${ind.label}</button>`
    ).join('');

    UI.openModal('📊 Графики роста (WHO)', `
      <div style="margin-bottom:12px;display:flex;gap:6px">${tabsHtml}</div>
      <div id="growth-chart-area" style="position:relative">
        <canvas id="growth-canvas" style="width:100%;height:320px;background:var(--color-surface);border-radius:8px"></canvas>
      </div>
      <div id="growth-info" style="font-size:13px;margin-top:8px;color:var(--color-text-secondary)"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="growth-close">Закрыть</button>
      </div>
    `);

    // Sex toggle in modal
    const sexHtml = `
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button class="filter-chip ${sex === 'boy' ? 'active' : ''}" data-growth-sex="boy">👦 Мальчик</button>
        <button class="filter-chip ${sex === 'girl' ? 'active' : ''}" data-growth-sex="girl">👧 Девочка</button>
      </div>`;
    const titleEl = $('diary-modal-title');
    titleEl.insertAdjacentHTML('afterend', sexHtml);

    let currentSex = sex;
    let currentInd = 'weight';
    const canvas = $('growth-canvas');
    const info = $('growth-info');

    function redraw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = 640;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = '320px';
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      const w = rect.width, h = 320;

      const curves = WHO.getPercentileCurves(currentInd, currentSex, MONTH_MAX);
      if (!curves) { info.textContent = 'Нет данных для этого графика'; return; }

      // Get patient value
      let patientVal = null;
      if (currentInd === 'weight') patientVal = patient.weight;
      else if (currentInd === 'height') patientVal = patient.height;
      else if (currentInd === 'bmi' && patient.weight && patient.height) {
        patientVal = round(patient.weight / Math.pow(patient.height / 100, 2), 1);
      }

      // Find min/max across all curves
      let vMin = Infinity, vMax = -Infinity;
      P_LABELS.forEach(label => {
        curves[label].forEach(pt => {
          if (pt.v < vMin) vMin = pt.v;
          if (pt.v > vMax) vMax = pt.v;
        });
      });
      if (patientVal != null) { vMin = Math.min(vMin, patientVal); vMax = Math.max(vMax, patientVal); }

      // Add 5% padding
      const pad = (vMax - vMin) * 0.1 || 1;
      vMin = Math.max(0, vMin - pad);
      vMax = vMax + pad;

      const margin = { top: 20, right: 16, bottom: 28, left: 44 };
      const plotW = w - margin.left - margin.right;
      const plotH = h - margin.top - margin.bottom;

      function x(m) { return margin.left + (m / MONTH_MAX) * plotW; }
      function y(v) { return margin.top + plotH - ((v - vMin) / (vMax - vMin)) * plotH; }

      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'var(--color-border)';
      ctx.lineWidth = 0.5;
      ctx.fillStyle = 'var(--color-text-secondary)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      const ySteps = 5;
      for (let i = 0; i <= ySteps; i++) {
        const val = vMin + (vMax - vMin) * i / ySteps;
        const yy = y(val);
        ctx.beginPath(); ctx.moveTo(margin.left, yy); ctx.lineTo(w - margin.right, yy); ctx.stroke();
        ctx.fillText(round(val, 1), margin.left - 4, yy + 3);
      }
      ctx.textAlign = 'center';
      for (let m = 0; m <= MONTH_MAX; m += 12) {
        const xx = x(m);
        ctx.beginPath(); ctx.moveTo(xx, margin.top); ctx.lineTo(xx, h - margin.bottom); ctx.stroke();
        ctx.fillText(m === 0 ? '0' : m + 'м', xx, h - 6);
      }

      // Fill between percentile curves (shaded zones)
      for (let i = 0; i < P_LABELS.length - 1; i++) {
        const a = P_LABELS[i], b = P_LABELS[i + 1];
        if (P_ALPHA[a] === 0) continue;
        ctx.beginPath();
        curves[a].forEach((pt, j) => { const method = j === 0 ? 'moveTo' : 'lineTo'; ctx[method](x(pt.m), y(pt.v)); });
        curves[b].slice().reverse().forEach(pt => ctx.lineTo(x(pt.m), y(pt.v)));
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(P_COLORS[a], P_ALPHA[a]);
        ctx.fill();
      }

      // Draw percentile lines
      P_LABELS.forEach(label => {
        ctx.beginPath();
        ctx.strokeStyle = P_COLORS[label];
        ctx.lineWidth = label === 'p50' ? 2 : 1;
        curves[label].forEach((pt, j) => {
          const method = j === 0 ? 'moveTo' : 'lineTo';
          ctx[method](x(pt.m), y(pt.v));
        });
        ctx.stroke();
      });

      // Legend
      let legendX = margin.left + 4;
      const legendY = 8;
      P_LABELS.forEach(label => {
        ctx.fillStyle = P_COLORS[label];
        ctx.fillRect(legendX, legendY, 12, 8);
        ctx.fillStyle = 'var(--color-text-secondary)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(P_DISPLAY[label], legendX + 15, legendY + 7);
        legendX += 34;
      });

      // Patient dot
      if (ageMonths != null && patientVal != null && ageMonths <= MONTH_MAX) {
        const px = x(ageMonths), py = y(patientVal);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#1976d2';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Percentile info
        const pct = WHO.getPercentile(currentInd, currentSex, ageMonths, patientVal);
        if (pct) {
          info.innerHTML = `<strong>${patient.name}</strong> — ${currentInd === 'weight' ? 'Вес' : currentInd === 'height' ? 'Рост' : 'ИМТ'}: ${patientVal} ${currentInd === 'weight' ? 'кг' : currentInd === 'height' ? 'см' : 'кг/м²'} · Возраст: ${ageMonths.toFixed(1)} мес · <strong>${pct.percentile} перцентиль</strong> (z=${pct.z})`;
          // Show nearby percentiles
          let nearLabel = '';
          for (const label of P_LABELS) {
            const curveVal = curves[label].find(pt => Math.abs(pt.m - ageMonths) < 0.3);
            if (curveVal) {
              const diff = patientVal - curveVal.v;
              const rel = diff > 0 ? 'выше' : 'ниже';
              nearLabel = `<br><span style="font-size:12px">${P_DISPLAY[label]} = ${round(curveVal.v, 1)} ${currentInd === 'weight' ? 'кг' : currentInd === 'height' ? 'см' : 'кг/м²'} (на ${round(Math.abs(diff), 1)} ${rel})</span>`;
            }
          }
          info.innerHTML += nearLabel;
        }
      } else if (ageMonths != null && patientVal == null) {
        info.textContent = 'Нет данных о ' + (currentInd === 'weight' ? 'весе' : currentInd === 'height' ? 'росте' : 'ИМТ') + ' для этого ребёнка';
      } else {
        info.textContent = 'Укажите дату рождения в профиле для отображения на графике';
      }
    }

    // Tab clicks
    $('diary-modal-body').querySelectorAll('[data-ind]').forEach(btn => {
      btn.addEventListener('click', () => {
        $('diary-modal-body').querySelectorAll('[data-ind]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentInd = btn.dataset.ind;
        redraw();
      });
    });

    // Sex clicks
    document.querySelectorAll('[data-growth-sex]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-growth-sex]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSex = btn.dataset.growthSex;
        redraw();
      });
    });

    $('growth-close').onclick = UI.closeModal;
    setTimeout(redraw, 50);
  }

  function calcAgeMonths(birth) {
    if (!birth || isNaN(birth.getTime())) return null;
    const now = new Date();
    const m = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth()) + (now.getDate() - birth.getDate()) / 30.44;
    return Math.max(0, round(m, 1));
  }

  function hexWithAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function round(n, d) { const m = Math.pow(10, d); return Math.round(n * m) / m; }

  window.GrowthCharts = { open: openGrowthCharts };
})();
