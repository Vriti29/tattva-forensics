from datetime import timedelta

RULES = {
    "R01": "Repeated failed logins",
    "R02": "Successful login after repeated failures",
    "R03": "Unusual-hour login",
    "R04": "Sensitive file access",
    "R05": "Archive created after related file access",
    "R06": "Unusually large outbound data transfer",
    "R07": "Multiple IPs used by one account in a short window"
}

FAILED_LOGIN_THRESHOLD = 3
LOGIN_WINDOW_MINUTES = 5
MULTIPLE_IP_WINDOW_MINUTES = 10
LARGE_TRANSFER_BYTES = 50 * 1024 * 1024
UNUSUAL_HOURS = (0, 5)

SENSITIVE_PATH_KEYWORDS = (
    "confidential", "secret", "restricted", "sensitive"
)