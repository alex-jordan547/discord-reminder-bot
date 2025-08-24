#!/usr/bin/env python3
"""
Unit tests for code formatting validation.
"""

import os
import re

def check_file_formatting(file_path):
    """Check formatting issues in a file."""
    issues = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')

    # Check for double backslashes in strings
    double_backslash_pattern = r'["\'].*?\\\\n.*?["\']'
    matches = re.findall(double_backslash_pattern, content)
    if matches:
        issues.append({
            'type': 'double_backslashes',
            'count': len(matches),
            'examples': matches[:3]  # First 3 examples
        })

    # Check for trailing spaces
    trailing_spaces = []
    for i, line in enumerate(lines, 1):
        if line.rstrip() != line:
            trailing_spaces.append(i)

    if trailing_spaces:
        issues.append({
            'type': 'trailing_spaces',
            'count': len(trailing_spaces),
            'lines': trailing_spaces[:5]  # First 5 lines
        })

    return issues

def main():
    """Main function."""
    print("🔍 Checking Python file formatting...")
    print("=" * 60)

    # Files to check (adjust paths for test location)
    files_to_check = [
        '../../commands/handlers.py',
        '../../commands/slash_commands.py',
        '../../bot.py',
        '../../config/settings.py',
        '../../models/reminder.py'
    ]

    total_issues = 0
    files_with_issues = 0

    for file_path in files_to_check:
        full_path = os.path.join(os.path.dirname(__file__), file_path)
        if not os.path.exists(full_path):
            print(f"⚠️  {file_path} - File not found")
            continue

        print(f"📄 {file_path}")
        issues = check_file_formatting(full_path)

        if issues:
            files_with_issues += 1
            for issue in issues:
                total_issues += issue['count']

                if issue['type'] == 'double_backslashes':
                    print(f"  ❌ {issue['count']} double backslashes found:")
                    for example in issue['examples']:
                        print(f"    → {example}")
                elif issue['type'] == 'trailing_spaces':
                    print(f"  ❌ {issue['count']} lines with trailing spaces:")
                    for line_num in issue['lines']:
                        print(f"    → Line {line_num}")
        else:
            print("  ✅ No formatting issues detected")

        print()

    print("=" * 60)
    print(f"📊 Summary:")
    print(f"  • Files checked: {len(files_to_check)}")
    print(f"  • Files with issues: {files_with_issues}")
    print(f"  • Total issues: {total_issues}")

    if total_issues == 0:
        print("🎉 All files have correct formatting!")
        return 0
    else:
        print("⚠️  Some formatting issues remain to be fixed.")
        return 1

if __name__ == "__main__":
    exit(main())