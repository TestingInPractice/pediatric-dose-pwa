const Level4Images = {
  getImagePath(drug) {
    if (!drug) return null;
    if (drug.image) return `data/images/${drug.image}`;
    return `data/images/${drug.id}.png`;
  },

  hasFile(drug) {
    return !!this.getImagePath(drug);
  },

  getImageHtml(drug) {
    const path = this.getImagePath(drug);
    if (!path) return '';
    return `<img src="${path}" alt="Инструкция ${drug.name}" class="instruction-image" onerror="this.style.display='none'">`;
  },

  getImageIcon(drug) {
    if (!this.getImagePath(drug)) return '<span class="grls-dot miss" title="Нет файла"></span>';
    return '<span class="grls-dot ok" title="Скриншот инструкции есть">🖼️</span>';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Level4Images };
}
