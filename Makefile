# NOTES: 
# - The command lines (recipe lines) must start with a TAB character.
# - Each command line runs in a separate shell if .ONESHELL: is not specified.
.PHONY: cleanall install install-dev download-seminar-pdfs download-seminar-pdfs-selected check-missing-seminar-pdfs generate-seminar-basic-info-enriched-csv
.ONESHELL:
