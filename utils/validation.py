"""
Input validation utilities for Discord Reminder Bot.

This module provides comprehensive validation functions for user inputs,
configuration settings, and Discord-specific data types.
"""

import os
import logging
from typing import Optional, Tuple, Union, List
import discord
from discord.ext import commands

from utils.message_parser import parse_message_link, MessageLinkInfo

# Get logger for this module
logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Custom exception for validation errors with user-friendly messages."""
    
    def __init__(self, message: str, technical_reason: Optional[str] = None):
        self.message = message
        self.technical_reason = technical_reason
        super().__init__(message)


def validate_message_id(message_id: Union[int, str]) -> bool:
    """
    Valide qu'un message_id Discord est dans les limites acceptables.
    
    Discord utilise des Snowflakes (entiers 64-bit) pour les IDs.
    Les limites sont basées sur l'époque Discord et les contraintes techniques.
    
    Args:
        message_id: L'ID du message à valider (int ou str)
        
    Returns:
        bool: True si l'ID est valide, False sinon
        
    Raises:
        ValidationError: Si l'ID est invalide avec un message descriptif
    """
    try:
        # Convertir en entier si c'est une chaîne
        if isinstance(message_id, str):
            message_id = int(message_id)
        
        # Discord Snowflake: 64-bit integer avec des limites spécifiques
        # Premier message Discord possible (approximativement)
        MIN_SNOWFLAKE = 4194304
        # Maximum 64-bit signé pour éviter les débordements
        MAX_SNOWFLAKE = (1 << 63) - 1
        
        if not isinstance(message_id, int):
            raise ValidationError(
                "❌ L'ID du message doit être un nombre entier",
                f"Type reçu: {type(message_id)}"
            )
        
        if message_id <= 0:
            raise ValidationError(
                "❌ L'ID du message doit être un nombre positif",
                f"Valeur reçue: {message_id}"
            )
        
        if message_id < MIN_SNOWFLAKE:
            raise ValidationError(
                "❌ L'ID du message est trop petit pour être un ID Discord valide",
                f"Minimum: {MIN_SNOWFLAKE}, reçu: {message_id}"
            )
        
        if message_id > MAX_SNOWFLAKE:
            raise ValidationError(
                "❌ L'ID du message dépasse la limite maximale Discord",
                f"Maximum: {MAX_SNOWFLAKE}, reçu: {message_id}"
            )
        
        logger.debug(f"Message ID {message_id} validation passed")
        return True
        
    except ValueError as e:
        raise ValidationError(
            "❌ L'ID du message doit être un nombre valide",
            f"Erreur de conversion: {str(e)}"
        ) from e


def _validate_all_message_ids(link_info: MessageLinkInfo) -> None:
    """
    Valide tous les IDs d'un MessageLinkInfo en une seule fois pour éviter la redondance.
    
    Args:
        link_info: Informations du lien contenant les IDs à valider
        
    Raises:
        ValidationError: Si un des IDs est invalide
    """
    validate_message_id(link_info.guild_id)
    validate_message_id(link_info.channel_id)
    validate_message_id(link_info.message_id)


def _validate_role_characters(role: str) -> None:
    """
    Valide les caractères d'un nom de rôle pour éviter la duplication de code.
    
    Args:
        role: Nom du rôle à valider
        
    Raises:
        ValidationError: Si le rôle contient des caractères interdits
    """
    forbidden_chars = ['@', '#', ':', '```', '\n', '\r']
    for char in forbidden_chars:
        if char in role:
            raise ValidationError(f"Le rôle '{role}' contient des caractères interdits: '{char}'")


async def validate_message_link(
    bot: commands.Bot, 
    link: str, 
    user: discord.User,
    require_permissions: bool = True
) -> MessageLinkInfo:
    """
    Valide un lien de message et les permissions utilisateur.
    
    Args:
        bot: Instance du bot Discord
        link: Lien du message à valider
        user: Utilisateur qui fait la demande
        require_permissions: Si True, vérifie les permissions utilisateur
        
    Returns:
        MessageLinkInfo: Informations du lien validé
        
    Raises:
        ValidationError: Si la validation échoue avec message descriptif
    """
    # Parser le lien pour extraire les IDs
    link_info = parse_message_link(link)
    if not link_info:
        raise ValidationError("Format de lien invalide. Utilisez un lien Discord valide.")
    
    # Valider tous les IDs en une fois pour éviter la redondance
    _validate_all_message_ids(link_info)
        
    # Vérifier l'accès au serveur
    guild = bot.get_guild(link_info.guild_id)
    if not guild:
        raise ValidationError("Serveur introuvable ou bot non présent sur ce serveur")
        
    # Vérifier l'accès au canal
    channel = guild.get_channel(link_info.channel_id)
    if not channel:
        raise ValidationError("Canal introuvable ou supprimé")
        
    if not isinstance(channel, discord.TextChannel):
        raise ValidationError("Le canal doit être un canal textuel")
    
    # Vérifier les permissions utilisateur (si requises) - éviter répétition de get_member
    if require_permissions:
        member = guild.get_member(user.id)
        if not member:
            raise ValidationError("Vous n'avez pas accès à ce serveur")
        
        permissions = channel.permissions_for(member)
        if not permissions.view_channel:
            raise ValidationError("Vous n'avez pas la permission de voir ce canal")
        if not permissions.read_message_history:
            raise ValidationError("Vous n'avez pas la permission de lire l'historique de ce canal")
        
    # Vérifier l'existence du message avec gestion d'erreurs spécifiques
    try:
        message = await channel.fetch_message(link_info.message_id)
        if not message:
            raise ValidationError("Message introuvable (peut-être supprimé)")
    except discord.NotFound:
        raise ValidationError("Message introuvable (peut-être supprimé)")
    except discord.Forbidden:
        raise ValidationError("Permissions insuffisantes pour accéder au message")
    except discord.HTTPException as e:
        logger.error(f"HTTP error fetching message {link_info.message_id}: {e}")
        raise ValidationError(
            "Erreur lors de la récupération du message",
            f"HTTP error: {str(e)}"
        )
    
    logger.debug(f"Message link validation passed for {link}")
    return link_info


def validate_interval_minutes(interval: Union[int, str, float], test_mode: bool = False) -> int:
    """
    Valide et ajuste un intervalle de rappel en minutes.
    
    Args:
        interval: Intervalle en minutes à valider
        test_mode: Si True, utilise des limites plus flexibles pour les tests
        
    Returns:
        int: Intervalle validé et ajusté si nécessaire
        
    Raises:
        ValidationError: Si l'intervalle est complètement invalide
    """
    try:
        # Convertir en nombre
        if isinstance(interval, str):
            interval = float(interval)
        interval = int(interval)
        
        # Définir les limites selon le mode
        if test_mode:
            min_interval = 1      # 1 minute minimum en test
            max_interval = 10080  # 1 semaine maximum en test
        else:
            min_interval = 5      # 5 minutes minimum en production
            max_interval = 1440   # 24 heures maximum en production
        
        if interval < 0:
            raise ValidationError(
                "❌ L'intervalle ne peut pas être négatif",
                f"Valeur reçue: {interval}"
            )
        
        # Ajuster silencieusement dans les limites
        original_interval = interval
        interval = max(min_interval, min(max_interval, interval))
        
        if interval != original_interval:
            logger.info(f"Interval adjusted from {original_interval} to {interval} minutes")
        
        return interval
        
    except (ValueError, TypeError) as e:
        raise ValidationError(
            "❌ L'intervalle doit être un nombre valide",
            f"Erreur de conversion: {str(e)}"
        ) from e


def validate_environment_config() -> List[str]:
    """
    Valide les variables d'environnement au démarrage.
    
    Returns:
        List[str]: Liste des erreurs trouvées (vide si tout est valide)
    """
    errors = []
    
    # Valider DISCORD_TOKEN
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        errors.append("DISCORD_TOKEN est obligatoire")
    elif len(token.strip()) < 50:  # Les tokens Discord font généralement ~59+ caractères
        errors.append("DISCORD_TOKEN semble trop court (token invalide?)")
    
    # Valider REMINDER_INTERVAL_HOURS
    try:
        interval_hours = float(os.getenv('REMINDER_INTERVAL_HOURS', '24'))
        if interval_hours <= 0:
            errors.append("REMINDER_INTERVAL_HOURS doit être positif")
        elif interval_hours > 8760:  # Plus d'un an
            errors.append("REMINDER_INTERVAL_HOURS ne peut pas dépasser 8760 heures (1 an)")
    except (ValueError, TypeError):
        errors.append("REMINDER_INTERVAL_HOURS doit être un nombre")
    
    # Valider ADMIN_ROLES en utilisant la fonction dédiée pour éviter duplication
    admin_roles_str = os.getenv('ADMIN_ROLES', '')
    if not admin_roles_str.strip():
        errors.append("ADMIN_ROLES ne peut pas être vide")
    else:
        admin_roles = [role.strip() for role in admin_roles_str.split(',')]
        try:
            validate_admin_roles_list(admin_roles)
        except ValidationError as e:
            errors.append(f"ADMIN_ROLES invalide: {e.message}")
    
    # Valider USE_SEPARATE_REMINDER_CHANNEL
    separate_channel = os.getenv('USE_SEPARATE_REMINDER_CHANNEL', 'false').lower()
    if separate_channel not in ['true', 'false']:
        errors.append("USE_SEPARATE_REMINDER_CHANNEL doit être 'true' ou 'false'")
    
    # Valider REMINDER_CHANNEL_NAME si canal séparé activé
    if separate_channel == 'true':
        channel_name = os.getenv('REMINDER_CHANNEL_NAME', 'rappels')
        if not channel_name.strip():
            errors.append("REMINDER_CHANNEL_NAME ne peut pas être vide si USE_SEPARATE_REMINDER_CHANNEL=true")
        elif len(channel_name) > 100:
            errors.append("REMINDER_CHANNEL_NAME trop long (max 100 caractères)")
        elif channel_name.startswith('#'):
            errors.append("REMINDER_CHANNEL_NAME ne doit pas commencer par '#'")
    
    # Valider LOG_LEVEL
    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
    if log_level not in valid_levels:
        errors.append(f"LOG_LEVEL invalide. Valeurs autorisées: {', '.join(valid_levels)}")
    
    # Valider TEST_MODE
    test_mode = os.getenv('TEST_MODE', 'false').lower()
    if test_mode not in ['true', 'false']:
        errors.append("TEST_MODE doit être 'true' ou 'false'")
    
    if errors:
        logger.error(f"Configuration validation failed: {len(errors)} error(s)")
        for error in errors:
            logger.error(f"  - {error}")
    else:
        logger.info("Environment configuration validation passed")
    
    return errors


def validate_admin_roles_list(roles: List[str]) -> None:
    """
    Valide une liste de rôles administrateurs.
    
    Args:
        roles: Liste des noms de rôles à valider
        
    Raises:
        ValidationError: Si la validation échoue avec message descriptif
    """
    if not roles:
        raise ValidationError("La liste des rôles admin ne peut pas être vide")
    
    for role in roles:
        if not isinstance(role, str):
            raise ValidationError(f"Le rôle doit être une chaîne de caractères: {role}")
        
        role = role.strip()
        if not role:
            raise ValidationError("Les rôles admin ne peuvent pas être vides")
        
        if len(role) > 100:
            raise ValidationError(f"Le rôle '{role}' est trop long (max 100 caractères)")
        
        # Utiliser la fonction commune pour éviter la duplication
        _validate_role_characters(role)


def get_validation_error_embed(error: ValidationError, title: str = "Erreur de validation") -> discord.Embed:
    """
    Crée un embed Discord pour une erreur de validation.
    
    Args:
        error: L'erreur de validation
        title: Titre de l'embed
        
    Returns:
        discord.Embed: Embed formaté pour l'erreur
    """
    embed = discord.Embed(
        title=title,
        description=error.message,
        color=discord.Color.red()
    )
    
    if error.technical_reason and os.getenv('LOG_LEVEL', 'INFO').upper() == 'DEBUG':
        embed.add_field(
            name="🔧 Détail technique (mode debug)",
            value=error.technical_reason,
            inline=False
        )
    
    embed.add_field(
        name="💡 Aide",
        value="Si le problème persiste, contactez un administrateur du bot.",
        inline=False
    )
    
    return embed


# Fonctions de commodité pour les types Discord spécifiques
def is_valid_discord_snowflake(snowflake: Union[int, str]) -> bool:
    """
    Vérifie rapidement si un ID ressemble à un snowflake Discord valide.
    
    Args:
        snowflake: L'ID à vérifier
        
    Returns:
        bool: True si l'ID semble valide
    """
    try:
        validate_message_id(snowflake)
        return True
    except ValidationError:
        return False


def safe_int_conversion(value: Union[str, int], field_name: str) -> int:
    """
    Convertit une valeur en entier de manière sécurisée avec un message d'erreur explicite.
    
    Args:
        value: Valeur à convertir
        field_name: Nom du champ pour le message d'erreur
        
    Returns:
        int: Valeur convertie
        
    Raises:
        ValidationError: Si la conversion échoue
    """
    try:
        return int(value)
    except (ValueError, TypeError) as e:
        raise ValidationError(
            f"❌ {field_name} doit être un nombre entier valide",
            f"Valeur reçue: {value}, type: {type(value)}, erreur: {str(e)}"
        ) from e