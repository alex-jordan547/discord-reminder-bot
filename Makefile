# Discord Reminder Bot - Makefile
# Commandes utiles pour le développement et le déploiement

.PHONY: help build run stop logs clean validate test-docker

# Variables
IMAGE_NAME=discord-reminder-bot
CONTAINER_NAME=discord-reminder-bot

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

validate: ## Valide la structure avant build Docker
	@echo "🔍 Validation de la structure..."
	@python3 validate_docker_structure.py

build: validate ## Construit l'image Docker
	@echo "🔨 Construction de l'image Docker..."
	docker build -t $(IMAGE_NAME) .
	@echo "✅ Image construite avec succès!"

run: ## Lance le bot avec docker-compose
	@echo "🚀 Lancement du bot..."
	@if [ ! -f .env ]; then \
		echo "❌ Fichier .env manquant!"; \
		echo "💡 Copiez .env.example vers .env et configurez vos variables"; \
		exit 1; \
	fi
	docker-compose up -d
	@echo "✅ Bot démarré en arrière-plan"

stop: ## Arrête le bot
	@echo "⏹️  Arrêt du bot..."
	docker-compose down
	@echo "✅ Bot arrêté"

restart: stop run ## Redémarre le bot

logs: ## Affiche les logs du bot
	@echo "📝 Logs du bot (Ctrl+C pour quitter):"
	docker-compose logs -f

logs-tail: ## Affiche les derniers logs
	@echo "📝 Derniers logs:"
	docker-compose logs --tail=50

status: ## Affiche le statut du conteneur
	@echo "📊 Statut du conteneur:"
	@docker ps -a --filter="name=$(CONTAINER_NAME)" --format="table {{.Names}}\t{{.Status}}\t{{.Ports}}"

clean: ## Nettoie les conteneurs et images
	@echo "🧹 Nettoyage..."
	docker-compose down --volumes --remove-orphans
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
	@echo "✅ Nettoyage terminé"

test-docker: build ## Teste l'image Docker localement
	@echo "🧪 Test de l'image Docker..."
	@if [ ! -f .env ]; then \
		echo "❌ Fichier .env manquant pour les tests!"; \
		echo "💡 Copiez .env.example vers .env et configurez vos variables"; \
		exit 1; \
	fi
	docker run --rm --env-file .env $(IMAGE_NAME) python -c "print('✅ Import test passed'); import bot"

shell: ## Lance un shell dans le conteneur
	@echo "🐚 Ouverture d'un shell dans le conteneur..."
	docker run --rm -it --env-file .env -v $(PWD)/data:/app/data $(IMAGE_NAME) /bin/bash

setup: ## Configuration initiale (copie .env.example)
	@if [ ! -f .env ]; then \
		echo "📝 Création du fichier .env..."; \
		cp .env.example .env; \
		echo "✅ Fichier .env créé!"; \
		echo "💡 Editez le fichier .env avec vos configurations"; \
	else \
		echo "ℹ️  Le fichier .env existe déjà"; \
	fi

# Commandes Docker directes
docker-build: ## Build Docker sans validation
	docker build -t $(IMAGE_NAME) .

docker-run: ## Lance le conteneur directement (sans compose)
	docker run -d --name $(CONTAINER_NAME) --env-file .env -v $(PWD)/data:/app/data $(IMAGE_NAME)

docker-stop: ## Arrête le conteneur direct
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true

# Commandes de développement
dev-install: ## Installe les dépendances pour le développement local
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

dev-test: ## Lance les tests localement
	python3 -m pytest tests/ -v

# Maintenance
backup-data: ## Sauvegarde les données
	@echo "💾 Sauvegarde des données..."
	@mkdir -p backups
	@tar -czf backups/data-backup-$(shell date +%Y%m%d-%H%M%S).tar.gz data/
	@echo "✅ Sauvegarde créée dans backups/"

# Default target
.DEFAULT_GOAL := help