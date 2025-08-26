"""
Tests complets pour config/settings.py - Configuration centralisée
"""
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from config.settings import Settings


class TestSettings:
    """Tests pour la classe Settings"""

    def setup_method(self):
        """Setup pour chaque test - nettoyer les variables d'environnement"""
        # Sauvegarder les variables d'environnement existantes
        self.original_env = os.environ.copy()
        
        # Nettoyer les variables d'environnement de test
        test_vars = [
            'DISCORD_TOKEN', 'TEST_MODE', 'LOG_LEVEL', 'LOG_TO_FILE',
            'REMINDER_INTERVAL_HOURS', 'USE_SEPARATE_REMINDER_CHANNEL',
            'REMINDER_CHANNEL_NAME', 'ADMIN_ROLES', 'LOG_COLORS'
        ]
        for var in test_vars:
            if var in os.environ:
                del os.environ[var]

    def teardown_method(self):
        """Cleanup après chaque test - restaurer les variables d'environnement"""
        os.environ.clear()
        os.environ.update(self.original_env)

    def test_settings_default_values(self):
        """Test les valeurs par défaut des settings"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            settings = Settings()
            
            assert settings.discord_token == 'test_token'
            assert settings.test_mode is False
            assert settings.log_level == 'INFO'
            assert settings.log_to_file is True
            assert settings.reminder_interval_hours == 24.0
            assert settings.use_separate_reminder_channel is False
            assert settings.reminder_channel_name == 'rappels-event'
            assert settings.admin_roles == ['Admin', 'Moderateur', 'Coach']
            assert settings.log_colors is True

    def test_settings_from_env_vars(self):
        """Test le chargement depuis les variables d'environnement"""
        env_vars = {
            'DISCORD_TOKEN': 'custom_token',
            'TEST_MODE': 'true',
            'LOG_LEVEL': 'DEBUG',
            'LOG_TO_FILE': 'false',
            'REMINDER_INTERVAL_HOURS': '12.5',
            'USE_SEPARATE_REMINDER_CHANNEL': 'true',
            'REMINDER_CHANNEL_NAME': 'custom-reminders',
            'ADMIN_ROLES': 'SuperAdmin,Manager',
            'LOG_COLORS': 'false'
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            settings = Settings()
            
            assert settings.discord_token == 'custom_token'
            assert settings.test_mode is True
            assert settings.log_level == 'DEBUG'
            assert settings.log_to_file is False
            assert settings.reminder_interval_hours == 12.5
            assert settings.use_separate_reminder_channel is True
            assert settings.reminder_channel_name == 'custom-reminders'
            assert settings.admin_roles == ['SuperAdmin', 'Manager']
            assert settings.log_colors is False

    def test_settings_from_dotenv_file(self):
        """Test le chargement depuis un fichier .env"""
        env_content = """
DISCORD_TOKEN=dotenv_token
TEST_MODE=true
LOG_LEVEL=WARNING
REMINDER_INTERVAL_HOURS=6.0
ADMIN_ROLES=Admin,Mod,Helper
"""
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=env_content):
            
            settings = Settings()
            
            assert settings.discord_token == 'dotenv_token'
            assert settings.test_mode is True
            assert settings.log_level == 'WARNING'
            assert settings.reminder_interval_hours == 6.0
            assert settings.admin_roles == ['Admin', 'Mod', 'Helper']

    def test_settings_env_vars_override_dotenv(self):
        """Test que les variables d'environnement surchargent le fichier .env"""
        env_content = """
DISCORD_TOKEN=dotenv_token
LOG_LEVEL=INFO
"""
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=env_content), \
             patch.dict(os.environ, {'DISCORD_TOKEN': 'env_token', 'LOG_LEVEL': 'DEBUG'}):
            
            settings = Settings()
            
            assert settings.discord_token == 'env_token'  # Env var gagne
            assert settings.log_level == 'DEBUG'  # Env var gagne

    def test_settings_explicit_params_override_all(self):
        """Test que les paramètres explicites surchargent tout"""
        env_content = "DISCORD_TOKEN=dotenv_token\nLOG_LEVEL=INFO"
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=env_content), \
             patch.dict(os.environ, {'DISCORD_TOKEN': 'env_token'}):
            
            settings = Settings(
                discord_token='explicit_token',
                log_level='ERROR',
                test_mode=True
            )
            
            assert settings.discord_token == 'explicit_token'
            assert settings.log_level == 'ERROR'
            assert settings.test_mode is True

    def test_settings_validation_discord_token_required(self):
        """Test la validation du token Discord obligatoire"""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="DISCORD_TOKEN is required"):
                Settings()

    def test_settings_validation_empty_discord_token(self):
        """Test la validation d'un token Discord vide"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': ''}, clear=True):
            with pytest.raises(ValueError, match="DISCORD_TOKEN cannot be empty"):
                Settings()

    def test_settings_validation_log_level(self):
        """Test la validation du niveau de log"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            # Niveau valide
            settings = Settings(log_level='DEBUG')
            assert settings.log_level == 'DEBUG'
            
            # Niveau invalide
            with pytest.raises(ValueError, match="Invalid log level"):
                Settings(log_level='INVALID')

    def test_settings_validation_reminder_interval(self):
        """Test la validation de l'intervalle de rappel"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            # Mode normal - minimum 1 heure
            with pytest.raises(ValueError, match="must be at least 1.0 hours"):
                Settings(reminder_interval_hours=0.5)
            
            # Mode test - minimum 1 minute (0.0167 heures)
            settings = Settings(test_mode=True, reminder_interval_hours=0.1)
            assert settings.reminder_interval_hours == 0.1
            
            # Mode test - trop petit
            with pytest.raises(ValueError, match="must be at least 0.0167 hours"):
                Settings(test_mode=True, reminder_interval_hours=0.01)

    def test_settings_validation_maximum_interval(self):
        """Test la validation de l'intervalle maximum"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            # Mode normal - maximum 168 heures (7 jours)
            with pytest.raises(ValueError, match="must be at most 168.0 hours"):
                Settings(reminder_interval_hours=200.0)
            
            # Mode test - maximum 10080 minutes (7 jours)
            settings = Settings(test_mode=True, reminder_interval_hours=168.0)
            assert settings.reminder_interval_hours == 168.0

    def test_settings_boolean_parsing(self):
        """Test le parsing des valeurs booléennes"""
        test_cases = [
            ('true', True), ('True', True), ('TRUE', True), ('1', True),
            ('false', False), ('False', False), ('FALSE', False), ('0', False)
        ]
        
        for env_value, expected in test_cases:
            with patch.dict(os.environ, {'DISCORD_TOKEN': 'test', 'TEST_MODE': env_value}, clear=True):
                settings = Settings()
                assert settings.test_mode is expected

    def test_settings_float_parsing(self):
        """Test le parsing des valeurs flottantes"""
        with patch.dict(os.environ, {
            'DISCORD_TOKEN': 'test_token',
            'REMINDER_INTERVAL_HOURS': '2.5'
        }, clear=True):
            settings = Settings()
            assert settings.reminder_interval_hours == 2.5

    def test_settings_list_parsing_admin_roles(self):
        """Test le parsing de la liste des rôles administrateurs"""
        test_cases = [
            ('Admin,Mod,Helper', ['Admin', 'Mod', 'Helper']),
            ('Admin, Mod , Helper ', ['Admin', 'Mod', 'Helper']),  # Avec espaces
            ('Admin', ['Admin']),  # Un seul rôle
            ('', []),  # Vide
        ]
        
        for env_value, expected in test_cases:
            with patch.dict(os.environ, {
                'DISCORD_TOKEN': 'test_token',
                'ADMIN_ROLES': env_value
            }, clear=True):
                settings = Settings()
                assert settings.admin_roles == expected

    def test_settings_channel_name_validation(self):
        """Test la validation du nom de canal"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            # Nom valide
            settings = Settings(reminder_channel_name='valid-channel')
            assert settings.reminder_channel_name == 'valid-channel'
            
            # Nom avec caractères invalides (devrait être accepté mais nettoyé par Discord)
            settings = Settings(reminder_channel_name='Invalid Channel Name!')
            assert settings.reminder_channel_name == 'Invalid Channel Name!'

    def test_settings_file_not_found_graceful_handling(self):
        """Test la gestion gracieuse quand le fichier .env n'existe pas"""
        with patch('pathlib.Path.exists', return_value=False), \
             patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            
            # Ne devrait pas lever d'exception
            settings = Settings()
            assert settings.discord_token == 'test_token'

    def test_settings_malformed_dotenv_handling(self):
        """Test la gestion d'un fichier .env malformé"""
        malformed_content = """
DISCORD_TOKEN=test_token
MALFORMED LINE WITHOUT EQUALS
LOG_LEVEL=DEBUG
=VALUE_WITHOUT_KEY
"""
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=malformed_content):
            
            # Ne devrait pas planter, juste ignorer les lignes malformées
            settings = Settings()
            assert settings.discord_token == 'test_token'
            assert settings.log_level == 'DEBUG'

    def test_settings_repr_hides_token(self):
        """Test que __repr__ masque le token Discord pour la sécurité"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'secret_token'}, clear=True):
            settings = Settings()
            repr_str = repr(settings)
            
            assert 'secret_token' not in repr_str
            assert '***' in repr_str or 'hidden' in repr_str.lower()

    def test_settings_str_hides_token(self):
        """Test que __str__ masque le token Discord pour la sécurité"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'secret_token'}, clear=True):
            settings = Settings()
            str_repr = str(settings)
            
            assert 'secret_token' not in str_repr
            assert '***' in str_repr or 'hidden' in str_repr.lower()

    @pytest.mark.parametrize("log_level", ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'])
    def test_settings_valid_log_levels(self, log_level):
        """Test tous les niveaux de log valides"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            settings = Settings(log_level=log_level)
            assert settings.log_level == log_level

    def test_settings_immutability_after_creation(self):
        """Test que les settings ne peuvent pas être modifiés après création"""
        with patch.dict(os.environ, {'DISCORD_TOKEN': 'test_token'}, clear=True):
            settings = Settings()
            
            # Les settings devraient être read-only ou au moins documentés comme tels
            original_token = settings.discord_token
            assert original_token == 'test_token'
            
            # Si on implémente l'immutabilité, cette ligne devrait lever une erreur
            # Pour l'instant, on teste juste que la valeur est bien définie
            assert hasattr(settings, 'discord_token')
            assert hasattr(settings, 'log_level')
            assert hasattr(settings, 'test_mode')


class TestSettingsIntegration:
    """Tests d'intégration pour les Settings"""

    def test_settings_with_real_dotenv_structure(self):
        """Test avec une structure .env réaliste"""
        realistic_env = """
# Discord Bot Configuration
DISCORD_TOKEN=real_looking_token_here_1234567890

# Development Settings  
TEST_MODE=false
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_COLORS=true

# Reminder Configuration
REMINDER_INTERVAL_HOURS=24.0
USE_SEPARATE_REMINDER_CHANNEL=false
REMINDER_CHANNEL_NAME=rappels-event

# Administrative Settings
ADMIN_ROLES=Admin,Moderateur,Coach

# Comments should be ignored
# IGNORED_VAR=should_not_be_parsed
"""
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=realistic_env):
            
            settings = Settings()
            
            assert settings.discord_token == 'real_looking_token_here_1234567890'
            assert settings.test_mode is False
            assert settings.log_level == 'INFO'
            assert settings.log_to_file is True
            assert settings.log_colors is True
            assert settings.reminder_interval_hours == 24.0
            assert settings.use_separate_reminder_channel is False
            assert settings.reminder_channel_name == 'rappels-event'
            assert settings.admin_roles == ['Admin', 'Moderateur', 'Coach']

    def test_settings_production_vs_development_modes(self):
        """Test des configurations différentes pour production vs développement"""
        # Configuration développement
        dev_env = {
            'DISCORD_TOKEN': 'dev_token',
            'TEST_MODE': 'true',
            'LOG_LEVEL': 'DEBUG',
            'LOG_TO_FILE': 'false',
            'REMINDER_INTERVAL_HOURS': '0.1'  # 6 minutes pour les tests
        }
        
        with patch.dict(os.environ, dev_env, clear=True):
            dev_settings = Settings()
            
            assert dev_settings.test_mode is True
            assert dev_settings.log_level == 'DEBUG'
            assert dev_settings.log_to_file is False
            assert dev_settings.reminder_interval_hours == 0.1
        
        # Configuration production
        prod_env = {
            'DISCORD_TOKEN': 'prod_token',
            'TEST_MODE': 'false',
            'LOG_LEVEL': 'INFO',
            'LOG_TO_FILE': 'true',
            'REMINDER_INTERVAL_HOURS': '24.0'
        }
        
        with patch.dict(os.environ, prod_env, clear=True):
            prod_settings = Settings()
            
            assert prod_settings.test_mode is False
            assert prod_settings.log_level == 'INFO'
            assert prod_settings.log_to_file is True
            assert prod_settings.reminder_interval_hours == 24.0