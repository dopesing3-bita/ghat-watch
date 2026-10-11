"""BR-04: map year to the MPPCB report file and build page links."""
BASE_URL = "https://www.mppcb.mp.gov.in/proc/mon/"

REPORTS = {
    2023: "Idol_immer._Report_23_CPCB.pdf",
    2024: "Ganesh_and_Durga_visarjan_report-2024.pdf",
    2025: "Ganesh_and_Durga_visarjan_report-2025.pdf",
}


def report_file(year):
    """BR-04: report file name for a year (Ganesh and Durga share one report per year)."""
    return REPORTS[int(year)]


def page_link(year, page):
    """BR-04: official report URL ending in #page=N. The app only links, never downloads."""
    return f"{BASE_URL}{report_file(year)}#page={int(page)}"
