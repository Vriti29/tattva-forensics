import argparse
import getpass
import os
import sys
from pathlib import Path

from backend.auth.passwords import hash_password
from backend.investigation_store import InvestigationStore


def main(argv=None):
    default_data_directory = os.environ.get(
        "TATTVA_DATA_DIR",
        str(Path(__file__).resolve().parent / "data"),
    )
    parser = argparse.ArgumentParser(
        description="Create the first Tattva Forensics administrator."
    )
    parser.add_argument(
        "--data-directory",
        default=default_data_directory,
        help="Persistent backend data directory (defaults to TATTVA_DATA_DIR).",
    )
    args = parser.parse_args(argv)
    store = InvestigationStore(args.data_directory)

    if store.has_admin():
        print("An Admin account already exists; bootstrap refused.", file=sys.stderr)
        return 1

    username = input("Admin username/email: ").strip()
    password = getpass.getpass("Admin password: ")
    confirmation = getpass.getpass("Confirm Admin password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    try:
        admin = store.provision_initial_admin(username, hash_password(password))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    print(
        f"Initial Admin provisioned: {admin['username']} "
        f"({admin['user_id']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
