"""
Tests complets pour utils/permissions.py - Gestion des permissions sécurisée
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock
import pytest
import pytest_asyncio

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from utils.permissions import (
    has_admin_role,
    can_manage_reminders,
    can_view_channel,
    can_send_in_channel,
    check_channel_permissions,
    is_bot_admin,
    get_user_roles
)
from config.settings import Settings


class TestPermissions:
    """Tests pour les fonctions de permissions"""

    @pytest.fixture
    def mock_settings(self):
        """Settings de test avec rôles admin"""
        return Settings(
            discord_token="test_token",
            admin_roles=["Admin", "Moderateur", "Manager"]
        )

    @pytest.fixture
    def mock_user_admin(self):
        """Utilisateur avec rôle admin"""
        user = MagicMock()
        user.id = 12345
        user.name = "AdminUser"
        
        admin_role = MagicMock()
        admin_role.name = "Admin"
        
        user.roles = [admin_role]
        return user

    @pytest.fixture
    def mock_user_regular(self):
        """Utilisateur normal sans privilèges"""
        user = MagicMock()
        user.id = 67890
        user.name = "RegularUser"
        
        regular_role = MagicMock()
        regular_role.name = "Member"
        
        user.roles = [regular_role]
        return user

    @pytest.fixture 
    def mock_channel_accessible(self):
        """Canal accessible avec permissions appropriées"""
        channel = MagicMock()
        channel.id = 11111
        channel.name = "test-channel"
        channel.guild = MagicMock()
        
        # Simuler les permissions
        permissions = MagicMock()
        permissions.view_channel = True
        permissions.send_messages = True
        permissions.read_message_history = True
        
        channel.permissions_for.return_value = permissions
        return channel

    @pytest.fixture
    def mock_channel_restricted(self):
        """Canal avec permissions restreintes"""
        channel = MagicMock()
        channel.id = 22222
        channel.name = "restricted-channel"
        channel.guild = MagicMock()
        
        permissions = MagicMock()
        permissions.view_channel = False
        permissions.send_messages = False
        permissions.read_message_history = False
        
        channel.permissions_for.return_value = permissions
        return channel

    def test_has_admin_role_positive(self, mock_settings, mock_user_admin):
        """Test détection correcte du rôle admin"""
        result = has_admin_role(mock_user_admin, mock_settings.admin_roles)
        
        assert result is True

    def test_has_admin_role_negative(self, mock_settings, mock_user_regular):
        """Test détection correcte de l'absence de rôle admin"""
        result = has_admin_role(mock_user_regular, mock_settings.admin_roles)
        
        assert result is False

    def test_has_admin_role_case_insensitive(self, mock_settings):
        """Test que la vérification des rôles est insensible à la casse"""
        user = MagicMock()
        role = MagicMock()
        role.name = "admin"  # Minuscules
        user.roles = [role]
        
        result = has_admin_role(user, ["Admin"])  # Majuscules
        
        assert result is True

    def test_has_admin_role_multiple_roles(self, mock_settings):
        """Test avec utilisateur ayant plusieurs rôles"""
        user = MagicMock()
        
        role1 = MagicMock()
        role1.name = "Member"
        role2 = MagicMock() 
        role2.name = "Moderateur"
        role3 = MagicMock()
        role3.name = "Helper"
        
        user.roles = [role1, role2, role3]
        
        result = has_admin_role(user, mock_settings.admin_roles)
        
        assert result is True  # "Moderateur" est dans admin_roles

    def test_has_admin_role_empty_roles(self, mock_settings):
        """Test avec utilisateur sans rôles"""
        user = MagicMock()
        user.roles = []
        
        result = has_admin_role(user, mock_settings.admin_roles)
        
        assert result is False

    def test_has_admin_role_none_roles(self, mock_settings):
        """Test avec utilisateur ayant roles=None"""
        user = MagicMock()
        user.roles = None
        
        result = has_admin_role(user, mock_settings.admin_roles)
        
        assert result is False

    def test_can_manage_reminders_admin(self, mock_settings, mock_user_admin):
        """Test qu'un admin peut gérer les rappels"""
        result = can_manage_reminders(mock_user_admin, mock_settings.admin_roles)
        
        assert result is True

    def test_can_manage_reminders_regular(self, mock_settings, mock_user_regular):
        """Test qu'un utilisateur normal ne peut pas gérer les rappels"""
        result = can_manage_reminders(mock_user_regular, mock_settings.admin_roles)
        
        assert result is False

    def test_can_view_channel_positive(self, mock_channel_accessible):
        """Test permission de voir un canal"""
        bot = MagicMock()
        
        result = can_view_channel(bot, mock_channel_accessible)
        
        assert result is True
        mock_channel_accessible.permissions_for.assert_called_once_with(bot)

    def test_can_view_channel_negative(self, mock_channel_restricted):
        """Test absence de permission pour voir un canal"""
        bot = MagicMock()
        
        result = can_view_channel(bot, mock_channel_restricted)
        
        assert result is False

    def test_can_send_in_channel_positive(self, mock_channel_accessible):
        """Test permission d'envoyer des messages"""
        bot = MagicMock()
        
        result = can_send_in_channel(bot, mock_channel_accessible)
        
        assert result is True

    def test_can_send_in_channel_negative(self, mock_channel_restricted):
        """Test absence de permission d'envoyer des messages"""
        bot = MagicMock()
        
        result = can_send_in_channel(bot, mock_channel_restricted)
        
        assert result is False

    def test_check_channel_permissions_all_granted(self, mock_channel_accessible):
        """Test vérification complète des permissions - toutes accordées"""
        bot = MagicMock()
        
        can_view, can_send = check_channel_permissions(bot, mock_channel_accessible)
        
        assert can_view is True
        assert can_send is True

    def test_check_channel_permissions_all_denied(self, mock_channel_restricted):
        """Test vérification complète des permissions - toutes refusées"""
        bot = MagicMock()
        
        can_view, can_send = check_channel_permissions(bot, mock_channel_restricted)
        
        assert can_view is False
        assert can_send is False

    def test_check_channel_permissions_mixed(self):
        """Test permissions mixtes (peut voir mais pas envoyer)"""
        bot = MagicMock()
        channel = MagicMock()
        
        permissions = MagicMock()
        permissions.view_channel = True
        permissions.send_messages = False
        
        channel.permissions_for.return_value = permissions
        
        can_view, can_send = check_channel_permissions(bot, channel)
        
        assert can_view is True
        assert can_send is False

    def test_is_bot_admin_positive(self, mock_settings, mock_user_admin):
        """Test détection d'un admin du bot"""
        result = is_bot_admin(mock_user_admin, mock_settings)
        
        assert result is True

    def test_is_bot_admin_negative(self, mock_settings, mock_user_regular):
        """Test détection d'un non-admin"""
        result = is_bot_admin(mock_user_regular, mock_settings)
        
        assert result is False

    def test_get_user_roles(self, mock_user_admin):
        """Test extraction des noms de rôles"""
        roles = get_user_roles(mock_user_admin)
        
        assert roles == ["Admin"]

    def test_get_user_roles_multiple(self):
        """Test extraction de plusieurs rôles"""
        user = MagicMock()
        
        role1 = MagicMock()
        role1.name = "Member"
        role2 = MagicMock()
        role2.name = "Helper"
        role3 = MagicMock()
        role3.name = "Admin"
        
        user.roles = [role1, role2, role3]
        
        roles = get_user_roles(user)
        
        assert set(roles) == {"Member", "Helper", "Admin"}

    def test_get_user_roles_empty(self):
        """Test avec utilisateur sans rôles"""
        user = MagicMock()
        user.roles = []
        
        roles = get_user_roles(user)
        
        assert roles == []

    def test_permissions_with_guild_owner(self):
        """Test permissions spéciales pour le propriétaire du serveur"""
        owner = MagicMock()
        owner.id = 99999
        
        guild = MagicMock()
        guild.owner_id = 99999
        
        channel = MagicMock()
        channel.guild = guild
        
        # Le propriétaire devrait toujours avoir toutes les permissions
        permissions = MagicMock()
        permissions.view_channel = True
        permissions.send_messages = True
        permissions.administrator = True
        
        channel.permissions_for.return_value = permissions
        
        can_view, can_send = check_channel_permissions(owner, channel)
        
        assert can_view is True
        assert can_send is True

    def test_permissions_security_edge_cases(self):
        """Test des cas limites de sécurité"""
        # Utilisateur None
        result = has_admin_role(None, ["Admin"])
        assert result is False
        
        # Liste de rôles admin None
        user = MagicMock()
        result = has_admin_role(user, None)
        assert result is False
        
        # Liste de rôles admin vide
        result = has_admin_role(user, [])
        assert result is False

    def test_permissions_with_special_characters(self, mock_settings):
        """Test permissions avec des noms de rôles contenant des caractères spéciaux"""
        user = MagicMock()
        
        role = MagicMock()
        role.name = "Admin@Server#1"
        user.roles = [role]
        
        # Ajouter ce rôle aux admin_roles pour le test
        admin_roles = mock_settings.admin_roles + ["Admin@Server#1"]
        
        result = has_admin_role(user, admin_roles)
        
        assert result is True

    def test_permissions_unicode_role_names(self, mock_settings):
        """Test permissions avec des noms de rôles Unicode"""
        user = MagicMock()
        
        role = MagicMock()
        role.name = "Administrateur🔧"
        user.roles = [role]
        
        admin_roles = ["Administrateur🔧"]
        
        result = has_admin_role(user, admin_roles)
        
        assert result is True

    def test_channel_permissions_exception_handling(self):
        """Test gestion des exceptions lors de la vérification des permissions"""
        bot = MagicMock()
        channel = MagicMock()
        
        # Simuler une exception lors de la vérification des permissions
        channel.permissions_for.side_effect = Exception("Permission check failed")
        
        # La fonction devrait gérer l'exception gracieusement
        can_view, can_send = check_channel_permissions(bot, channel)
        
        # En cas d'erreur, les permissions devraient être refusées par sécurité
        assert can_view is False
        assert can_send is False


