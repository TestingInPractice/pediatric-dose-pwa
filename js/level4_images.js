const Level4Images = {
  getImagePath(drug) {
    if (!drug) return null;
    return `data/images/${drug.id}.png`;
  },

  hasFile(drug) {
    return !!drug;
  },

  renderTable(drug, weight) {
    if (!drug.dose_table || !drug.dose_table.length) return '';

    let html = `<table class="instruction-table"><thead><tr><th>Вес (кг)</th><th>Доза</th><th>мг</th></tr></thead><tbody>`;

    let found = false;
    drug.dose_table.forEach(row => {
      const match = weight >= row.weight_min && weight < row.weight_max;
      if (match) found = true;
      const cls = match ? ' class="highlight-row"' : '';

      let doseDisplay = '';
      if (drug.form === 'суппозитории') {
        doseDisplay = row.dose_ml + ' шт';
      } else {
        doseDisplay = row.dose_ml + ' мл';
      }

      html += `<tr${cls}><td>${row.weight_min}–${row.weight_max}</td><td>${doseDisplay}</td><td>${row.dose_mg}</td></tr>`;
    });

    if (!found) {
      html += `<tr class="highlight-row"><td colspan="3">→ Ваш вес: ${weight} кг (сверьтесь с ближайшей строкой)</td></tr>`;
    }

    html += `</tbody></table>`;
    return html;
  },

  getImageHtml(drug) {
    if (!drug) return '';
    const id = drug.id;
    if (id >= 1 && id <= 10) {
      return `<iframe src="data/images/${id}.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH" class="instruction-pdf-embed"></iframe>`;
    }
    return `<img src="data/images/${id}.png" alt="Инструкция ${drug.name}" class="instruction-image" onerror="this.style.display='none'">`;
  },

  getImageIcon(drug) {
    if (!drug) return '<span class="grls-dot miss" title="Нет файла"></span>';
    return '<span class="grls-dot ok" title="Файл инструкции есть">📄</span>';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Level4Images };
}
