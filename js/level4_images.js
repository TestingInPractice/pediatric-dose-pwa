const Level4Images = {
  getImagePath(drug) {
    if (!drug) return null;
    if (drug.image) return `data/images/${drug.image}`;
    const id = drug.id;
    return `data/images/${id}.png`;
  },

  hasFile(drug) {
    return !!this.getImagePath(drug);
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
    const path = this.getImagePath(drug);
    if (!path) return '';
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      return `<a href="${path}" target="_blank" class="instruction-pdf-link">📄 Открыть PDF-инструкцию (L4)</a>`;
    }
    return `<img src="${path}" alt="Инструкция ${drug.name}" class="instruction-image" onerror="this.style.display='none'">`;
  },

  getImageIcon(drug) {
    const path = this.getImagePath(drug);
    if (!path) return '<span class="grls-dot miss" title="Нет файла"></span>';
    const ext = path.split('.').pop().toLowerCase();
    const icon = ext === 'pdf' ? '📄' : '🖼️';
    return `<span class="grls-dot ok" title="Файл: ${path}">${icon}</span>`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Level4Images };
}
