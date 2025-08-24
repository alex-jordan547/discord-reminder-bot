#!/usr/bin/env python3
"""
Script pour corriger automatiquement les espaces en fin de ligne dans les fichiers Python.
"""

import os


def fix_trailing_spaces(file_path):
    """Corriger les espaces en fin de ligne dans un fichier."""
    print(f"🔧 Traitement de {file_path}...")

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    fixed_lines = []
    changes_count = 0

    for i, line in enumerate(lines, 1):
        original_line = line
        fixed_line = line.rstrip() + "\n" if line.strip() else "\n"

        # Garder le dernier saut de ligne du fichier si nécessaire
        if i == len(lines) and not line.endswith("\n"):
            fixed_line = fixed_line.rstrip("\n")

        if original_line != fixed_line:
            changes_count += 1

        fixed_lines.append(fixed_line)

    # Écrire le fichier corrigé
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(fixed_lines)

    if changes_count > 0:
        print(f"  ✅ {changes_count} ligne(s) corrigée(s)")
    else:
        print("  ✅ Aucune correction nécessaire")

    return changes_count


def main():
    """Fonction principale."""
    print("🧹 Nettoyage des espaces en fin de ligne...")
    print("=" * 50)

    # Fichiers Python à nettoyer
    python_files = []

    # Chercher tous les fichiers .py récursivement
    for root, dirs, files in os.walk("."):
        # Ignorer certains dossiers
        dirs[:] = [
            d for d in dirs if d not in [".git", "__pycache__", ".pytest_cache", "venv", "env"]
        ]

        for file in files:
            if file.endswith(".py"):
                python_files.append(os.path.join(root, file))

    total_changes = 0
    files_changed = 0

    for file_path in sorted(python_files):
        changes = fix_trailing_spaces(file_path)
        total_changes += changes
        if changes > 0:
            files_changed += 1

    print("=" * 50)
    print("📊 Résumé:")
    print(f"  • Fichiers traités: {len(python_files)}")
    print(f"  • Fichiers modifiés: {files_changed}")
    print(f"  • Total des corrections: {total_changes}")

    if total_changes > 0:
        print("🎉 Nettoyage terminé avec succès !")
    else:
        print("✨ Tous les fichiers étaient déjà propres !")

    return 0


if __name__ == "__main__":
    exit(main())
