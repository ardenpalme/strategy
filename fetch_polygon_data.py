import pandas as pd
from massive import RESTClient
import sys

client = RESTClient("BcG8_2Yp4Wkrpw9Ox2_HyUlTuLZGZve_")

TICKER = sys.argv[1]
OUTPUT_FILE = f"data/{TICKER}_1d_data.csv"

aggs = list(client.list_aggs(
    "X:SOLUSD",
    1,
    "day",
    "2023-12-28",
    "2025-12-28",
    adjusted="true",
    sort="asc",
))

df = pd.DataFrame([{
    'timestamp': pd.to_datetime(agg.timestamp, unit='ms'),
    'open': agg.open,
    'high': agg.high,
    'low': agg.low,
    'close': agg.close,
    'volume': agg.volume,
    'vwap': agg.vwap,
    'transactions': agg.transactions
} for agg in aggs])

df.set_index('timestamp', inplace=True)

print(df.head())
print(f"\nColumns: {df.columns.tolist()}")

df.to_csv(OUTPUT_FILE)
