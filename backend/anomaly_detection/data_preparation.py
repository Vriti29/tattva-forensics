import pandas as pd
from .feature_engineering import extract_features

def prepare_anomaly_data(records):
    features = extract_features(records)
    if not features:
        return pd.DataFrame()
    return pd.DataFrame(features).fillna(0)