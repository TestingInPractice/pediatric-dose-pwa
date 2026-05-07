# AGENTS.md — Pediatric Dose Calculator (PWA)

## Project Management

- **Project Board:** https://github.com/users/TestingInPractice/projects/4/views/1
- **Issues:** https://github.com/TestingInPractice/pediatric-dose-pwa/issues
- **After completing a task:**
  1. Run tests: `npm run test`
  2. Commit changes: `git add . && git commit -m "<message>"`
  3. Move issue to "Done" on project board: `gh project item-edit --id <item-id> --field Status --value Done`
  4. Close issue: `gh issue close <number> --repo TestingInPractice/pediatric-dose-pwa --comment "<summary>"`

## Project Overview

PWA-калькулятор детских дозировок с 4-уровневой системой проверки ошибок:

- **L1** — Автотесты (проверяют формулы при CI/CD)
- **L2** — Экспертная система (правила из инструкций)
- **L3** — ML-модель (ONNX Runtime Web)
- **L4** — Скриншоты инструкций из ГРЛС (сверка глазами)

Чистый JavaScript. Zero Backend. Работает полностью офлайн на телефоне.

## Directory Layout

```
pediatric-dose-pwa/
├── index.html                  ← SPA entry
├── manifest.json               ← PWA config
├── service-worker.js           ← кэш + офлайн
├── css/
│   └── style.css               ← mobile-first
├── js/
│   ├── app.js                  ← маршрутизация, init
│   ├── calculator.js           ← расчёт доз (единая формула)
│   ├── level2_rules.js         ← экспертная система
│   ├── level3_onnx.js          ← ML-модель
│   ├── level4_images.js        ← скриншоты инструкций
│   ├── db.js                   ← IndexedDB (Dexie.js)
│   └── updater.js              ← проверка/скачивание обновлений
├── model/
│   └── validator.onnx          ← ML-модель ~3MB
├── data/
│   ├── manifest.json           ← { version, updated }
│   ├── drugs.json              ← вся БД препаратов
│   └── images/                 ← скриншоты из ГРЛС
├── icons/
│   ├── icon-192x192.png
│   └── icon-512x512.png
├── tests/
│   └── test_calculator.js      ← L1: тесты формул
└── AGENTS.md
```

## Developer Commands

```bash
# Запустить локальный сервер для разработки
npx serve .

# Запустить тесты
npm run test

# Открыть в браузере
open http://localhost:3000
```

## Architecture Notes

### 4 уровня проверки

| L | Механизм | Технология | Офлайн |
|---|----------|-----------|--------|
| 1 | Автотесты | Vitest / CI | — |
| 2 | Экспертная система | JS rules engine | ✅ |
| 3 | ML-модель | ONNX Runtime Web (WASM) | ✅ |
| 4 | Фото инструкции | PNG из ГРЛС | ✅ |

### Формула расчёта

```
standard_dose_ml = weight × mls_var
standard_dose_mg = weight × mgs_var
high_dose_ml = standard_dose_ml × high_modifier
suppositories_count = (weight × mgs_var) / dose_per_unit
max_daily_ml = (weight × mgs_max) / range2_dose
```

### Обновление данных

- В приложении кнопка «Проверить обновления»
- Скачивает drugs.json + images/ с GitHub Releases
- Дата последнего обновления в настройках

## Key Constraints

- **Zero backend** — всё работает в браузере, никаких серверов
- **Офлайн first** — полная функциональность без интернета
- **HTTPS обязателен** для Service Worker на iOS
- Данные синхронизируются через GitHub Releases (не API)

## Local Config (NEVER COMMIT)

```
```

### Required GitHub PAT token settings:
- **Type:** Fine-grained personal access token
- **Permissions:**
  - `Contents` — Read (для скачивания обновлений)
  - `Metadata` — Read-only (automatic)
- **Expiration:** 90 days

Set this in your local `.env` file. Never commit tokens to git.
