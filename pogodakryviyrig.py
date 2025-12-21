from __future__ import annotations
import pandas as pd, requests, numpy as np, os

CITY = "Кривий Ріг"
LAT, LON = 47.9105, 33.3918
START, END = "2025-01-01", "2025-12-31"
HOURLY = ["temperature_2m","relativehumidity_2m","windspeed_10m","precipitation_probability"]

def url():
    return (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}"
        f"&start_date={START}&end_date={END}"
        f"&hourly={','.join(HOURLY)}"
        "&timezone=Europe%2FKyiv"
    )

def main():
    r = requests.get(url(), timeout=90)
    r.raise_for_status()
    j = r.json()['hourly']
    df = pd.DataFrame(j)
    df['time'] = pd.to_datetime(df['time'])
    df = df.sort_values('time').reset_index(drop=True)
    df[HOURLY] = df[HOURLY].interpolate(limit_direction='both')
    df['hour'] = df['time'].dt.hour
    df['dow'] = df['time'].dt.dayofweek
    df['hour_sin'] = np.sin(2*np.pi*df['hour']/24)
    df['hour_cos'] = np.cos(2*np.pi*df['hour']/24)
    df['dow_sin']  = np.sin(2*np.pi*df['dow']/7)
    df['dow_cos']  = np.cos(2*np.pi*df['dow']/7)
    os.makedirs('data', exist_ok=True)
    df['time'] = df['time'].dt.strftime('%Y-%m-%dT%H:%M')
    df.to_csv('data/weather_kriviyrih.csv', index=False)
    print('Saved data/weather_kriviyrih.csv')

if __name__ == "__main__":
    main()
