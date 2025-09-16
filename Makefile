# Discord Reminder Bot - Unified Makefile
# =======================================

.PHONY: help install build test deploy status logs clean

# Default target
.DEFAULT_GOAL := help

# Variables
CONTAINER_NAME := discord-reminder-bot
IMAGE_NAME := discord-reminder-bot

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m

help: ## Afficher l'aide
	@echo "$(GREEN)Discord Reminder Bot - Commandes essentielles$(NC)"
	@echo "=================================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'

# Development commands
install: ## Installer les dépendances
	@echo "$(GREEN)Installation des dépendances...$(NC)"
	yarn install --frozen-lockfile

build: ## Builder le projet
	@echo "$(GREEN)Build du projet...$(NC)"
	yarn build

test: ## Exécuter les tests
	@echo "$(GREEN)Exécution des tests...$(NC)"
	yarn test:coverage

quality: ## Vérifier la qualité du code
	@echo "$(GREEN)Vérification qualité...$(NC)"
	yarn quality

# Docker commands (unified deployment)
deploy: ## Déploiement Docker complet
	@echo "$(GREEN)Déploiement Docker...$(NC)"
	./scripts/deploy.sh

start: ## Démarrer les services Docker
	@echo "$(GREEN)Démarrage des services...$(NC)"
	docker-compose up -d

stop: ## Arrêter les services Docker
	@echo "$(YELLOW)Arrêt des services...$(NC)"
	docker-compose down

restart: ## Redémarrer les services
	@echo "$(GREEN)Redémarrage...$(NC)"
	docker-compose restart

rebuild: ## Rebuild et redéployer
	@echo "$(GREEN)Rebuild complet...$(NC)"
	make backup && docker-compose up --build -d


# Monitoring commands
monitor: ## Check de santé
	@echo "$(GREEN)Vérification de santé...$(NC)"
	./scripts/monitor.sh --check

# Backup & Rollback
backup: ## Créer une sauvegarde
	@echo "$(GREEN)Création d'une sauvegarde...$(NC)"
	@mkdir -p backups/backup_$(shell date +%Y%m%d_%H%M%S)
	@if [ -d "data" ]; then cp -r data backups/backup_$(shell date +%Y%m%d_%H%M%S)/; fi
	@if [ -d "logs" ]; then cp -r logs backups/backup_$(shell date +%Y%m%d_%H%M%S)/; fi
	@echo "$(GREEN)Sauvegarde créée$(NC)"

rollback: ## Rollback rapide
	@echo "$(RED)Rollback...$(NC)"
	./scripts/rollback.sh --quick

# Maintenance
clean: ## Nettoyer les fichiers temporaires
	@echo "$(YELLOW)Nettoyage...$(NC)"
	@rm -rf dist/ node_modules/.cache/
	@docker images $(IMAGE_NAME) --format "table {{.Repository}}:{{.Tag}}" | tail -n +4 | xargs -r docker rmi 2>/dev/null || true
	@find backups/ -name "backup_*" -type d | sort -r | tail -n +11 | xargs -r rm -rf 2>/dev/null || true
	@echo "$(GREEN)Nettoyage terminé$(NC)"

logs: ## Voir les logs Docker
	@echo "$(GREEN)Logs Docker...$(NC)"
	docker-compose logs -f $(CONTAINER_NAME)

status: ## Statut du système
	@echo "$(GREEN)=== Statut Docker ===$(NC)"
	@docker ps --filter name=$(CONTAINER_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "$(YELLOW)Espace disque:$(NC)"
	@df -h . | tail -1

# Production deployment
prod-deploy: quality deploy ## Pipeline complète: tests + build + deploy
	@echo "$(GREEN)Déploiement production terminé!$(NC)"

# Database commands
db-migrate: ## Migrer la base de données
	@echo "$(GREEN)Migration de la base...$(NC)"
	docker compose --profile migration up db-migration

db-check: ## Vérifier l'intégrité de la base
	@echo "$(GREEN)Vérification de la base...$(NC)"
	docker exec $(CONTAINER_NAME) node -e "console.log('DB OK')" || echo "$(RED)Problème DB$(NC)"
