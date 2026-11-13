from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    confusion_matrix
)

def evaluate_anomaly_detection(actual_labels, predicted_labels):
    if len(actual_labels) != len(predicted_labels):
        raise ValueError("Actual and predicted labels must have equal lengths.")
    if not actual_labels:
        raise ValueError("Evaluation data cannot be empty.")

    actual = [1 if value in (1, -1) else 0 for value in actual_labels]
    predicted = [1 if value in (1, -1) else 0 for value in predicted_labels]

    tn, fp, fn, tp = confusion_matrix(actual, predicted, labels=[0, 1]).ravel()

    return {
        "precision": round(precision_score(actual, predicted, zero_division=0), 4),
        "recall": round(recall_score(actual, predicted, zero_division=0), 4),
        "f1_score": round(f1_score(actual, predicted, zero_division=0), 4),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp)
        },
        "false_positive_rate": round(fp / (fp + tn), 4) if (fp + tn) else 0.0
    }