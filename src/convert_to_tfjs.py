"""
Конвертація Keras-моделі (TensorFlow) у формат TensorFlow.js для використання у браузері.

Вхід:
  artifacts/keras_model.keras
  artifacts/scaler.json

Вихід:
  web/model/model.json
  web/model/group*-shard*.bin
  web/scaler.json  (копія, щоб було доступно на GitHub Pages)
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


ARTIFACTS_DIR = Path("artifacts")
IN_MODEL = ARTIFACTS_DIR / "keras_model.keras"
IN_SCALER = ARTIFACTS_DIR / "scaler.json"

WEB_DIR = Path("web")
OUT_MODEL_DIR = WEB_DIR / "model"
OUT_SCALER = WEB_DIR / "scaler.json"


def die(msg: str, code: int = 1) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr)
    raise SystemExit(code)


def check_inputs() -> None:
    if not IN_MODEL.exists():
        die(
            f"Не знайдено модель: {IN_MODEL}\n"
            f"Спочатку запусти навчання: python src/train.py"
        )

    if not IN_SCALER.exists():
        die(
            f"Не знайдено scaler: {IN_SCALER}\n"
            f"Після train.py має створитись artifacts/scaler.json"
        )

    # Перевірка, що scaler.json валідний та містить потрібні ключі
    try:
        scaler = json.loads(IN_SCALER.read_text(encoding="utf-8"))
    except Exception as e:
        die(f"scaler.json пошкоджений або не JSON: {e}")

    required = ["mean", "scale", "features", "input_hours", "horizon"]
    missing = [k for k in required if k not in scaler]
    if missing:
        die(f"У scaler.json бракує ключів: {missing}")


def check_tfjs_converter_available() -> None:
    """
    tensorflowjs_converter ставиться через:
      pip install tensorflowjs
    """
    from shutil import which

    if which("tensorflowjs_converter") is None:
        die(
            "Команда 'tensorflowjs_converter' не знайдена.\n"
            "Встанови: pip install tensorflowjs\n"
            "Переконайся що встановлено у цьому ж venv."
        )


def convert_model() -> None:
    OUT_MODEL_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        "tensorflowjs_converter",
        "--input_format=keras",
        "--output_format=tfjs_layers_model",
        str(IN_MODEL),
        str(OUT_MODEL_DIR),
    ]

    print("[INFO] Конвертація моделі у TF.js…")
    print("[INFO] Команда:", " ".join(cmd))

    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as e:
        die(f"tensorflowjs_converter завершився з помилкою: {e}")


def copy_scaler() -> None:
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(IN_SCALER, OUT_SCALER)
    print(f"[INFO] Скопійовано scaler → {OUT_SCALER}")


def verify_outputs() -> None:
    model_json = OUT_MODEL_DIR / "model.json"
    if not model_json.exists():
        die(
            f"Після конвертації не знайдено {model_json}.\n"
            "Перевір лог tensorflowjs_converter."
        )

    # Шард(и) ваг
    shards = list(OUT_MODEL_DIR.glob("group*-shard*.bin"))
    if not shards:
        die(
            f"Не знайдено файлів ваг (*.bin) у {OUT_MODEL_DIR}.\n"
            "Конвертація виглядає неповною."
        )

    print("[INFO] OK: model.json знайдено")
    print(f"[INFO] OK: shards: {len(shards)} файл(ів)")


def print_next_steps() -> None:
    print("\n✅ Готово!")
    print("Файли для браузера:")
    print(f"  - {OUT_MODEL_DIR / 'model.json'}")
    print(f"  - {OUT_MODEL_DIR}/group*-shard*.bin")
    print(f"  - {OUT_SCALER}")
    print("\nДалі:")
    print("  1) Запусти локально static server:")
    print("       python -m http.server 8000")
    print("  2) Відкрий у браузері:")
    print("       http://localhost:8000/web/")
    print("\nДля GitHub Pages:")
    print("  - Увімкни Pages на папку /web (або /docs) і закоміть web/model та web/scaler.json.")


def main() -> None:
    check_inputs()
    check_tfjs_converter_available()
    convert_model()
    copy_scaler()
    verify_outputs()
    print_next_steps()


if __name__ == "__main__":
    main()
