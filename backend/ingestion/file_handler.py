from pathlib import Path

SUPPORTED_FORMATS = {".log", ".txt", ".csv", ".json"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def validate_file(file_path):
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    if not path.is_file():
        raise ValueError("Provided path is not a file.")

    if path.suffix.lower() not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported file format: {path.suffix}")

    if path.stat().st_size > MAX_FILE_SIZE:
        raise ValueError("File exceeds the 10 MB size limit.")

    return True


def read_file(file_path):
    validate_file(file_path)

    path = Path(file_path)

    try:
        with path.open("r", encoding="utf-8-sig") as file:
            return file.read()

    except UnicodeDecodeError as error:
        raise ValueError("File is not valid UTF-8 text.") from error


def get_file_metadata(file_path):
    validate_file(file_path)

    path = Path(file_path)

    return {
        "filename": path.name,
        "extension": path.suffix.lower(),
        "size_bytes": path.stat().st_size
    }
