import json
import numpy as np
import tensorflow as tf
from pathlib import Path

from dataset import load_df, make_windows

def build_model(input_hours: int, n_features: int, horizon: int) -> tf.keras.Model:
    inp = tf.keras.Input(shape=(input_hours, n_features), name="x")
    x = tf.keras.layers.Conv1D(64, 5, padding="same", activation="relu")(inp)
    x = tf.keras.layers.Conv1D(64, 5, padding="same", activation="relu")(x)
    x = tf.keras.layers.GlobalAveragePooling1D()(x)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    out = tf.keras.layers.Dense(horizon, name="y")(x)
    m = tf.keras.Model(inp, out)
    m.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="mse",
        metrics=[tf.keras.metrics.MAE],
    )
    return m

def main():
    DATA = Path("data/weather_kriviyrih.csv")
    OUT_DIR = Path("artifacts")
    OUT_DIR.mkdir(exist_ok=True)

    input_hours = 48
    horizon = 24

    df = load_df(str(DATA))
    X, y, scaler = make_windows(df, input_hours=input_hours, horizon_hours=horizon)

    # split
    n = len(X)
    n_train = int(n * 0.8)
    X_train, y_train = X[:n_train], y[:n_train]
    X_val, y_val = X[n_train:], y[n_train:]

    model = build_model(input_hours, X.shape[-1], horizon)

    cb = [
        tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(str(OUT_DIR / "keras_model.keras"), save_best_only=True),
    ]

    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=60,
        batch_size=64,
        callbacks=cb,
        verbose=1,
    )

    # Save scaler params for JS
    scaler_pack = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "features": ["temp_c", "humidity", "wind_kmh", "precip_prob"],
        "input_hours": input_hours,
        "horizon": horizon,
    }
    (OUT_DIR / "scaler.json").write_text(json.dumps(scaler_pack, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Saved:", OUT_DIR / "keras_model.keras")
    print("Saved:", OUT_DIR / "scaler.json")

if __name__ == "__main__":
    main()
