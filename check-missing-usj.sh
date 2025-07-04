#!/bin/bash

# Script to check for missing USJ examples in examples/usfm-markers directory
# Usage: ./check-missing-usj.sh [path-to-examples-directory]

# Show help if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [path-to-examples-directory]"
    echo ""
    echo "Checks for missing USJ examples in the specified directory."
    echo "Defaults to 'examples/usfm-markers' if no path is provided."
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Check examples/usfm-markers"
    echo "  $0 examples/usfm-markers     # Check examples/usfm-markers"
    echo "  $0 /path/to/examples         # Check custom path"
    exit 0
fi

# Set the target directory (default to examples/usfm-markers)
TARGET_DIR="${1:-examples/usfm-markers}"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory '$TARGET_DIR' does not exist."
    echo "Usage: $0 [path-to-examples-directory]"
    exit 1
fi

echo "Checking for missing USJ examples in: $TARGET_DIR"
echo "================================================================"

# Count total USFM examples
TOTAL_USFM=$(find "$TARGET_DIR" -name "example.usfm" | wc -l)

# Find missing USJ examples
MISSING_DIRS=$(find "$TARGET_DIR" -name "example.usfm" | sed 's|/example.usfm||' | while read dir; do
    if [ ! -f "$dir/example.usj" ]; then
        echo "$dir"
    fi
done | sort)

# Count missing examples
MISSING_COUNT=$(echo "$MISSING_DIRS" | grep -v "^$" | wc -l)
EXISTING_COUNT=$((TOTAL_USFM - MISSING_COUNT))

# Calculate coverage percentage
if [ $TOTAL_USFM -gt 0 ]; then
    COVERAGE=$((EXISTING_COUNT * 100 / TOTAL_USFM))
else
    COVERAGE="N/A"
fi

# Print summary
echo "SUMMARY:"
echo "--------"
echo "Total USFM examples: $TOTAL_USFM"
echo "Existing USJ files:  $EXISTING_COUNT"
echo "Missing USJ files:   $MISSING_COUNT"
echo "Coverage:           $COVERAGE%"
echo ""

if [ $MISSING_COUNT -eq 0 ]; then
    echo "🎉 All examples have USJ files!"
    exit 0
fi

echo "MISSING USJ EXAMPLES:"
echo "--------------------"

# List all missing examples
echo "$MISSING_DIRS" | grep -v "^$" | sort

echo ""
echo "MISSING BY CATEGORY:"
echo "-------------------"

# Character markers
CHAR_MISSING=$(echo "$MISSING_DIRS" | grep "/char-" | wc -l)
if [ $CHAR_MISSING -gt 0 ]; then
    echo "Character markers: $CHAR_MISSING"
    echo "$MISSING_DIRS" | grep "/char-" | sed 's|.*/char-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Chapter/Verse markers
CV_MISSING=$(echo "$MISSING_DIRS" | grep "/cv-" | wc -l)
if [ $CV_MISSING -gt 0 ]; then
    echo "Chapter/Verse markers: $CV_MISSING"
    echo "$MISSING_DIRS" | grep "/cv-" | sed 's|.*/cv-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Paragraph markers
PARA_MISSING=$(echo "$MISSING_DIRS" | grep "/para-" | wc -l)
if [ $PARA_MISSING -gt 0 ]; then
    echo "Paragraph markers: $PARA_MISSING"
    echo "$MISSING_DIRS" | grep "/para-" | sed 's|.*/para-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Note markers
NOTE_MISSING=$(echo "$MISSING_DIRS" | grep "/note-" | wc -l)
if [ $NOTE_MISSING -gt 0 ]; then
    echo "Note markers: $NOTE_MISSING"
    echo "$MISSING_DIRS" | grep "/note-" | sed 's|.*/note-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Milestone markers
MS_MISSING=$(echo "$MISSING_DIRS" | grep "/ms-" | wc -l)
if [ $MS_MISSING -gt 0 ]; then
    echo "Milestone markers: $MS_MISSING"
    echo "$MISSING_DIRS" | grep "/ms-" | sed 's|.*/ms-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Figure markers
FIG_MISSING=$(echo "$MISSING_DIRS" | grep "/fig-" | wc -l)
if [ $FIG_MISSING -gt 0 ]; then
    echo "Figure markers: $FIG_MISSING"
    echo "$MISSING_DIRS" | grep "/fig-" | sed 's|.*/fig-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Sidebar/Peripheral markers
SBAR_MISSING=$(echo "$MISSING_DIRS" | grep -E "/(sbar-|periph-)" | wc -l)
if [ $SBAR_MISSING -gt 0 ]; then
    echo "Sidebar/Peripheral markers: $SBAR_MISSING"
    echo "$MISSING_DIRS" | grep -E "/(sbar-|periph-)" | sed 's|.*/\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

# Cat markers
CAT_MISSING=$(echo "$MISSING_DIRS" | grep "/cat-" | wc -l)
if [ $CAT_MISSING -gt 0 ]; then
    echo "Category markers: $CAT_MISSING"
    echo "$MISSING_DIRS" | grep "/cat-" | sed 's|.*/cat-\([^/]*\)/.*|\1|' | sort | uniq -c | sort -nr | while read count marker; do
        echo "  $marker: $count"
    done
    echo ""
fi

echo "To generate missing USJ files, you can use your parser to convert the USFM files."
echo "Example: Use your USFMParser to load the .usfm file and export it as USJ format." 