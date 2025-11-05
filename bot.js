import WebSocket from "ws";
import Decimal from "decimal.js";

const ASSET = "SOL";
//https://docs.pyth.network/price-feeds/core/price-feeds/price-feed-ids for price feed ids
const PYTH_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const WS_URL = "wss://hermes.pyth.network/ws";
const ws = new WebSocket(WS_URL); //creates a new websocket connection to Pyth
//simple logger function
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
//NOTE: CANDLESTICK_DURATION and CANDLESTICK_INTERVAL should match each other
const CANDLESTICK_DURATION = 1000 * 1; //milliseconds (1000 * X = X seconds)
//https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints refer for intervals for binance api
const CANDLESTICK_INTERVAL = "1s"; //for the binance api
const SYMBOL = "SOLUSDT"; //for the binance api
const CANDLESTICK_WINDOW_SIZE = 20; //how many candlesticks to keep track of

class Candle {
  constructor(timestamp, open, high, low, close) {
    this.timestamp = timestamp; //note timestamp is the open time of the candle
    this.open = open;
    this.high = high;
    this.low = low;
    this.close = close;
  }
  //for easier printing
  toString() {
    return `${this.timestamp} - ${this.open.toFixed(4)} - ${this.high.toFixed(
      4
    )} - ${this.low.toFixed(4)} - ${this.close.toFixed(4)}`;
  }
}
//array of historical candles
const candles = [];

const indicators = {
  sma20: null,
  rsi14: null,
  bollingerBands: null,
};

//async to wait for historical candles
ws.onopen = async () => {
  log("Connected to Pyth Websocket");
  //wait to fetch historical candles before continuing
  const startTime = Date.now() - CANDLESTICK_DURATION * CANDLESTICK_WINDOW_SIZE;
  const endTime = Date.now();
  log(
    `Fetching historical candles for ${SYMBOL} at ${CANDLESTICK_INTERVAL} interval from ${startTime} to ${endTime}`
  );
  await fetchHistoricalCandles(
    startTime,
    endTime,
    SYMBOL,
    CANDLESTICK_INTERVAL
  );
  log(`Fetched ${candles.length} candles`);
  //update indicators initially with historical candles so they are ready instantly
  updateIndicators();
  //when historical candles are fetched, subscribe to price updates for the asset
  log(`Subscribing to ${ASSET} price updates...`);
  ws.send(
    JSON.stringify({
      type: "subscribe",
      ids: [PYTH_ID],
    })
  );
  log(`Subscribed to ${ASSET} price updates`);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type !== "price_update") return;

  const { price, confidence, timestamp } = parsePrice(data.price_feed);
  //   log(
  //     `${ASSET} price: ${price} confidence: ${confidence} timestamp: ${timestamp}`
  //   );
  onTick(price, timestamp);
};

function onTick(price, timestamp) {
  const candleClosed = updateCandles(price, timestamp);
  //can choose when to update indicators, every tick or every candle close
  let signal = null;
  if (candleClosed) {
    //update indicators only when candle is closed for more stable signals
    updateIndicators();
    signal = generateSignal(price);
  } else {
    signal = generateSignal(price);
  }
  //logic to handle signals here
  if (signal) {
    log(`Signal: ${signal.signal} @ $${signal.price}`);
  } else {
    // log("NO SIGNAL");
  }
}

function updateIndicators() {
  indicators.sma20 = calculateSMA(candles, 20);
  indicators.rsi14 = calculateRSI(candles, 14);
  indicators.bollingerBands = calculateBollingerBands(candles, 20, 2);
  //   log(
  //     `SMA20: ${indicators.sma20} RSI14: ${indicators.rsi14} Bollinger Bands: ${indicators.bollingerBands.lower} - ${indicators.bollingerBands.middle} - ${indicators.bollingerBands.upper}`
  //   );
}

