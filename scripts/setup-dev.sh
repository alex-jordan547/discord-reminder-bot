#!/bin/bash
# Setup script for new developers
# Run this after cloning the repository

echo "🚀 Configuration de l'environnement de développement Discord Reminder Bot"
echo "=========================================================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    case $1 in
        "success") echo -e "${GREEN}✅ $2${NC}" ;;
        "error") echo -e "${RED}❌ $2${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️ $2${NC}" ;;
        "info") echo -e "ℹ️ $2" ;;
    esac
}

# 1. Check Python version
print_status "info" "Vérification de la version Python..."
python_version=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
required_version="3.8"
if [[ $(echo "$python_version >= $required_version" | bc -l) -eq 1 ]]; then
    print_status "success" "Python $python_version détecté (>= $required_version requis)"
else
    print_status "error" "Python $python_version détecté, mais >= $required_version requis"
    exit 1
fi

# 2. Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_status "info" "Création de l'environnement virtuel..."
    python3 -m venv venv
    print_status "success" "Environnement virtuel créé"
else
    print_status "info" "Environnement virtuel existant trouvé"
fi

# 3. Activate virtual environment and install dependencies
print_status "info" "Activation de l'environnement virtuel et installation des dépendances..."
source venv/bin/activate
pip install --upgrade pip
make dev-install

# 4. Install pre-commit hooks
print_status "info" "Installation des pre-commit hooks..."
pre-commit install
pre-commit install --hook-type pre-push

# 5. Setup custom git hooks
print_status "info" "Configuration des hooks Git personnalisés..."
mkdir -p .git/hooks
chmod +x .githooks/pre-push
ln -sf ../../.githooks/pre-push .git/hooks/pre-push

# 6. Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "info" "Création du fichier .env..."
    cp .env.example .env
    print_status "warning" "Fichier .env créé - veuillez le configurer avec vos tokens Discord"
else
    print_status "info" "Fichier .env existant trouvé"
fi

# 7. Run initial formatting
print_status "info" "Formatage initial du code..."
make format

# 8. Test the setup
print_status "info" "Test de la configuration..."
if make format-check > /dev/null 2>&1; then
    print_status "success" "Configuration testée avec succès"
else
    print_status "warning" "Quelques problèmes de formatage détectés - corrigés automatiquement"
    make format
fi

print_status "success" "Configuration terminée!"
echo ""
echo "📚 PROCHAINES ÉTAPES:"
echo "   1. Editez le fichier .env avec votre token Discord"
echo "   2. Lancez: ./run_dev.sh pour tester le bot"
echo "   3. Utilisez: make help pour voir toutes les commandes disponibles"
echo ""
echo "🛠️ COMMANDES DE DÉVELOPPEMENT UTILES:"
echo "   make format          - Formate tout le code"
echo "   make format-check    - Vérifie le formatage"
echo "   make validate-ci     - Valide avant commit"
echo "   make pre-commit-all  - Lance tous les hooks"
echo ""
echo "🎉 Environnement prêt pour le développement!"