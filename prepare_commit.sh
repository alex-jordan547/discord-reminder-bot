#!/bin/bash
# Script de gestion des commits et nettoyage Git

echo "🔧 GESTION GIT - IDENTIFICATION DES FICHIERS À COMMITER"
echo "======================================================"

# 1. Nettoyer les fichiers temporaires
echo "🧹 Nettoyage des fichiers temporaires..."
rm -f diagnostic_*.py test_verification.py fix_environment.sh 2>/dev/null || true

# 2. Unstage tous les fichiers actuels
echo "⏪ Unstaging de tous les fichiers..."
git reset HEAD . 2>/dev/null || true

# 3. Ajouter les fichiers critiques pour la CI/CD
echo "📦 Staging des corrections critiques CI/CD..."
git add .github/workflows/ci.yml || echo "⚠️ ci.yml déjà à jour"
git add .github/workflows/cd.yml || echo "⚠️ cd.yml déjà à jour"

# 4. Ajouter les configurations
echo "⚙️ Staging des configurations..."
git add pyproject.toml || echo "⚠️ pyproject.toml déjà à jour"
git add requirements-dev.txt || echo "⚠️ requirements-dev.txt déjà à jour"
git add .gitignore || echo "⚠️ .gitignore déjà à jour"

# 5. Ajouter les tests pytest
echo "🧪 Staging des tests pytest..."
git add tests/test_basic.py 2>/dev/null || echo "⚠️ test_basic.py non trouvé"
git add tests/test_message_parser.py 2>/dev/null || echo "⚠️ test_message_parser.py non trouvé"
git add tests/test_reminder_model.py 2>/dev/null || echo "⚠️ test_reminder_model.py non trouvé"
git add tests/test_imports.py 2>/dev/null || echo "⚠️ test_imports.py non trouvé"

# 6. Vérifier le statut
echo "📊 Statut Git après staging..."
git status --porcelain || echo "Erreur de statut Git"

echo ""
echo "✅ FICHIERS PRÊTS À ÊTRE COMMITÉS :"
echo "- .github/workflows/ci.yml (versions d'actions corrigées)"
echo "- .github/workflows/cd.yml (version python action corrigée)"
echo "- pyproject.toml (configuration pytest corrigée)"
echo "- requirements-dev.txt (pytest-env et pytest-xdist ajoutés)"
echo "- .gitignore (exclusions améliorées)"
echo "- tests/*.py (tests pytest fonctionnels)"

echo ""
echo "❌ FICHIERS EXCLUS (dans .gitignore) :"
echo "- diagnostic_*.py (scripts temporaires)"
echo "- test_verification.py (script temporaire)"
echo "- fix_environment.sh (script temporaire)"
echo "- htmlcov/ (rapports de coverage)"
echo "- __pycache__/ (bytecode Python)"

echo ""
echo "🚀 COMMANDES SUGGÉRÉES :"
echo "git commit -m 'fix: Corriger configuration CI/CD et ajouter tests pytest'"
echo "git commit -m 'feat: Améliorer workflow CI avec timeouts et tests robustes'"
echo "git push"