function generateSignal(price) {
  if (indicators.rsi14 === null || indicators.bollingerBands === null) {
    log("INDICATORS ARE NULL");
    return null;
  }

  if (indicators.rsi14 < 30 && price < indicators.bollingerBands.lower) {
    return { signal: "BUY", price };
  } else if (indicators.rsi14 > 70 && price > indicators.bollingerBands.upper) {
    return { signal: "SELL", price };
  } else {
    return null;
  }
}

function parsePrice(price_feed) {
  const price = new Decimal(price_feed.price.price);
  const confidence = new Decimal(price_feed.price.conf);
  const exponent = new Decimal(price_feed.price.expo);
  const timestamp = new Date(price_feed.price.publish_time * 1000);
  const actual_price = price.times(Math.pow(10, exponent.toNumber()));
  const actual_confidence = confidence.times(Math.pow(10, exponent.toNumber()));
  return { price: actual_price, confidence: actual_confidence, timestamp };
}

function updateCandles(price, timestamp) {
  if (candles.length === 0) return;
  const numericPrice = price.toNumber(); //change decimal to number
  //fetch the current candle, the last one in the list
  const currentCandle = candles[candles.length - 1];
  //calculate the time at which the current candle should close
  const currentCandleEndTimestamp =
    currentCandle.timestamp + CANDLESTICK_DURATION;
  if (timestamp >= currentCandleEndTimestamp) {
    //if the current time is outside the current candle, then close the current candle
    const newTimestamp = currentCandleEndTimestamp; //start the new candle at the end of the current candle
    //create a new candle with this timestamp and all OHLC set to the current price initially
    const newCandle = new Candle(
      newTimestamp,
      numericPrice,
      numericPrice,
      numericPrice,
      numericPrice
    );

    //add the new candle to the list
    candles.push(newCandle);
    // log(`Added new candle: ${newCandle.toString()}`);

    //need to check if adding the new candle has made the list too long
    if (candles.length > CANDLESTICK_WINDOW_SIZE) {
      //if the list is too long, remove the oldest candle
      candles.shift();
    }
    //return true because the candle is closed, will trigger events for onCandleClose
    return true;
  } else {
    //if the current price is within the current candles time, then update current candle
    //if current price is a new high/low, update high/low
    currentCandle.high = Math.max(currentCandle.high, numericPrice);
    currentCandle.low = Math.min(currentCandle.low, numericPrice);
    //overright the close price of the current candle
    currentCandle.close = numericPrice;
    //return false because the candle is not closed
    return false;
  }
}

//gets historical candles from binance
async function fetchHistoricalCandles(
  startTime,
  endTime,
  symbol,
  candleStickInterval
) {
  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${candleStickInterval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const response = await fetch(binanceUrl);
  const klines = await response.json();
  for (const kline of klines) {
    const timestamp = parseInt(kline[0], 10); // openTime
    const open = parseFloat(kline[1]);
    const high = parseFloat(kline[2]);
    const low = parseFloat(kline[3]);
    const close = parseFloat(kline[4]);
    const candle = new Candle(timestamp, open, high, low, close);
    //can change logic here to do whatever we want with the candle data
    candles.push(candle);
  }
  log("Timestamp - Open - High - Low - Close");
  for (const candle of candles) {
    log(candle.toString());
  }
}

function calculateSMA(candles, period) {
  if (candles.length < period) return null;
  const relevantCandles = candles.slice(-period);
  const sum = relevantCandles.reduce((acc, candle) => acc + candle.close, 0);
  return sum / period;
}

function calculateRSI(candles, period) {
  //need at least period + 1 candles to calculate RSI
  if (candles.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100; //avoid division by zero

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateBollingerBands(candles, period = 20, multiplier = 2) {
  if (candles.length < period) return null;

  const relevant = candles.slice(-period);
  const closes = relevant.map((c) => c.close);
  const sma = closes.reduce((acc, val) => acc + val, 0) / closes.length;

  const variance =
    closes.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) /
    closes.length;
  const stdDev = Math.sqrt(variance);

  return {
    middle: sma,
    upper: sma + stdDev * multiplier,
    lower: sma - stdDev * multiplier,
  };
}
