import pytest

from src.config import load_rules
from src.load import load_readings


@pytest.fixture(scope="session")
def rules():
    return load_rules()


@pytest.fixture(scope="session")
def df(rules):
    return load_readings(rules)
