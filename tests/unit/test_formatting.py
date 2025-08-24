#!/usr/bin/env python3
"""
Unit tests for code formatting validation.
"""

import os
import re
import sys

# Add project root to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

def check_file_formatting(file_path):
    """Vérifier les problèmes de formatage dans un fichier."""
    issues = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')

    # Vérifier les double backslashes dans les chaînes de caractères
    double_backslash_pattern = r'["\'].*?\\\\n.*?["\']'
    matches = re.findall(double_backslash_pattern, content)
    if matches:
        issues.append({
            'type': 'double_backslashes',
            'count': len(matches),
            'examples': matches[:3]  # Premiers 3 exemples
        })

    # Vérifier les espaces en fin de ligne
    trailing_spaces = []
    for i, line in enumerate(lines, 1):
        if line.rstrip() != line:
            trailing_spaces.append(i)

    if trailing_spaces:
        issues.append({
            'type': 'trailing_spaces',
            'count': len(trailing_spaces),
            'lines': trailing_spaces[:5]  # Premières 5 lignes
        })

    return issues

def main():
    """Fonction principale."""
    print("🔍 Vérification du formatage des fichiers Python...")
    print("=" * 60)

    # Fichiers à vérifier (adjust paths for test location)
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
            print(f"⚠️  {file_path} - Fichier non trouvé")
            continue

        print(f"📄 {file_path}")
        issues = check_file_formatting(full_path)

        if issues:
            files_with_issues += 1
            for issue in issues:
                total_issues += issue['count']

                if issue['type'] == 'double_backslashes':
                    print(f"  ❌ {issue['count']} double backslashes trouvés:")
                    for example in issue['examples']:
                        print(f"    → {example}")
                elif issue['type'] == 'trailing_spaces':
                    print(f"  ❌ {issue['count']} lignes avec espaces en fin:")
                    for line_num in issue['lines']:
                        print(f"    → Ligne {line_num}")
        else:
            print("  ✅ Aucun problème de formatage détecté")

        print()

    print("=" * 60)
    print(f"📊 Résumé:")
    print(f"  • Fichiers vérifiés: {len(files_to_check)}")
    print(f"  • Fichiers avec problèmes: {files_with_issues}")
    print(f"  • Total des problèmes: {total_issues}")

    if total_issues == 0:
        print("🎉 Tous les fichiers ont un formatage correct !")
        return 0
    else:
        print("⚠️  Certains problèmes de formatage restent à corriger.")
        return 1

if __name__ == "__main__":
    exit(main())