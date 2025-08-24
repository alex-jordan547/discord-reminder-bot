#!/usr/bin/env python3
"""
Development script to fix formatting issues in code files.
"""

import os
import sys
import re

def fix_trailing_spaces(file_path):
    """Remove trailing spaces from a file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    fixed_lines = [line.rstrip() for line in lines]
    
    fixed_content = '\n'.join(fixed_lines)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    return len(lines) - len([line for line in lines if line == line.rstrip()])

def main():
    """Main function."""
    print("🔧 Fixing formatting issues...")
    
    # Python files to fix
    python_files = []
    for root, dirs, files in os.walk('.'):
        # Skip hidden directories and test directories
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    total_fixes = 0
    
    for file_path in python_files:
        fixes = fix_trailing_spaces(file_path)
        if fixes > 0:
            print(f"✅ {file_path}: {fixes} trailing spaces fixed")
            total_fixes += fixes
    
    if total_fixes == 0:
        print("🎉 No formatting issues found!")
    else:
        print(f"🎉 Fixed {total_fixes} formatting issues!")
    
    return 0

if __name__ == "__main__":
    exit(main())