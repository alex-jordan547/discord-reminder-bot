"""
Utilitaires partagés pour les commandes Discord.

Ce module contient des fonctions utilitaires partagées entre les différents
modules de commandes pour éviter les dépendances circulaires.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any

import discord
from discord.ext import commands

# Get logger for this module
logger = logging.getLogger(__name__)


async def sync_slash_commands_logic(bot: commands.Bot) -> List[discord.app_commands.AppCommand]:
    """
    Logique de synchronisation des commandes slash (utilisée par !sync et /sync).

    Args:
        bot: Le bot Discord

    Returns:
        List[discord.app_commands.AppCommand]: Liste des commandes synchronisées

    Raises:
        Exception: Si la synchronisation échoue
    """
    return await bot.tree.sync()


def create_health_embed(stats: Dict[str, Any]) -> discord.Embed:
    """
    Crée un embed Discord pour les statistiques de santé du bot.

    Args:
        stats: Dictionnaire contenant les statistiques de santé
                (résultat de retry_stats.get_summary())

    Returns:
        discord.Embed: Embed configuré avec les statistiques de santé
    """
    # Déterminer la couleur en fonction du taux de succès
    if stats['success_rate_percent'] >= 95:
        color = discord.Color.green()
        status_indicator = "🟢 Excellent"
    elif stats['success_rate_percent'] >= 80:
        color = discord.Color.orange()
        status_indicator = "🟡 Dégradé"
    else:
        color = discord.Color.red()
        status_indicator = "🔴 Critique"

    embed = discord.Embed(
        title="🏥 État de santé du bot",
        color=color,
        timestamp=datetime.now()
    )

    # Indicateur d'état général
    embed.add_field(
        name="📊 État général",
        value=status_indicator,
        inline=True
    )

    # Statistiques générales
    embed.add_field(
        name="📞 Statistiques d'appels",
        value=f"**⏱️ Uptime**: {stats['uptime_hours']:.1f}h\n"
              f"**📞 Total appels**: {stats['total_calls']}\n"
              f"**✅ Taux de succès**: {stats['success_rate_percent']}%",
        inline=True
    )

    # Statistiques de récupération
    recovery_text = f"**❌ Échecs**: {stats['failed_calls']}\n**🔁 Retries**: {stats['retried_calls']}"
    recovery_text += f"\n**♻️ Récupérés**: {stats['recovered_calls']}\n**📈 Taux de récupération**: {stats['recovery_rate_percent']:.1f}%"

    embed.add_field(
        name="🔄 Récupération d'erreurs",
        value=recovery_text,
        inline=True
    )

    # Erreurs les plus fréquentes (si il y en a)
    if stats['most_common_errors']:
        error_list = "\n".join([f"• **{error}**: {count}" for error, count in stats['most_common_errors']])
        embed.add_field(
            name="🐛 Erreurs les plus fréquentes",
            value=error_list[:1024],  # Limiter la longueur du champ
            inline=False
        )

    # Footer avec informations supplémentaires
    embed.set_footer(text="Statistiques depuis le dernier redémarrage")

    return embed