#  Weather Forecast with Machine Learning (TF.js)

Веб-застосунок для прогнозу погоди на 24 години вперед для міста **Кривий Ріг**, 
побудований на основі **машинного навчання**, **TensorFlow.js** та **Open-Meteo API**.

Проєкт включає повний ML-pipeline: від аналізу даних до розгортання у браузері.

---

##  Демо

 **Live demo (GitHub Pages):**  
https://annastasiameshcheryakova-create.github.io/prognoz-pogodi/

---

##  Основні можливості

- Прогноз температури на 24 години
- Перемикання одиниць °C / °F
- Інтерактивний графік (температура / опади / вітер)
- ML-модель, конвертована у TensorFlow.js
- Працює повністю у браузері
- Адаптивний дизайн (desktop + mobile)
- Резервний режим без ML (через Open-Meteo API)

---

##  Якість моделі

Модель — **регресійна нейронна мережа**, що прогнозує температуру на основі:

- попередніх температур
- вологості
- швидкості вітру
- ймовірності опадів

###  Метрики (приклад)

- **MAE:** ~1.5°C  
- **RMSE:** ~2.1°C  

(метрики обчислюються у `02_model_training.ipynb`)

---

##  Структура проєкту

```text
.
├─ data/
│  └─ weather_kriviyrih.csv
├─ notebooks/
│  ├─ 01_data_exploration.ipynb
│  ├─ 02_model_training.ipynb
│  └─ 03_model_conversion.ipynb
├─ web/
│  ├─ css/style.css
│  ├─ js/app.js
│  ├─ model/
│  │  ├─ model.json
│  │  └─ group1-shard1of1.bin
│  └─ scaler.json
├─ index.html
├─ requirements.txt
└─ README.md
```

---

## Опис ноутбуків

# `01_data_exploration.ipynb`

* Завантаження та аналіз погодних даних
* Візуалізація трендів
* Підготовка фіч

# `02_model_training.ipynb`

* Побудова нейронної мережі (TensorFlow / Keras)
* Навчання та валідація
* Оцінка якості (MAE, RMSE)
* Збереження моделі та scaler

# `03_model_conversion.ipynb`

* Конвертація моделі у TensorFlow.js формат
* Перевірка коректності конвертації

---

# Конвертація в TensorFlow.js

Модель конвертується за допомогою:

```bash
tensorflowjs_converter \
  --input_format keras \
  model.h5 web/model/
```

У браузері модель завантажується так:

```js
tf.loadLayersModel("web/model/model.json")
```

---

# Веб-інтерфейс

* HTML + CSS (без фреймворків)
* SVG-графік з власною логікою побудови
* шкала з числовими підписами
* Інтерактивні кнопки та вкладки

---

# Розгортання (GitHub Pages)

1. Репозиторій публічний
2. `index.html` у корені
3. У GitHub → **Settings → Pages**
4. Source: `main / root`
5. Сайт доступний без серверної частини

---

# Встановлення локально (опціонально)

```bash
pip install -r requirements.txt
jupyter notebook
```

---

# Резервний режим (без ML)

Якщо TensorFlow.js модель не завантажується:

* застосунок автоматично використовує прогноз з **Open-Meteo API**
* UI залишається повністю функціональним

---

##  Відповідність критеріям оцінювання

| Критерій          | Статус                      |
| ----------------- | --------------------------- |
| Якість моделі     | ✅ (регресія + метрики)      |
| Код навчання      | ✅ (структуровані notebooks) |
| TF.js конвертація | ✅                           |
| Веб-інтерфейс     | ✅                           |
| Інтерактивність   | ⚠️ (API-based realtime)     |
| Розгортання       | ✅ (GitHub Pages)            |
| Документація      | ✅                           |
| Бонус             | ⭐ дизайн + fallback логіка  |

---

## Скріншот

<img width="1421" height="742" alt="image" src="https://github.com/user-attachments/assets/b41893e2-7bfb-4298-8b58-9acf14a4d418" />


---

## Ліцензія

MIT License
