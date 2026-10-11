"""Data layer tests (BR-01 to BR-06, BR-32)."""
from src.config import load_rules
from src.coverage import confidence, core_grid, coverage_counts
from src.load import BDL, MISSING, VALID, reading_status
from src.sources import page_link, report_file


def test_row_count(df):
    assert len(df) == 1524


def test_do_counts(df):
    do = df[(df.parameter == "Dissolved oxygen") & (df.status == VALID)]
    assert len(do) == 116
    assert (do.num < 5).sum() == 42


def test_bod_counts(df):
    bod = df[(df.parameter == "BOD") & (df.status == VALID)]
    assert len(bod) == 112
    assert (bod.num > 3).sum() == 100


def test_four_zero_do_all_bairagarh(df):
    zeros = df[(df.parameter == "Dissolved oxygen") & (df.status == VALID) & (df.num == 0)]
    assert len(zeros) == 4
    assert set(zeros.site) == {"Bairagarh (Sant Hirdaram) kund"}


def test_missing_never_pass_or_fail(df):
    """BR-01: missing readings have no number, so no comparison can count them."""
    missing = df[df.status == MISSING]
    assert len(missing) > 0
    assert missing.num.isna().all()
    assert not (missing.num < 5).any() and not (missing.num > 3).any()


def test_bdl_never_zero(df):
    """BR-02: BDL is very low, not zero."""
    bdl = df[df.status == BDL]
    assert len(bdl) == 174
    assert bdl.num.isna().all()


def test_status_codes():
    rules = load_rules()
    assert reading_status("", "BDL", rules) == BDL
    assert reading_status("", "ND", rules) == BDL
    for flag in ["not sampled", "*", "**", ""]:
        assert reading_status("", flag, rules) == MISSING
    assert reading_status("0", "", rules) == VALID


def test_no_durga_2025_bairagarh_malikhedi(df):
    for site in ["Bairagarh (Sant Hirdaram) kund", "Malikhedi kund"]:
        assert df[(df.site == site) & (df.year == 2025) & (df.festival == "Durga")].empty


def test_no_table_cells_are_missing(df, rules):
    cells = core_grid(df, "Bairagarh (Sant Hirdaram) kund", rules)
    assert len(cells) == 36
    durga25 = [c for c in cells if c["year"] == 2025 and c["festival"] == "Durga"]
    assert all(c["status"] == MISSING and c["no_table"] for c in durga25)
    assert round(confidence(cells), 3) == round(26 / 36, 3)


def test_coverage_counts_sum(df):
    cov = coverage_counts(df)
    assert cov[[VALID, BDL, MISSING]].to_numpy().sum() == 1524


def test_sources():
    assert report_file(2024) == "Ganesh_and_Durga_visarjan_report-2024.pdf"
    assert page_link(2025, 28) == (
        "https://www.mppcb.mp.gov.in/proc/mon/Ganesh_and_Durga_visarjan_report-2025.pdf#page=28")
