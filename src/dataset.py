from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple, Optional, Dict

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


# =========================
# Налаштування колонок CSV
# =========================

# Вхідні фічі (те, що подається в модель)
FEATURES: List[str] = ["temp_c", "humidity", "wind_kmh", "precip_prob"]

# Ціль (що прогнозуємо)
TARGET: str = "temp_c"

# Колонка часу
TIME_COL: str = "timestamp"


# =========================
# Датаклас з результатом
# =========================

@dataclass
class WindowedDataset:
    X: np.ndarray                 # (N, input_hours, n_features)
    y: np.ndarray                 # (N, horizon_hours)
    scaler: StandardScaler        # fitted на FEATURES
    feature_names: List[str]
    input_hours: int
    horizon_hours: int


# =========================
# 1) Завантаження CSV
# =========================

def load_weather_csv(csv_path: str | Path) -> pd.DataFrame:
    """
    Читає CSV і повертає DataFrame з:
      - timestamp (datetime)
      - temp_c, humidity, wind_kmh, precip_prob (float)

    Очікуваний формат:
      timestamp,temp_c,humidity,wind_kmh,precip_prob
      2025-01-01 00:00:00,1.2,86,8,25
      ...
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV не знайдено: {csv_path}")

    df = pd.read_csv(csv_path)

    # --- перевірка обов'язкових колонок
    required_cols = [TIME_COL] + FEATURES
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(
            f"У CSV бракує колонок: {missing}\n"
            f"Знайдено: {list(df.columns)}\n"
            f"Очікується: {required_cols}"
        )

    # --- timestamp у datetime
    df[TIME_COL] = pd.to_datetime(df[TIME_COL], errors="coerce")
    if df[TIME_COL].isna().any():
        bad = df[df[TIME_COL].isna()].head(5)
        raise ValueError(
            "Є рядки з некоректним timestamp (не парситься в datetime). "
            "Приклад проблемних рядків:\n"
            f"{bad}"
        )

    # --- сортування по часу
    df = df.sort_values(TIME_COL).reset_index(drop=True)

    # --- привести фічі до float
    for c in FEATURES:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("float32")

    return df


# =========================
# 2) Очищення / заповнення пропусків
# =========================

def clean_and_fill(df: pd.DataFrame) -> pd.DataFrame:
    """
    Робить дані більш стабільними:
      - прибирає дублікати часу
      - ресемпл до 1 години (якщо треба)
      - інтерполяція пропусків
      - обмеження humidity/precip_prob до [0..100]
    """
    df = df.copy()

    # 2.1) прибрати дублікати timestamp (беремо середнє)
    df = df.groupby(TIME_COL, as_index=False)[FEATURES].mean()

    # 2.2) встановити індекс часу і зробити рівномірний крок 1 година
    df = df.set_index(TIME_COL).sort_index()
    full_index = pd.date_range(df.index.min(), df.index.max(), freq="H")
    df = df.reindex(full_index)
    df.index.name = TIME_COL

    # 2.3) інтерполяція + заповнення країв
    df[FEATURES] = df[FEATURES].interpolate(method="time", limit_direction="both")

    # 2.4) якщо все ще є NaN (дуже короткі ряди) — заповнити 0
    df[FEATURES] = df[FEATURES].fillna(0.0)

    # 2.5) обмежити фізично можливі межі
    if "humidity" in df.columns:
        df["humidity"] = df["humidity"].clip(0, 100)
    if "precip_prob" in df.columns:
        df["precip_prob"] = df["precip_prob"].clip(0, 100)

    df = df.reset_index()
    return df


# =========================
# 3) Побудова "вікон" 48 → 24
# =========================

def make_windows(
    df: pd.DataFrame,
    input_hours: int = 48,
    horizon_hours: int = 24,
    fit_scaler: bool = True,
    scaler: Optional[StandardScaler] = None,
) -> WindowedDataset:
    """
    Створює датасет для навчання прогнозу температури.

    Вхід:
      - df: DataFrame з колонками [timestamp] + FEATURES
      - input_hours: скільки годин подаємо як контекст (48)
      - horizon_hours: на скільки годин вперед прогноз (24)

    Вихід:
      X: (N, input_hours, n_features)  — НОРМАЛІЗОВАНІ фічі
      y: (N, horizon_hours)            — температура в °C (без scaler)
    """
    if len(df) < input_hours + horizon_hours:
        raise ValueError(
            f"Замало даних: потрібно мінімум {input_hours + horizon_hours} годин, "
            f"а є {len(df)} рядків."
        )

    # матриця фіч
    feat = df[FEATURES].to_numpy(dtype=np.float32)

    # ціль — температура на майбутні 24 години
    target = df[TARGET].to_numpy(dtype=np.float32)

    # scaler
    if fit_scaler:
        scaler = StandardScaler()
        feat_scaled = scaler.fit_transform(feat).astype(np.float32)
    else:
        if scaler is None:
            raise ValueError("fit_scaler=False, але scaler не переданий")
        feat_scaled = scaler.transform(feat).astype(np.float32)

    X_list = []
    y_list = []

    # ковзаюче вікно:
    # X[i] = [t..t+47], y[i] = [t+48..t+71]
    last_start = len(df) - input_hours - horizon_hours
    for start in range(0, last_start + 1):
        x_win = feat_scaled[start : start + input_hours]
        y_win = target[start + input_hours : start + input_hours + horizon_hours]
        X_list.append(x_win)
        y_list.append(y_win)

    X = np.stack(X_list, axis=0)  # (N, input_hours, n_features)
    y = np.stack(y_list, axis=0)  # (N, horizon_hours)

    return WindowedDataset(
        X=X,
        y=y,
        scaler=scaler,
        feature_names=FEATURES.copy(),
        input_hours=input_hours,
        horizon_hours=horizon_hours,
    )


# =========================
# 4) Утиліти для inference
# =========================

def make_single_input_window(
    df_last: pd.DataFrame,
    scaler: StandardScaler,
    input_hours: int = 48,
) -> np.ndarray:
    """
    Для прогнозу в реальному часі (inference):
    береш останні 48 годин (df_last) і робиш тензор (1, 48, n_features).

    df_last має містити мінімум 48 рядків і колонки FEATURES.
    """
    if len(df_last) < input_hours:
        raise ValueError(f"Потрібно мінімум {input_hours} рядків, а є {len(df_last)}")

    df_last = df_last.tail(input_hours)
    feat = df_last[FEATURES].to_numpy(dtype=np.float32)
    feat_scaled = scaler.transform(feat).astype(np.float32)

    # batch=1
    return feat_scaled[np.newaxis, :, :]


def export_scaler_json(scaler: StandardScaler, input_hours: int, horizon_hours: int) -> Dict:
    """
    Пакує scaler у JSON формат, який легко читати в JS.
    Це потім записується у artifacts/scaler.json, а копія у web/scaler.json.
    """
    return {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "features": FEATURES.copy(),
        "input_hours": int(input_hours),
        "horizon": int(horizon_hours),
    }
