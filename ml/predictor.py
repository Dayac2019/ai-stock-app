# ml/predictor.py
from flask import Flask, jsonify, request
import yfinance as yf
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from datetime import datetime, timedelta

app = Flask(__name__)

# Simple signal: fetch last 180 days for candidate symbols and train a tiny model.
CANDIDATES = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','INTC','AMD','SPY']

def make_features(symbol):
    df = yf.download(symbol, period='2y', interval='1d', progress=False)
    if df.shape[0] < 100:
        return None
    df['r1'] = df['Close'].pct_change()
    df['ma5'] = df['Close'].rolling(5).mean()
    df['ma20'] = df['Close'].rolling(20).mean()
    df['vol_ma10'] = df['Volume'].rolling(10).mean()
    df = df.dropna()
    df['target'] = (df['Close'].shift(-5) / df['Close'] - 1) > 0.02  # +2% in 5 days
    X = df[['r1','ma5','ma20','vol_ma10']].values[:-5]
    y = df['target'].values[:-5]
    return X,y,df

def score_symbol(symbol):
    try:
        ret = make_features(symbol)
        if ret is None: return None
        X,y,_ = ret
        # very tiny model to rank
        n = min(200, len(X))
        X_train, y_train = X[-n:-50], y[-n:-50]
        X_pred = X[-50:]
        if len(X_train) < 20:
            return None
        clf = RandomForestClassifier(n_estimators=50)
        clf.fit(X_train, y_train)
        probs = clf.predict_proba(X_pred)[:,1]
        return float(probs.mean())
    except Exception as e:
        print('score error', symbol, e)
        return None

@app.route('/predict/top')
def top_picks():
    n = int(request.args.get('n', 5))
    scored = []
    for s in CANDIDATES:
        score = score_symbol(s)
        if score is not None:
            scored.append({'symbol': s, 'score': score})
    scored.sort(key=lambda x: x['score'], reverse=True)
    return jsonify({'picks': scored[:n]})

@app.route('/')
def hello(): return 'predictor ok'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
