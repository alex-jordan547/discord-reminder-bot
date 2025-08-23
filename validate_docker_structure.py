#!/usr/bin/env python3
"""
Script de validation de la structure modulaire pour Docker.
Ce script teste que tous les modules peuvent être importés (structure uniquement).
"""

import sys
import os
import importlib.util
from pathlib import Path

def check_module_structure():
    """Vérifie que tous les modules ont une structure Python valide."""

    modules_to_check = [
        'commands/__init__.py',
        'config/__init__.py',
        'config/settings.py',
        'models/__init__.py',
        'models/reminder.py',
        'persistence/__init__.py',
        'persistence/storage.py',
        'utils/__init__.py',
        'utils/logging_config.py',
        'utils/message_parser.py',
        'utils/migration.py',
        'utils/permissions.py',
        'bot.py'
    ]

    print("🔍 Vérification de la structure modulaire...")

    errors = []

    for module_path in modules_to_check:
        full_path = Path(module_path)

        if not full_path.exists():
            errors.append(f"❌ Fichier manquant: {module_path}")
            continue

        # Test de compilation syntaxique
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()

            compile(content, str(full_path), 'exec')
            print(f"✅ {module_path}")

        except SyntaxError as e:
            errors.append(f"❌ Erreur de syntaxe dans {module_path}: {e}")
        except Exception as e:
            errors.append(f"❌ Erreur dans {module_path}: {e}")

    if errors:
        print("\n❌ Erreurs détectées:")
        for error in errors:
            print(f"  {error}")
        return False
    else:
        print("\n✅ Tous les modules ont une structure valide!")
        return True

def check_dockerfile_files():
    """Vérifie que les fichiers nécessaires pour Docker sont présents."""

    required_files = [
        'Dockerfile',
        'docker-compose.yml',
        'requirements.txt',
        '.dockerignore'
    ]

    print("\n🐳 Vérification des fichiers Docker...")

    missing_files = []

    for file_path in required_files:
        if not Path(file_path).exists():
            missing_files.append(file_path)
        else:
            print(f"✅ {file_path}")

    if missing_files:
        print("\n❌ Fichiers manquants:")
        for file_path in missing_files:
            print(f"  ❌ {file_path}")
        return False
    else:
        print("\n✅ Tous les fichiers Docker sont présents!")
        return True

def main():
    """Point d'entrée principal."""
    print("🚀 Validation de la structure pour Docker\n")

    # Changer vers le répertoire du script
    script_dir = Path(__file__).parent
    os.chdir(script_dir)

    structure_ok = check_module_structure()
    docker_files_ok = check_dockerfile_files()

    if structure_ok and docker_files_ok:
        print("\n🎉 Structure modulaire prête pour Docker!")
        print("   Vous pouvez maintenant construire l'image avec: docker build -t discord-reminder-bot .")
        return 0
    else:
        print("\n❌ Des problèmes ont été détectés. Veuillez les corriger avant de construire l'image Docker.")
        return 1

if __name__ == "__main__":
    sys.exit(main())