#!/bin/bash
echo ""
echo "  Lead Finder - Wigan Barbers & Hairdressers"
echo ""

if ! command -v python3 &>/dev/null; then
    echo "  ERROR: Python 3 is not installed."
    echo "  Install it from https://www.python.org/downloads/"
    exit 1
fi

python3 find_leads.py