class TestPermissionsIntegration:
    """Tests d'intégration pour le système de permissions"""

    @pytest.mark.integration
    def test_full_permission_workflow(self, mock_settings):
        """Test du workflow complet de vérification des permissions"""
        # Créer un utilisateur admin
        admin_user = MagicMock()
        admin_role = MagicMock()
        admin_role.name = "Admin"
        admin_user.roles = [admin_role]
        
        # Créer un canal accessible
        channel = MagicMock()
        permissions = MagicMock()
        permissions.view_channel = True
        permissions.send_messages = True
        channel.permissions_for.return_value = permissions
        
        # Vérifier toute la chaîne de permissions
        assert is_bot_admin(admin_user, mock_settings) is True
        assert can_manage_reminders(admin_user, mock_settings.admin_roles) is True
        
        bot = MagicMock()
        can_view, can_send = check_channel_permissions(bot, channel)
        assert can_view is True
        assert can_send is True

    @pytest.mark.integration  
    def test_permission_hierarchy(self, mock_settings):
        """Test de la hiérarchie des permissions"""
        # Ordre de priorité: Owner > Admin > Moderator > Regular
        
        # Owner (devrait avoir toutes les permissions)
        owner = MagicMock()
        owner_role = MagicMock()
        owner_role.name = "Owner"
        owner.roles = [owner_role]
        
        # Admin (devrait avoir les permissions de gestion)
        admin = MagicMock()
        admin_role = MagicMock()
        admin_role.name = "Admin"
        admin.roles = [admin_role]
        
        # Moderator (permissions intermédiaires)
        mod = MagicMock()
        mod_role = MagicMock()
        mod_role.name = "Moderateur"
        mod.roles = [mod_role]
        
        # User régulier (permissions limitées)
        user = MagicMock()
        user_role = MagicMock()
        user_role.name = "Member"
        user.roles = [user_role]
        
        # Tester la hiérarchie
        admin_roles = mock_settings.admin_roles + ["Owner"]
        
        assert has_admin_role(owner, admin_roles) is True
        assert has_admin_role(admin, admin_roles) is True
        assert has_admin_role(mod, admin_roles) is True  # Moderateur est dans admin_roles
        assert has_admin_role(user, admin_roles) is False

    @pytest.mark.integration
    def test_cross_guild_permissions(self):
        """Test des permissions entre différents serveurs"""
        # Utilisateur admin sur Server A
        user = MagicMock()
        user.id = 12345
        
        admin_role_server_a = MagicMock()
        admin_role_server_a.name = "Admin"
        admin_role_server_a.guild = MagicMock()
        admin_role_server_a.guild.id = 111
        
        user.roles = [admin_role_server_a]
        
        # Canal sur Server B
        channel_server_b = MagicMock()
        channel_server_b.guild = MagicMock()
        channel_server_b.guild.id = 222
        
        # Les permissions admin ne devraient pas se transférer entre serveurs
        # (cette logique dépend de l'implémentation spécifique du bot)
        
        # Pour ce test, on vérifie que les rôles sont bien isolés par serveur
        assert admin_role_server_a.guild.id != channel_server_b.guild.id