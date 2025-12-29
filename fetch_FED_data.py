from fredapi import Fred
import pandas as pd
from datetime import date, timedelta

fred = Fred(api_key='3a535693a7c1bb047269acdb2e4d7a0a')

INTERVAL = 365 * 2
END_DATE = date.today()
START_DATE = END_DATE - timedelta(days=INTERVAL)
METRICS= ['FEDFUNDS', 'CPIAUCSL']

df = pd.DataFrame()

for metric in METRICS:
    ser = fred.get_series(metric)
    ser.index = pd.to_datetime(ser.index)
    df[metric] = ser.resample('D').bfill()

df = df[df.index >= pd.Timestamp(START_DATE)]
df.to_csv("data/FED_data.csv")

print(df.head())
print(df.tail())

