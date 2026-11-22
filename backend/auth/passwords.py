from argon2 import PasswordHasher, Type, extract_parameters
from argon2.exceptions import InvalidHashError, VerifyMismatchError


_PASSWORD_HASHER = PasswordHasher(type=Type.ID)


def hash_password(password):
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string")
    return _PASSWORD_HASHER.hash(password)


def is_argon2id_hash(encoded_hash):
    if not isinstance(encoded_hash, str):
        return False
    try:
        return extract_parameters(encoded_hash).type == Type.ID
    except InvalidHashError:
        return False


def verify_password(password, encoded_hash):
    if not isinstance(password, str) or not isinstance(encoded_hash, str):
        raise ValueError("Password and password hash must be strings")
    try:
        return _PASSWORD_HASHER.verify(encoded_hash, password)
    except VerifyMismatchError:
        return False
