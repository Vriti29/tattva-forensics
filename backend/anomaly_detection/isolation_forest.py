from sklearn.ensemble import IsolationForest
from .data_preparation import prepare_anomaly_data

def detect_anomalies(records, contamination=0.05):
    if not 0 < contamination <= 0.5:
        raise ValueError("Contamination must be greater than 0 and at most 0.5.")

    data = prepare_anomaly_data(records)
    if len(data) < 2:
        return {
            "anomalies": [],
            "total_records": len(data),
            "anomaly_count": 0,
            "message": "At least two records are required."
        }

    model = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=42
    )
    predictions = model.fit_predict(data)
    scores = model.decision_function(data)

    anomalies = []
    for index, prediction in enumerate(predictions):
        if prediction == -1:
            record = records[index]
            get_value = lambda key: record.get(key) if isinstance(record, dict) else getattr(record, key, None)
            anomalies.append({
                "evidence_id": get_value("evidence_id"),
                "event_type": get_value("event_type"),
                "timestamp": get_value("timestamp"),
                "anomaly_score": round(float(scores[index]), 4),
                "reason": "Activity differs from the patterns learned by the model."
            })

    return {
        "anomalies": anomalies,
        "total_records": len(data),
        "anomaly_count": len(anomalies),
        "contamination": contamination
    }