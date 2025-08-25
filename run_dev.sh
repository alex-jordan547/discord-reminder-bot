#!/bin/bash

# Script de lancement du bot Discord en mode développement
# Usage: ./run_dev.sh

echo "🚀 Démarrage du bot Discord en mode développement..."
echo "📂 Dossier de travail: $(pwd)"
echo "🐍 Version Python: $(python --version 2>&1)"
echo ""

# S'assurer qu'on utilise le bon environnement virtuel
if [[ -f ".venv/bin/activate" ]]; then
    echo "⚠️  Activation de l'environnement virtuel (.venv)..."
    source .venv/bin/activate
elif [[ -f "venv/bin/activate" ]]; then
    echo "⚠️  Activation de l'environnement virtuel (venv)..."
    source venv/bin/activate
else
    echo "❌ Aucun environnement virtuel trouvé!"
    echo "📋 Créez un environnement virtuel avec: python3 -m venv .venv"
    exit 1
fi

# Vérifier la présence du fichier .env
if [[ ! -f .env ]]; then
    echo "❌ Fichier .env manquant!"
    echo "📋 Copiez .env.example vers .env et configurez votre DISCORD_TOKEN"
    exit 1
fi

# Afficher la configuration
echo "⚙️  Configuration actuelle:"
echo "   - Mode test: $(grep TEST_MODE .env | cut -d'=' -f2)"
echo "   - Intervalle: $(grep REMINDER_INTERVAL_HOURS .env | cut -d'=' -f2) heures"
echo "   - Log level: $(grep LOG_LEVEL .env | cut -d'=' -f2)"
echo ""

# Créer les dossiers nécessaires s'ils n'existent pas
mkdir -p data logs

echo "🎯 Lancement du bot..."
echo "💡 Appuyez sur Ctrl+C pour arrêter le bot"
echo "📝 Les logs détaillés sont disponibles en mode DEBUG"
echo "🌈 Couleurs des logs : ajoutez FORCE_COLOR=1 avant la commande pour forcer l'activation"
echo "   Example: FORCE_COLOR=1 ./run_dev.sh"
echo ""

# Vérifier la version Python après activation
echo "🐍 Version Python après activation: $(python --version 2>&1)"
echo "🔍 Chemin Python: $(which python)"
echo ""

# Lancer le bot avec gestion des erreurs
python bot.py
exit_code=$?

echo ""
if [[ $exit_code -eq 0 ]]; then
    echo "✅ Bot arrêté proprement"
else
    echo "❌ Bot arrêté avec erreur (code: $exit_code)"
fi